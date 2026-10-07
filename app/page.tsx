import { Dashboard } from "@/components/Dashboard";
import { snapshot } from "@/lib/snapshot";

export default function HomePage() {
  return <Dashboard snapshot={snapshot} />;
}
