FROM node:18-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @cognarc/trust-gradient...
RUN pnpm --filter @cognarc/trust-gradient build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/trust-gradient/dist ./dist
COPY --from=builder /app/services/trust-gradient/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3005
CMD ["node", "dist/index.js"]
