# syntax=docker/dockerfile:1
FROM node:22.11.0-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM node:22.11.0-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22.11.0-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
# Run as the built-in unprivileged `node` user (uid 1000). Kyverno enforces
# runAsNonRoot on this namespace.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
