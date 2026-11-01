# Build stage - install dependencies
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy entire workspace
COPY package.json bun.lock bunfig.toml ./
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY packages/contracts ./packages/contracts

# Install dependencies with hoisted linker
RUN bun install

# Production stage
FROM oven/bun:1.3-alpine AS runner

WORKDIR /app

# Copy entire workspace with node_modules
COPY --from=builder /app ./

# Set working directory to worker
WORKDIR /app/apps/worker

# Run the ingest scheduler (quotes every 3 min in market hours, bars,
# fundamentals and news on their daily schedules).
#
# `nice` keeps the ingest worker at a lower CPU priority than the API: the
# box is small and shared, so the API must win whenever both compete.
CMD ["nice", "-n", "10", "bun", "src/cli.ts", "schedule"]
