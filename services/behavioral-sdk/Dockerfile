FROM node:18-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @cognarc/behavioral-sdk-service...
RUN pnpm --filter @cognarc/behavioral-sdk-service build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/behavioral-sdk/dist ./dist
COPY --from=builder /app/services/behavioral-sdk/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3002
CMD ["node", "dist/index.js"]
