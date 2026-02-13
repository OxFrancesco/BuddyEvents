"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type CheckInResponse = {
  ok: boolean;
  status: "valid" | "invalid" | "expired" | "already_checked_in";
  message: string;
  ticketId?: string;
  eventId?: string;
  checkedInAt?: number;
  error?: string;
};

export default function AdminCheckinPage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckInResponse | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/checkin/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });

      const payload = (await response.json()) as CheckInResponse;
      setResult(payload);
      if (response.ok && payload.ok) {
        setToken("");
      }
    } catch (error) {
      setResult({
        ok: false,
        status: "invalid",
        message:
          error instanceof Error ? error.message : "Unable to validate token",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-widest">Admin Check-in</h1>
            <p className="text-sm text-muted-foreground">
              Validate QR token payloads and mark tickets as checked-in.
            </p>
          </div>
          <Link href="/admin/events">
            <Button variant="outline">Admin Events</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Scan or Paste QR Token</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-3" onSubmit={onSubmit}>
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="be_qr_..."
                autoComplete="off"
              />
              <Button type="submit" className="w-full" disabled={loading || !token.trim()}>
                {loading ? "Validating..." : "Validate Check-in"}
              </Button>
            </form>

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
                {result.ticketId && (
                  <p className="font-mono text-xs">Ticket: {result.ticketId}</p>
                )}
                {result.eventId && (
                  <p className="font-mono text-xs">Event: {result.eventId}</p>
                )}
                {result.checkedInAt && (
                  <p className="text-xs font-mono">
                    Checked in at: {new Date(result.checkedInAt).toLocaleString()}
                  </p>
                )}
                {result.error && <p className="text-xs font-mono">{result.error}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
