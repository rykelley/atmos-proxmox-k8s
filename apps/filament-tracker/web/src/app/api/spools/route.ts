import { INVENTORY_URL, proxyJson } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyJson(`${INVENTORY_URL}/spools`);
}

export async function POST(req: Request) {
  const body = await req.text();
  return proxyJson(`${INVENTORY_URL}/spools`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}
