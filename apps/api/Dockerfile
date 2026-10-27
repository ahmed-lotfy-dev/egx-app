# Build stage - install dependencies and generate migrations
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json ./apps/api/
COPY packages/contracts/package.json ./packages/contracts/

# Install dependencies with hoisted linker
RUN bun install --frozen-lockfile

# Copy source code
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/
COPY apps/api/drizzle.config.ts ./apps/api/
COPY packages/contracts/src ./packages/contracts/
COPY packages/contracts/tsconfig.json ./packages/contracts/

# Generate Drizzle migrations
WORKDIR /app/apps/api
RUN bun run db:generate

# Production stage
FROM oven/bun:1.3-alpine AS runner

WORKDIR /app

# Copy node_modules and source
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages/contracts ./packages/contracts

# Set working directory to API
WORKDIR /app/apps/api

# Run migrations and start the server
CMD ["bun", "run", "src/db/migrate.ts", "&&", "bun", "run", "src/index.ts"]