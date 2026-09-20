import type { Metadata } from "next";
import { Zalando_Sans, Zalando_Sans_Expanded, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const zalandoSansExpanded = Zalando_Sans_Expanded({
  variable: "--font-zalando-sans-expanded",
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

const zalandoSans = Zalando_Sans({
  variable: "--font-zalando-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Otolith",
  description:
    "Otolith is an on-chain, non-custodial portfolio auto-rebalancer for Stellar.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${zalandoSansExpanded.variable} ${zalandoSans.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full bg-surface font-sans text-text antialiased">
        {children}
      </body>
    </html>
  );
}
