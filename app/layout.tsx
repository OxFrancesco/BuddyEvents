/// app/layout.tsx — Root layout with Clerk + Convex + Wagmi providers
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { Web3Provider } from "@/components/Web3Provider";
import { ClerkProvider } from "@clerk/nextjs";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BuddyEvents — Agent-Native Event Ticketing",
  description:
    "Buy, sell, create and manage event tickets with AI agents on Monad. Powered by x402 payments and NFT tickets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClerkProvider dynamic>
          <ConvexClientProvider>
            <Web3Provider>{children}</Web3Provider>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
