import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { ensureSchema } from "./db/migrate.js";
import { registerRoutes } from "./routes.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: "validation_error", issues: err.issues });
  }
  app.log.error(err);
  const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
  const message = err instanceof Error ? err.message : "Internal Server Error";
  return reply.code(statusCode).send({ error: message });
});

// Liveness/readiness. Kept dependency-free so the pod can report healthy even
// if the database is briefly unavailable.
app.get("/healthz", async () => ({ status: "ok", service: "catalog-service" }));

await registerRoutes(app);

const port = Number(process.env.PORT ?? 8080);

try {
  await ensureSchema();
  await app.listen({ host: "0.0.0.0", port });
  app.log.info(`catalog-service listening on :${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
