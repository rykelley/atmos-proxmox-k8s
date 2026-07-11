// Server-only. Base URLs for the backend microservices. In-cluster these are
// the ClusterIP service DNS names; locally they default to localhost ports.
export const CATALOG_URL = process.env.CATALOG_URL ?? "http://localhost:8081";
export const INVENTORY_URL = process.env.INVENTORY_URL ?? "http://localhost:8082";

export async function proxyJson(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const contentType = res.headers.get("content-type") ?? "application/json";
  const body = res.status === 204 ? null : await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "content-type": contentType },
  });
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`request failed: ${url} -> ${res.status}`);
  }
  return (await res.json()) as T;
}
