import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// prepare:false is required for the Supabase transaction pooler (port 6543),
// which does not support prepared statements. A small pool keeps us well under
// the pooler's connection limits when several replicas run.
export const sql = postgres(connectionString, { max: 5, prepare: false });
export const db = drizzle(sql, { schema });
