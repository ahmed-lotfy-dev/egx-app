# Build stage - install dependencies and generate migrations
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy entire workspace
COPY package.json bun.lock bunfig.toml ./
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts

# Install dependencies. (The runtime needs production deps only, but bun
# refuses --production against a frozen workspace lockfile, so install
# normally; the extra dev deps are small compared to the base image.)
RUN bun install

WORKDIR /app/apps/api

# Migrations are committed under src/db/migrations and applied at container
# start. Never regenerate them during the build: drizzle hashes migration
# files, and regenerating changes those hashes, which makes the production
# migrator replay already-applied migrations.

# Production stage
FROM oven/bun:1.3-alpine AS runner

WORKDIR /app

# Copy entire workspace with node_modules
COPY --from=builder /app ./

# Set working directory to API
WORKDIR /app/apps/api

# Run migrations and start the server
CMD ["sh", "-c", "bun run src/db/migrate.ts && bun run src/index.ts"]