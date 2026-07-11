import { CATALOG_URL, proxyJson } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyJson(`${CATALOG_URL}/materials`);
}

export async function POST(req: Request) {
  const body = await req.text();
  return proxyJson(`${CATALOG_URL}/materials`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}
