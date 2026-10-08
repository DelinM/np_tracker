"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n, type Locale } from "@/lib/i18n";
import { politicianBySlug } from "@/lib/politicians";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { locale, setLocale, copy } = useI18n();
  const slug = path.split("/").filter(Boolean)[0] ?? "";
  const onAlerts = path.startsWith("/alerts");
  const politician = onAlerts ? null : politicianBySlug(slug);
  const base = politician ? `/${politician.slug}` : "";
  const languages: Array<{ id: Locale; label: string }> = [
    { id: "en", label: "EN" },
    { id: "zh", label: "中文" },
  ];
  const links = politician
    ? [
        { href: "/", label: copy.allMembers },
        { href: base, label: copy.nav.portfolio },
        { href: `${base}/activity`, label: copy.nav.activity },
        { href: "/alerts", label: copy.alerts },
      ]
    : [
        { href: "/", label: copy.allMembers },
        { href: "/alerts", label: copy.alerts },
      ];
  const source = politician?.chamber === "senate"
    ? { name: locale === "zh" ? "美国参议院财务披露" : "U.S. Senate Financial Disclosures", url: "https://efdsearch.senate.gov/search/" }
    : { name: copy.sourceName, url: "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/" };

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-5 pb-16 pt-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-gold">
            {politician ? copy.brand : copy.directoryEyebrow}
          </p>
          <h1 className="mt-1 font-serif text-3xl tracking-tight text-cream sm:text-4xl">
            {politician ? (locale === "zh" ? politician.nameZh : politician.name) : onAlerts ? copy.alertsTitle : copy.directoryTitle}
          </h1>
          {politician ? (
            <p className="mt-1 text-sm text-muted">
              {politician.chamber === "senate" ? copy.senate : copy.house}
              {politician.district ? ` · ${politician.district}` : ""}
              {politician.party ? ` · ${politician.party}` : ""}
            </p>
          ) : onAlerts ? null : (
            <p className="mt-1 max-w-xl text-sm text-muted">{copy.directoryNote}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full border border-line bg-panel/80 p-1" role="group" aria-label={copy.language}>
            {languages.map((language) => (
              <button
                key={language.id}
                type="button"
                aria-pressed={locale === language.id}
                onClick={() => setLocale(language.id)}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  locale === language.id ? "bg-cream text-ink" : "text-muted hover:text-cream"
                }`}
              >
                {language.label}
              </button>
            ))}
          </div>
          <nav className="flex flex-wrap gap-1 rounded-full border border-line bg-panel/80 p-1">
            {links.map((link) => {
              const active = path === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full px-4 py-1.5 text-sm transition ${
                    active ? "bg-cream text-ink" : "text-muted hover:text-cream"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="pt-8">{children}</main>
      <footer className="mt-16 max-w-3xl text-xs leading-5 text-muted">
        {copy.footerLead}{" "}
        <a className="text-gold underline-offset-2 hover:underline" href={source.url}>
          {source.name}
        </a>{" "}
        {copy.footerBody}
      </footer>
    </div>
  );
}
