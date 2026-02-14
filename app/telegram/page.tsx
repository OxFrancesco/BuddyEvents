"use client";

import { useEffect, useMemo, useState } from "react";
import { useSignIn, useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TicketQRCode } from "@/components/TicketQRCode";

type PiResult = {
  ok: boolean;
  intent: string;
  message: string;
  data?: unknown;
  txHash?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTelegramWebAppInitData(
  timeoutMs: number = 3000,
): Promise<TelegramWebApp | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const webApp = (window as TelegramWindow).Telegram?.WebApp;
    if (webApp?.initData) return webApp;
    await sleep(100);
  }
  return null;
}

export default function TelegramMiniAppPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isSignedIn } = useUser();

  const [authStatus, setAuthStatus] = useState("Checking Telegram auth...");
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PiResult | null>(null);
  const [walletInfo, setWalletInfo] = useState<{
    walletAddress?: string;
    balances?: Array<{ token?: { symbol?: string }; amount?: string }>;
  } | null>(null);
  const [buyEventId, setBuyEventId] = useState("");
  const [qrTicketId, setQrTicketId] = useState("");
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [commandInput, setCommandInput] = useState("/events");

  useEffect(() => {
    let ignore = false;

    async function bootstrapAuth() {
      if (!isLoaded) return;
      if (isSignedIn) {
        if (!ignore) setAuthStatus("Signed in");
        return;
      }

      const webApp = await waitForTelegramWebAppInitData();
      if (!webApp) {
        if (!ignore) {
          setAuthError(
            "Telegram WebApp init data not available. Open this page from the bot's Mini App button.",
          );
          setAuthStatus("Auth unavailable");
        }
        return;
      }

      webApp.ready();
      webApp.expand();

      try {
        const authResp = await fetch("/api/telegram/auth/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData: webApp.initData }),
        });
        const authJson = (await authResp.json()) as {
          ok?: boolean;
          ticket?: string;
          error?: string;
        };
        if (!authResp.ok || !authJson.ticket) {
          throw new Error(authJson.error ?? "Telegram auth start failed");
        }

        const signInResult = await signIn?.create({
          strategy: "ticket",
          ticket: authJson.ticket,
        });

        if (signInResult?.status !== "complete" || !signInResult.createdSessionId) {
          throw new Error("Clerk ticket sign-in did not complete");
        }
        await setActive?.({ session: signInResult.createdSessionId });
        if (!ignore) setAuthStatus("Signed in");
      } catch (error) {
        if (!ignore) {
          setAuthError(error instanceof Error ? error.message : "Auth failed");
          setAuthStatus("Auth failed");
        }
      }
    }

    void bootstrapAuth();
    return () => {
      ignore = true;
    };
  }, [isLoaded, isSignedIn, setActive, signIn]);

  const canRunActions = useMemo(
    () => authStatus === "Signed in" && !authError,
    [authError, authStatus],
  );

  async function runPi(rawInput: string, args?: Record<string, unknown>) {
    setBusy(true);
    setQrToken(null);
    try {
      const resp = await fetch("/api/pi/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "telegram_mini_app",
          rawInput,
          args,
        }),
      });
      const json = (await resp.json()) as PiResult;
      setResult(json);
    } finally {
      setBusy(false);
    }
  }

  async function connectWallet() {
    setBusy(true);
    try {
      const resp = await fetch("/api/pi/wallet/connect", { method: "POST" });
      const json = (await resp.json()) as {
        ok?: boolean;
        wallet?: { walletAddress?: string };
        error?: string;
      };
      if (!resp.ok || !json.ok) {
        throw new Error(json.error ?? "Wallet connection failed");
      }
      await refreshWalletBalance();
    } catch (error) {
      setResult({
        ok: false,
        intent: "connect_wallet",
        message: error instanceof Error ? error.message : "Wallet connection failed",
      });
    } finally {
      setBusy(false);
    }
  }

  async function refreshWalletBalance() {
    const resp = await fetch("/api/pi/wallet/balance");
    const json = (await resp.json()) as {
      ok?: boolean;
      wallet?: { walletAddress?: string };
      balances?: Array<{ token?: { symbol?: string }; amount?: string }>;
      error?: string;
    };
    if (resp.ok && json.ok) {
      setWalletInfo({
        walletAddress: json.wallet?.walletAddress,
        balances: json.balances,
      });
    } else {
      setWalletInfo(null);
    }
  }

  async function loadQr() {
    if (!qrTicketId.trim()) return;
    setBusy(true);
    try {
      const resp = await fetch(`/api/pi/qr?ticketId=${encodeURIComponent(qrTicketId.trim())}`);
      const json = (await resp.json()) as {
        ok?: boolean;
        qr?: { token?: string };
        error?: string;
      };
      if (!resp.ok || !json.ok || !json.qr?.token) {
        throw new Error(json.error ?? "Unable to load QR");
      }
      setQrToken(json.qr.token);
    } catch (error) {
      setResult({
        ok: false,
        intent: "get_event_qr",
        message: error instanceof Error ? error.message : "QR fetch failed",
      });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (canRunActions) {
      void refreshWalletBalance();
    }
  }, [canRunActions]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <header className="space-y-2">
          <Badge variant="secondary">Telegram Mini App</Badge>
          <h1 className="text-3xl font-black uppercase tracking-widest">BuddyEvents PI Agent</h1>
          <p className="text-sm text-muted-foreground">
            Auth status: <span className="font-mono font-bold text-foreground">{authStatus}</span>
          </p>
          {authError && <p className="text-sm text-destructive font-mono">{authError}</p>}
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button disabled={!canRunActions || busy} onClick={() => void runPi("/events")}>
                Find Events
              </Button>
              <Button disabled={!canRunActions || busy} onClick={() => void runPi("/tickets")}>
                Find Tickets
              </Button>
              <Button disabled={!canRunActions || busy} onClick={() => void connectWallet()}>
                Connect Circle Wallet
              </Button>
              <Button
                disabled={!canRunActions || busy || !buyEventId.trim()}
                onClick={() =>
                  void runPi(`/buy ${buyEventId.trim()}`, { eventId: buyEventId.trim() })
                }
              >
                Buy Ticket
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Wallet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground uppercase text-xs tracking-wider">Address:</span>{" "}
                <span className="font-mono text-xs break-all">
                  {walletInfo?.walletAddress ?? "Not connected"}
                </span>
              </p>
              <div className="space-y-1">
                {(walletInfo?.balances ?? []).slice(0, 5).map((balance, index) => (
                  <p key={index} className="font-mono text-xs">
                    {(balance.token?.symbol ?? "TOKEN")}: {balance.amount ?? "0"}
                  </p>
                ))}
              </div>
              <Label htmlFor="buyEventId">Buy by Event ID</Label>
              <Input
                id="buyEventId"
                placeholder="Convex event id"
                value={buyEventId}
                onChange={(e) => setBuyEventId(e.target.value)}
              />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Command Box</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="/events | /tickets | /buy <eventId> | /qr <ticketId>"
              />
              <Button
                disabled={!canRunActions || busy || !commandInput.trim()}
                onClick={() => void runPi(commandInput.trim())}
              >
                Execute Command
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ticket QR</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="qrTicketId">Ticket ID</Label>
              <Input
                id="qrTicketId"
                placeholder="Convex ticket id"
                value={qrTicketId}
                onChange={(e) => setQrTicketId(e.target.value)}
              />
              <Button disabled={!canRunActions || busy || !qrTicketId.trim()} onClick={() => void loadQr()}>
                Generate QR Token
              </Button>
              {qrToken && (
                <div className="space-y-2">
                  <TicketQRCode value={qrToken} />
                  <p className="font-mono text-[10px] break-all text-muted-foreground">{qrToken}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Agent Output</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap border-2 border-foreground bg-background p-3 text-xs font-mono">
                {JSON.stringify(result, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
