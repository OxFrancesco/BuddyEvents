"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConnectWallet } from "@/components/ConnectWallet";
import { MonadFaucetButton } from "@/components/MonadFaucetButton";
import { SignedIn } from "@clerk/nextjs";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b-2 border-foreground bg-background">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.svg" alt="BuddyEvents" width={36} height={36} />
          <span className="text-xl font-black uppercase tracking-widest">
            BuddyEvents
          </span>
          <Badge variant="outline" className="text-[10px]">
            Monad
          </Badge>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/events">
            <Button variant="ghost" size="sm">Events</Button>
          </Link>
          <Link href="/tickets">
            <Button variant="ghost" size="sm">My Tickets</Button>
          </Link>
          <Link href="/create">
            <Button variant="ghost" size="sm">Create</Button>
          </Link>
          <Link href="/check-in">
            <Button variant="ghost" size="sm">Check-in</Button>
          </Link>
          <MonadFaucetButton />
          <ConnectWallet />
        </nav>
      </div>
    </header>
  );
}
