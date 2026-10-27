# Build stage - install dependencies and generate migrations
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy entire workspace
COPY package.json bun.lock bunfig.toml ./
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts

# Install dependencies with hoisted linker
RUN bun install

# Generate Drizzle migrations
WORKDIR /app/apps/api
RUN bun run db:generate

# Production stage
FROM oven/bun:1.3-alpine AS runner

WORKDIR /app

# Copy entire workspace with node_modules
COPY --from=builder /app ./

# Set working directory to API
WORKDIR /app/apps/api

# Run migrations and start the server
CMD ["sh", "-c", "bun run src/db/migrate.ts && bun run src/index.ts"]