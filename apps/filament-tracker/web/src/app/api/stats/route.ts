import { INVENTORY_URL, proxyJson } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyJson(`${INVENTORY_URL}/stats`);
}
