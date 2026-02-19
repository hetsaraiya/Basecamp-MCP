# =============================================================================
# Stage 1 — builder
# Install all deps (including devDeps), compile TypeScript, then prune dev deps.
# Build tools (python3/make/g++) are required for better-sqlite3 native addon.
# =============================================================================
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy manifests first for layer-cache efficiency
COPY package.json package-lock.json ./

# Install ALL deps (dev included) so tsc is available
RUN npm ci

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Drop devDependencies — node_modules is now production-only
RUN npm prune --omit=dev

# =============================================================================
# Stage 2 — runner
# Minimal Alpine image; no build tools needed.
# The native addon (.node file inside node_modules) was compiled for the
# correct target arch in stage 1 (BuildKit runs each arch natively via QEMU).
# =============================================================================
FROM node:22-alpine AS runner

# Create a non-root user for security
RUN addgroup -S mcp && adduser -S mcp -G mcp

WORKDIR /app

# Copy pruned node_modules (includes compiled better-sqlite3 for this arch)
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JS output
COPY --from=builder /app/dist ./dist

# Copy package.json (needed for "type": "module" and engines field at runtime)
COPY package.json ./

# Directory for SQLite token store — mount a volume here for persistence
RUN mkdir -p /app/data && chown mcp:mcp /app/data

USER mcp

EXPOSE 3000

# Default SQLite path inside the mounted data volume
ENV SQLITE_PATH=/app/data/tokens.db \
    NODE_ENV=production \
    PORT=3000

# HTTP server mode (TRANSPORT unset → server.ts startServer())
CMD ["node", "dist/index.js"]
