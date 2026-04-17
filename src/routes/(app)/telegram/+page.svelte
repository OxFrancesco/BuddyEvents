<script lang="ts">
  import { getClerkContext } from "$lib/stores/clerk.svelte";
  import { DEFAULT_CHAIN_KEY, SUPPORTED_CHAINS, type SupportedChainKey } from "@/lib/chains";
  import TicketQRCode from "$lib/components/TicketQRCode.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import CardContent from "$lib/components/ui/CardContent.svelte";
  import CardHeader from "$lib/components/ui/CardHeader.svelte";
  import CardTitle from "$lib/components/ui/CardTitle.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Label from "$lib/components/ui/Label.svelte";

  type PiResult = {
    ok: boolean;
    intent: string;
    message: string;
    data?: unknown;
    txHash?: string;
  };

  const clerkContext = getClerkContext();

  let authStatus = $state("Checking Telegram auth...");
  let authError = $state<string | null>(null);
  let busy = $state(false);
  let result = $state<PiResult | null>(null);
  let walletInfo = $state<{
    chainKey?: SupportedChainKey;
    walletAddress?: string;
    balances?: Array<{ token?: { symbol?: string }; amount?: string }>;
  } | null>(null);
  let chainKey = $state<SupportedChainKey>(DEFAULT_CHAIN_KEY);
  let buyEventId = $state("");
  let qrTicketId = $state("");
  let qrToken = $state<string | null>(null);
  let commandInput = $state("/events");

  const isSignedIn = $derived(Boolean(clerkContext.currentSession));
  const canRunActions = $derived(authStatus === "Signed in" && !authError);

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForTelegramWebAppInitData(timeoutMs = 3000): Promise<TelegramWebApp | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const webApp = (window as TelegramWindow).Telegram?.WebApp;
      if (webApp?.initData) return webApp;
      await sleep(100);
    }
    return null;
  }

  async function bootstrapAuth() {
    if (isSignedIn) {
      authStatus = "Signed in";
      return;
    }

    const webApp = await waitForTelegramWebAppInitData();
    if (!webApp) {
      authError =
        "Telegram WebApp init data not available. Open this page from the bot's Mini App button.";
      authStatus = "Auth unavailable";
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

      const signInClient = clerkContext.clerk.client?.signIn;
      if (!signInClient) {
        throw new Error("Clerk sign-in client unavailable");
      }

      const signInResult = await signInClient.create({
        strategy: "ticket",
        ticket: authJson.ticket,
      });

      if (signInResult.status !== "complete" || !signInResult.createdSessionId) {
        throw new Error("Clerk ticket sign-in did not complete");
      }

      await clerkContext.clerk.setActive({ session: signInResult.createdSessionId });
      authStatus = "Signed in";
      authError = null;
    } catch (error) {
      authError = error instanceof Error ? error.message : "Auth failed";
      authStatus = "Auth failed";
    }
  }

  async function runPi(rawInput: string, args?: Record<string, unknown>) {
    busy = true;
    qrToken = null;
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
      result = (await resp.json()) as PiResult;
    } finally {
      busy = false;
    }
  }

  async function refreshWalletBalance() {
    const resp = await fetch(`/api/pi/wallet/balance?chainKey=${chainKey}`);
    const json = (await resp.json()) as {
      ok?: boolean;
      chainKey?: SupportedChainKey;
      wallet?: { walletAddress?: string };
      balances?: Array<{ token?: { symbol?: string }; amount?: string }>;
    };
    if (resp.ok && json.ok) {
      walletInfo = {
        chainKey: json.chainKey,
        walletAddress: json.wallet?.walletAddress,
        balances: json.balances,
      };
    } else {
      walletInfo = null;
    }
  }

  async function connectWallet() {
    busy = true;
    try {
      const resp = await fetch("/api/pi/wallet/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chainKey }),
      });
      const json = (await resp.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!resp.ok || !json.ok) {
        throw new Error(json.error ?? "Wallet connection failed");
      }
      await refreshWalletBalance();
    } catch (error) {
      result = {
        ok: false,
        intent: "connect_wallet",
        message: error instanceof Error ? error.message : "Wallet connection failed",
      };
    } finally {
      busy = false;
    }
  }

  async function loadQr() {
    if (!qrTicketId.trim()) return;
    busy = true;
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
      qrToken = json.qr.token;
    } catch (error) {
      result = {
        ok: false,
        intent: "get_event_qr",
        message: error instanceof Error ? error.message : "QR fetch failed",
      };
    } finally {
      busy = false;
    }
  }

  $effect(() => {
    if (!clerkContext.isClerkLoaded) return;
    void bootstrapAuth();
  });

  $effect(() => {
    if (canRunActions) {
      void refreshWalletBalance();
    }
  });
</script>

<svelte:head>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
</svelte:head>

<div class="min-h-[calc(100vh-4rem)] bg-background text-foreground">
  <main class="mx-auto max-w-4xl space-y-6 px-4 py-8">
    <header class="space-y-2">
      <Badge variant="secondary">Telegram Mini App</Badge>
      <h1 class="text-3xl font-black uppercase tracking-widest">BuddyEvents PI Agent</h1>
      <p class="text-sm text-muted-foreground">
        Auth status: <span class="font-mono font-bold text-foreground">{authStatus}</span>
      </p>
      {#if authError}
        <p class="font-mono text-sm text-destructive">{authError}</p>
      {/if}
    </header>

    <section class="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent class="grid gap-3">
          <Button disabled={!canRunActions || busy} onclick={() => void runPi("/events")}>
            Find Events
          </Button>
          <Button disabled={!canRunActions || busy} onclick={() => void runPi("/tickets")}>
            Find Tickets
          </Button>
          <Button disabled={!canRunActions || busy} onclick={() => void connectWallet()}>
            Connect Circle Wallet
          </Button>
          <Button
            disabled={!canRunActions || busy || !buyEventId.trim()}
            onclick={() => void runPi(`/buy ${buyEventId.trim()}`, { eventId: buyEventId.trim() })}
          >
            Buy Ticket
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wallet</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3 text-sm">
          <div class="space-y-2">
            <Label for="walletChain">Chain</Label>
            <select
              bind:value={chainKey}
              class="h-10 w-full border-2 border-foreground bg-background px-3 text-sm font-medium"
              id="walletChain"
            >
              {#each SUPPORTED_CHAINS as chain (chain.key)}
                <option value={chain.key}>{chain.displayName}</option>
              {/each}
            </select>
          </div>
          <p>
            <span class="text-xs uppercase tracking-wider text-muted-foreground">Address:</span>
            <span class="break-all font-mono text-xs">
              {walletInfo?.walletAddress ?? "Not connected"}
            </span>
          </p>
          <p>
            <span class="text-xs uppercase tracking-wider text-muted-foreground">Selected:</span>
            <span class="break-all font-mono text-xs">{walletInfo?.chainKey ?? chainKey}</span>
          </p>
          <div class="space-y-1">
            {#each (walletInfo?.balances ?? []).slice(0, 5) as balance, index (index)}
              <p class="font-mono text-xs">
                {balance.token?.symbol ?? "TOKEN"}: {balance.amount ?? "0"}
              </p>
            {/each}
          </div>
          <Label for="buyEventId">Buy by Event ID</Label>
          <Input bind:value={buyEventId} id="buyEventId" placeholder="Convex event id" />
        </CardContent>
      </Card>
    </section>

    <section class="grid gap-4 md:grid-cols-2">
      <Card class="md:col-span-2">
        <CardHeader>
          <CardTitle>Command Box</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <Input
            bind:value={commandInput}
            placeholder="/events | /tickets | /buy <eventId> | /qr <ticketId>"
          />
          <Button
            disabled={!canRunActions || busy || !commandInput.trim()}
            onclick={() => void runPi(commandInput.trim())}
          >
            Execute Command
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ticket QR</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <Label for="qrTicketId">Ticket ID</Label>
          <Input bind:value={qrTicketId} id="qrTicketId" placeholder="Convex ticket id" />
          <Button
            disabled={!canRunActions || busy || !qrTicketId.trim()}
            onclick={() => void loadQr()}
          >
            Generate QR Token
          </Button>
          {#if qrToken}
            <div class="space-y-2">
              <TicketQRCode value={qrToken} />
              <p class="break-all font-mono text-[10px] text-muted-foreground">{qrToken}</p>
            </div>
          {/if}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent Output</CardTitle>
        </CardHeader>
        <CardContent>
          <pre class="max-h-96 overflow-auto whitespace-pre-wrap border-2 border-foreground bg-background p-3 text-xs font-mono">
{JSON.stringify(result, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </section>
  </main>
</div>
