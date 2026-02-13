/// app/layout.tsx — Root layout with Clerk + Convex + Wagmi providers
import type { Metadata } from "next";
import { Montserrat, Source_Code_Pro, Playfair_Display } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { Web3Provider } from "@/components/Web3Provider";
import { ClerkProvider } from "@clerk/nextjs";

const montserrat = Montserrat({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
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
    <html lang="en" className="dark">
      <body
        className={`${montserrat.variable} ${sourceCodePro.variable} ${playfairDisplay.variable} antialiased`}
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
