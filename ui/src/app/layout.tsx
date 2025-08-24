import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { WalletProvider } from '@/contexts/WalletContext';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SEI Solar - Decentralized EV Charging Network",
  description: "Power your journey with SEI Solar's blockchain-based EV charging stations. Earn, charge, and contribute to a sustainable future.",
  keywords: "blockchain, EV charging, solar power, SEI, cryptocurrency, sustainable energy",
  authors: [{ name: "SEI Solar Team" }],
  openGraph: {
    title: "SEI Solar - Decentralized EV Charging Network",
    description: "Power your journey with SEI Solar's blockchain-based EV charging stations",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
