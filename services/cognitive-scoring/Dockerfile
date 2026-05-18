FROM node:18-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/cognitive-scoring/package.json ./services/cognitive-scoring/
COPY packages/cognarc-types/package.json ./packages/cognarc-types/
RUN pnpm install --frozen-lockfile --filter @cognarc/cognitive-scoring...

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/cognitive-scoring/node_modules ./services/cognitive-scoring/node_modules
COPY . .
RUN pnpm --filter @cognarc/cognitive-scoring build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/cognitive-scoring/dist ./dist
COPY --from=builder /app/services/cognitive-scoring/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001
CMD ["node", "dist/index.js"]
