import { INVENTORY_URL, proxyJson } from "@/lib/services";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return proxyJson(`${INVENTORY_URL}/spools/${id}/usage`);
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.text();
  return proxyJson(`${INVENTORY_URL}/spools/${id}/usage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}
