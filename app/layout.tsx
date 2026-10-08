import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Outfit } from "next/font/google";
import { cookies } from "next/headers";
import { Shell } from "@/components/Shell";
import { LocaleProvider } from "@/lib/i18n";
import { LOCALE_COOKIE, readLocale } from "@/lib/locale";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = readLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (locale === "zh") {
    return {
      title: { default: "披露账本", template: "%s · 披露账本" },
      description: "根据官方定期交易报告还原的国会披露持仓。",
    };
  }
  return {
    title: { default: "Disclosed books", template: "%s · Disclosed books" },
    description: "Congressional portfolios reconstructed from official periodic transaction reports.",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = readLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} className={`${outfit.variable} ${fraunces.variable} ${mono.variable}`}>
      <body className="antialiased">
        <LocaleProvider initial={locale}>
          <Shell>{children}</Shell>
        </LocaleProvider>
      </body>
    </html>
  );
}
