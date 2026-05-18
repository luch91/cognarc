FROM node:18-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @cognarc/guardrail-engine...
RUN pnpm --filter @cognarc/guardrail-engine build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/guardrail-engine/dist ./dist
COPY --from=builder /app/services/guardrail-engine/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3004
CMD ["node", "dist/index.js"]
