import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, sql } from "./db/client.js";
import { spools, usageLog } from "./db/schema.js";

const spoolCreate = z.object({
  name: z.string().min(1).max(120),
  brand: z.string().max(80).optional(),
  material: z.string().min(1).max(80),
  colorName: z.string().max(80).optional(),
  colorHex: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .default("#8b5cf6"),
  diameterMm: z.coerce.number().positive().max(10).default(1.75),
  totalWeightG: z.coerce.number().int().positive().max(100000).default(1000),
  remainingWeightG: z.coerce.number().int().min(0).max(100000).optional(),
  spoolWeightG: z.coerce.number().int().min(0).max(100000).default(0),
  price: z.coerce.number().min(0).max(100000).optional(),
  currency: z.string().length(3).default("USD"),
  vendor: z.string().max(120).optional(),
  purchasedAt: z.string().date().optional(),
  location: z.string().max(120).optional(),
  inDrybox: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
});

const spoolUpdate = spoolCreate.partial();

const usageCreate = z.object({
  gramsUsed: z.coerce.number().int().positive().max(100000),
  note: z.string().max(500).optional(),
});

const idParam = z.object({ id: z.string().uuid() });

// numeric columns come back as strings from postgres; normalize for the client.
function serialize(row: Record<string, unknown>) {
  return {
    ...row,
    diameterMm: row.diameterMm != null ? Number(row.diameterMm) : row.diameterMm,
    price: row.price != null ? Number(row.price) : null,
  };
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/spools", async () => {
    const rows = await db.select().from(spools).orderBy(desc(spools.updatedAt));
    return rows.map(serialize);
  });

  app.get("/spools/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db.select().from(spools).where(eq(spools.id, id));
    if (!row) return reply.code(404).send({ error: "not_found" });
    return serialize(row);
  });

  app.post("/spools", async (req, reply) => {
    const body = spoolCreate.parse(req.body);
    const remaining = body.remainingWeightG ?? body.totalWeightG;
    const [row] = await db
      .insert(spools)
      .values({
        name: body.name,
        brand: body.brand,
        material: body.material,
        colorName: body.colorName,
        colorHex: body.colorHex,
        diameterMm: String(body.diameterMm),
        totalWeightG: body.totalWeightG,
        remainingWeightG: remaining,
        spoolWeightG: body.spoolWeightG,
        price: body.price != null ? String(body.price) : null,
        currency: body.currency,
        vendor: body.vendor,
        purchasedAt: body.purchasedAt,
        location: body.location,
        inDrybox: body.inDrybox,
        notes: body.notes,
      })
      .returning();
    return reply.code(201).send(serialize(row));
  });

  app.patch("/spools/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = spoolUpdate.parse(req.body);
    const patch: Partial<typeof spools.$inferInsert> = { updatedAt: new Date() };
    if (b.name !== undefined) patch.name = b.name;
    if (b.brand !== undefined) patch.brand = b.brand;
    if (b.material !== undefined) patch.material = b.material;
    if (b.colorName !== undefined) patch.colorName = b.colorName;
    if (b.colorHex !== undefined) patch.colorHex = b.colorHex;
    if (b.diameterMm !== undefined) patch.diameterMm = String(b.diameterMm);
    if (b.totalWeightG !== undefined) patch.totalWeightG = b.totalWeightG;
    if (b.remainingWeightG !== undefined) patch.remainingWeightG = b.remainingWeightG;
    if (b.spoolWeightG !== undefined) patch.spoolWeightG = b.spoolWeightG;
    if (b.price !== undefined) patch.price = String(b.price);
    if (b.currency !== undefined) patch.currency = b.currency;
    if (b.vendor !== undefined) patch.vendor = b.vendor;
    if (b.purchasedAt !== undefined) patch.purchasedAt = b.purchasedAt;
    if (b.location !== undefined) patch.location = b.location;
    if (b.inDrybox !== undefined) patch.inDrybox = b.inDrybox;
    if (b.notes !== undefined) patch.notes = b.notes;

    const [row] = await db
      .update(spools)
      .set(patch)
      .where(eq(spools.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found" });
    return serialize(row);
  });

  app.delete("/spools/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await db.delete(spools).where(eq(spools.id, id));
    return reply.code(204).send();
  });

  // Log filament usage and atomically decrement remaining weight (clamped >=0).
  app.post("/spools/:id/usage", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = usageCreate.parse(req.body);

    const result = await db.transaction(async (tx) => {
      const [spool] = await tx.select().from(spools).where(eq(spools.id, id));
      if (!spool) return null;
      const next = Math.max(0, spool.remainingWeightG - body.gramsUsed);
      await tx.insert(usageLog).values({ spoolId: id, gramsUsed: body.gramsUsed, note: body.note });
      const [updated] = await tx
        .update(spools)
        .set({ remainingWeightG: next, updatedAt: new Date() })
        .where(eq(spools.id, id))
        .returning();
      return updated;
    });

    if (!result) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send(serialize(result));
  });

  app.get("/spools/:id/usage", async (req) => {
    const { id } = idParam.parse(req.params);
    return db.select().from(usageLog).where(eq(usageLog.spoolId, id)).orderBy(desc(usageLog.createdAt));
  });

  // Dashboard aggregates. lowStock = remaining < 15% of total weight.
  app.get("/stats", async () => {
    const [totals] = await sql<
      { total_spools: string; total_remaining_g: string; total_value: string; low_stock: string }[]
    >`
      select
        count(*)::text as total_spools,
        coalesce(sum(remaining_weight_g), 0)::text as total_remaining_g,
        coalesce(sum(price), 0)::text as total_value,
        coalesce(sum(case when remaining_weight_g < total_weight_g * 0.15 then 1 else 0 end), 0)::text as low_stock
      from inventory.spools
    `;

    const byMaterial = await sql<
      { material: string; count: string; remaining_g: string }[]
    >`
      select material,
             count(*)::text as count,
             coalesce(sum(remaining_weight_g), 0)::text as remaining_g
      from inventory.spools
      group by material
      order by remaining_g desc
    `;

    return {
      totalSpools: Number(totals.total_spools),
      totalRemainingG: Number(totals.total_remaining_g),
      totalValue: Number(totals.total_value),
      lowStock: Number(totals.low_stock),
      byMaterial: byMaterial.map((m) => ({
        material: m.material,
        count: Number(m.count),
        remainingG: Number(m.remaining_g),
      })),
    };
  });
}
