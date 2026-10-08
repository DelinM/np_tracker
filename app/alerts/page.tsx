"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";

export default function AlertsPage() {
  const { copy } = useI18n();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [configured, setConfigured] = useState(true);
  const [linked, setLinked] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(copy.phoneLabel);
      return;
    }
    setCode(body.code);
    setUrl(body.url);
    setConfigured(body.configured);
    setLinked(body.linked);
    if (body.url) window.open(body.url, "_blank", "noopener,noreferrer");
  }

  async function check() {
    const response = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });
    const body = await response.json();
    setLinked(Boolean(body.linked));
    setConfigured(body.configured);
  }

  return (
    <section className="max-w-xl">
      <h2 className="font-serif text-4xl">{copy.alertsTitle}</h2>
      <p className="mt-3 text-sm leading-6 text-muted">{copy.alertsLead}</p>
      <h3 className="mt-8 text-sm uppercase tracking-[0.16em] text-gold">{copy.alertsIncludesTitle}</h3>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
        {copy.alertsIncludes.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block text-sm">
          <span className="text-muted">{copy.phoneLabel}</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={copy.phonePlaceholder}
            className="mt-2 w-full rounded-full border border-line bg-panel px-4 py-2 text-cream"
            inputMode="tel"
            required
          />
        </label>
        <button type="submit" className="rounded-full bg-cream px-4 py-2 text-sm text-ink">
          {copy.openBot}
        </button>
      </form>
      {error ? <p className="mt-4 text-sm text-down">{error}</p> : null}
      {!configured && code ? <p className="mt-4 text-sm text-gold">{copy.botMissing}</p> : null}
      {url ? (
        <div className="mt-6 space-y-3 text-sm">
          <a href={url} target="_blank" rel="noreferrer" className="text-gold hover:underline">
            {url}
          </a>
          <div>
            <button type="button" onClick={check} className="rounded-full border border-line px-4 py-2 text-cream">
              {copy.checkBot}
            </button>
          </div>
          <p className={linked ? "text-up" : "text-muted"}>{linked ? copy.linked : copy.notLinked}</p>
        </div>
      ) : null}
    </section>
  );
}
