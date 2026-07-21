# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Multi-stage build for Next.js (output: "standalone").
# Produces a minimal production image that runs `node server.js`.
# NOTE: questions.json is the committed source of truth — it is NOT regenerated
# at build time (Bedrock generation is a manual, reviewed step). See code review.
# ---------------------------------------------------------------------------

# --- deps: install production + dev deps for the build ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build: compile the Next.js standalone output ---
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner: minimal runtime image ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Run as non-root for least privilege.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# standalone bundle (server.js + minimal node_modules), static assets and public.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
