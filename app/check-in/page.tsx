/// app/check-in/page.tsx — Organizer ticket check-in page
"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useAccount } from "wagmi";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConnectWallet } from "@/components/ConnectWallet";
import { Header } from "@/components/Header";

type CheckInResult = {
  ok: boolean;
  status:
    | "valid"
    | "not_found"
    | "unauthorized"
    | "inactive"
    | "already_checked_in";
  message: string;
  ticketId?: string;
  eventId?: string;
  buyerAddress?: string;
  checkedInAt?: number;
};

export default function CheckInPage() {
  const { address, isConnected } = useAccount();
  const { isSignedIn } = useUser();
  const upsertMe = useMutation(api.users.upsertMe);
  const scanForCheckIn = useMutation(api.tickets.scanForCheckIn);

  const [qrCode, setQrCode] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    void upsertMe({ walletAddress: address ?? undefined });
  }, [address, isSignedIn, upsertMe]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!address || !isSignedIn || !qrCode.trim()) return;

    setLoading(true);
    setResult(null);
    try {
      const response = await scanForCheckIn({
        qrCode: qrCode.trim(),
        organizerAddress: address,
      });
      setResult(response as CheckInResult);
      if (response.ok) setQrCode("");
    } catch (error) {
      setResult({
        ok: false,
        status: "inactive",
        message:
          error instanceof Error ? error.message : "Unable to validate ticket",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-2 text-3xl font-black uppercase tracking-wide">Organizer Check-in</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Scan or paste a ticket QR code to validate entry. This marks valid tickets as checked-in.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Ticket Scanner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isConnected ? (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Connect the organizer wallet to validate tickets.
                </p>
                <ConnectWallet />
              </div>
            ) : !isSignedIn ? (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Sign in with Clerk to validate tickets.
                </p>
                <Button className="w-full" disabled>Sign-in required</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  placeholder="Paste scanned QR code value"
                  value={qrCode}
                  onChange={(e) => setQrCode(e.target.value)}
                />
                <Button type="submit" className="w-full" disabled={loading || !qrCode.trim()}>
                  {loading ? "Validating..." : "Validate Ticket"}
                </Button>
              </form>
            )}

            {result && (
              <div
                className={`border-2 p-4 text-sm ${
                  result.ok
                    ? "border-primary bg-primary/10"
                    : "border-destructive bg-destructive/10"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant={result.ok ? "default" : "destructive"}>
                    {result.status}
                  </Badge>
                  <span className="font-bold">{result.message}</span>
                </div>
                {result.buyerAddress && (
                  <p className="font-mono text-xs">
                    Holder: {result.buyerAddress}
                  </p>
                )}
                {result.ticketId && (
                  <p className="font-mono text-xs">
                    Ticket: {result.ticketId}
                  </p>
                )}
                {result.checkedInAt && (
                  <p className="text-xs font-mono">
                    Checked in at: {new Date(result.checkedInAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
