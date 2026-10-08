import { Directory } from "@/components/Directory";
import { loadCards } from "@/lib/portfolio";

export default function HomePage() {
  return <Directory cards={loadCards()} />;
}
