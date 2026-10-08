import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ActivityTable } from "@/components/ActivityTable";
import { loadSnapshot } from "@/lib/portfolio";
import { LOCALE_COOKIE, readLocale } from "@/lib/locale";
import { politicianBySlug } from "@/lib/politicians";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const politician = politicianBySlug(slug);
  const locale = readLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (!politician) return {};
  return { title: locale === "zh" ? politician.nameZh : politician.name };
}

export default async function MemberActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ticker?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  if (!politicianBySlug(slug)) notFound();
  const snapshot = loadSnapshot(slug);
  if (!snapshot) notFound();
  return <ActivityTable trades={snapshot.trades} initialQuery={query.ticker ?? ""} />;
}
