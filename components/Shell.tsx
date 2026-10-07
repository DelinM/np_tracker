"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { snapshot } from "@/lib/snapshot";

const links = [
  { href: "/", label: "Portfolio" },
  { href: "/activity", label: "Activity" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { member, asOf } = snapshot;

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-5 pb-16 pt-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-gold">Disclosed book</p>
          <h1 className="mt-1 font-serif text-3xl tracking-tight text-cream sm:text-4xl">{member.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {member.chamber}
            {member.district ? ` · ${member.district}` : ""} · marked {asOf}
          </p>
        </div>
        <nav className="flex gap-1 rounded-full border border-line bg-panel/80 p-1">
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
      </header>
      <main className="pt-8">{children}</main>
      <footer className="mt-16 max-w-3xl text-xs leading-5 text-muted">
        Built from public{" "}
        <a className="text-gold underline-offset-2 hover:underline" href={snapshot.source.url}>
          {snapshot.source.name}
        </a>{" "}
        periodic transaction reports. Filings report dollar ranges, not a brokerage blotter, and they can
        arrive weeks after the trade. Share counts use the filing text when it states them; otherwise they are
        estimated from the midpoint of the range. A trade restated on a later report is counted once. This is a
        personal reconstruction, not an official account.
      </footer>
    </div>
  );
}
