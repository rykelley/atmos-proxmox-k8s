import { sql } from "./client.js";

// Idempotent schema bootstrap. Runs on startup so a fresh Supabase database is
// usable without a separate migration job. Safe to run repeatedly.
export async function ensureSchema(): Promise<void> {
  await sql.unsafe(`
    create schema if not exists inventory;

    create table if not exists inventory.spools (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      brand text,
      material text not null,
      color_name text,
      color_hex text not null default '#8b5cf6',
      diameter_mm numeric(4,2) not null default 1.75,
      total_weight_g integer not null default 1000,
      remaining_weight_g integer not null default 1000,
      spool_weight_g integer not null default 0,
      price numeric(10,2),
      currency text not null default 'USD',
      vendor text,
      purchased_at date,
      location text,
      in_drybox boolean not null default false,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists inventory.usage_log (
      id uuid primary key default gen_random_uuid(),
      spool_id uuid not null references inventory.spools(id) on delete cascade,
      grams_used integer not null,
      note text,
      created_at timestamptz not null default now()
    );

    create index if not exists usage_log_spool_id_idx
      on inventory.usage_log (spool_id);
  `);
}
