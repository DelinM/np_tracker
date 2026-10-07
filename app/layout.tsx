import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Outfit } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm",
});

export const metadata: Metadata = {
  title: "Pelosi Portfolio",
  description:
    "Nancy Pelosi's disclosed stock portfolio, reconstructed from U.S. House Clerk periodic transaction reports.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable} ${mono.variable}`}>
      <body className="antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
