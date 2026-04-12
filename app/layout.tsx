/// app/layout.tsx — Root layout with Clerk + Convex + Wagmi providers
import type { Metadata } from "next";
import { Montserrat, Source_Code_Pro, Playfair_Display } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { CrossmintProvider } from "@/components/CrossmintProvider";
import { UserWalletSync } from "@/components/UserWalletSync";
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
    "Buy, sell, create and manage event tickets with AI agents on Monad Testnet and Base Mainnet. Powered by x402 payments and NFT tickets.",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const crossmintClientApiKey = process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY;
  const crossmintJwtTemplate = process.env.CLERK_CROSSMINT_JWT_TEMPLATE ?? "crossmint";

  return (
    <html lang="en" className="dark">
      <body
        className={`${montserrat.variable} ${sourceCodePro.variable} ${playfairDisplay.variable} antialiased`}
      >
        <ClerkProvider dynamic>
          <ConvexClientProvider>
            <CrossmintProvider
              apiKey={crossmintClientApiKey}
              jwtTemplate={crossmintJwtTemplate}
            >
              <Web3Provider>
                <UserWalletSync />
                {children}
              </Web3Provider>
            </CrossmintProvider>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
