import { sql } from "./client.js";

// Idempotent schema bootstrap. Runs on startup so a fresh Supabase database is
// usable without a separate migration job. Safe to run repeatedly.
export async function ensureSchema(): Promise<void> {
  await sql.unsafe(`
    create schema if not exists catalog;

    create table if not exists catalog.materials (
      id uuid primary key default gen_random_uuid(),
      name text not null unique,
      description text,
      created_at timestamptz not null default now()
    );

    create table if not exists catalog.brands (
      id uuid primary key default gen_random_uuid(),
      name text not null unique,
      website text,
      created_at timestamptz not null default now()
    );

    create table if not exists catalog.colors (
      id uuid primary key default gen_random_uuid(),
      name text not null unique,
      hex text not null,
      created_at timestamptz not null default now()
    );
  `);

  await seedDefaults();
}

const DEFAULT_MATERIALS: Array<[string, string]> = [
  ["PLA", "Polylactic acid - easy to print, low temp, rigid."],
  ["PETG", "Glycol-modified PET - tough, mild flexibility, food-safe grades."],
  ["ABS", "Acrylonitrile butadiene styrene - strong, heat resistant, needs enclosure."],
  ["ASA", "UV/weather resistant alternative to ABS."],
  ["TPU", "Thermoplastic polyurethane - flexible, elastic."],
  ["Nylon", "Polyamide - durable, abrasion resistant, hygroscopic."],
  ["PC", "Polycarbonate - very strong, high temp."],
];

async function seedDefaults(): Promise<void> {
  const [{ count }] = await sql<{ count: string }[]>`
    select count(*)::text as count from catalog.materials
  `;
  if (Number(count) > 0) return;

  for (const [name, description] of DEFAULT_MATERIALS) {
    await sql`
      insert into catalog.materials (name, description)
      values (${name}, ${description})
      on conflict (name) do nothing
    `;
  }
}
