import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Dashboard } from "@/components/Dashboard";
import { loadSnapshot } from "@/lib/portfolio";
import { LOCALE_COOKIE, readLocale } from "@/lib/locale";
import { politicianBySlug, politicians } from "@/lib/politicians";

export function generateStaticParams() {
  return politicians.map((member) => ({ slug: member.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const politician = politicianBySlug(slug);
  const locale = readLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (!politician) return {};
  return { title: locale === "zh" ? politician.nameZh : politician.name };
}

export default async function MemberPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const politician = politicianBySlug(slug);
  if (!politician) notFound();
  const snapshot = loadSnapshot(slug);
  if (!snapshot) {
    return <p className="text-sm text-muted">Filings for {politician.name} are still being pulled.</p>;
  }
  return <Dashboard snapshot={snapshot} base={`/${slug}`} />;
}
