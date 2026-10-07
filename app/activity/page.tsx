import { ActivityTable } from "@/components/ActivityTable";
import { snapshot } from "@/lib/snapshot";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const params = await searchParams;
  return <ActivityTable trades={snapshot.trades} initialQuery={params.ticker ?? ""} />;
}
