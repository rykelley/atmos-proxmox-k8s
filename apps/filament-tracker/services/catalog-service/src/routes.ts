import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db/client.js";
import { brands, colors, materials } from "./db/schema.js";

const materialInput = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
});

const brandInput = z.object({
  name: z.string().min(1).max(80),
  website: z.string().url().max(300).optional(),
});

const colorInput = z.object({
  name: z.string().min(1).max(80),
  hex: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "hex must be like #RRGGBB"),
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/materials", async () => db.select().from(materials).orderBy(asc(materials.name)));

  app.post("/materials", async (req, reply) => {
    const body = materialInput.parse(req.body);
    const [row] = await db.insert(materials).values(body).returning();
    return reply.code(201).send(row);
  });

  app.delete("/materials/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.delete(materials).where(eq(materials.id, id));
    return reply.code(204).send();
  });

  app.get("/brands", async () => db.select().from(brands).orderBy(asc(brands.name)));

  app.post("/brands", async (req, reply) => {
    const body = brandInput.parse(req.body);
    const [row] = await db.insert(brands).values(body).returning();
    return reply.code(201).send(row);
  });

  app.delete("/brands/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.delete(brands).where(eq(brands.id, id));
    return reply.code(204).send();
  });

  app.get("/colors", async () => db.select().from(colors).orderBy(asc(colors.name)));

  app.post("/colors", async (req, reply) => {
    const body = colorInput.parse(req.body);
    const [row] = await db.insert(colors).values(body).returning();
    return reply.code(201).send(row);
  });

  app.delete("/colors/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.delete(colors).where(eq(colors.id, id));
    return reply.code(204).send();
  });
}
