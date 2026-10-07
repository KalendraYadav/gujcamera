# ==============================================================================
# NETRAVA Backend Production Dockerfile
# Gujarat Police Innovation Challenge 2026
# Multi-stage production build targeting Node.js 20 on Alpine Linux
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install native dependencies required by Prisma engine on Alpine
RUN apk add --no-cache openssl libc6-compat

# Copy dependency manifests and Prisma schema
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Clean install all dependencies (including devDependencies needed for build and Prisma)
RUN npm ci

# Generate Prisma Client for linux-musl target
RUN npx prisma generate

# Copy compiler configuration and application source
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript backend to dist/
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Install runtime OpenSSL and libc dependencies for Prisma query engine
RUN apk add --no-cache openssl libc6-compat

ENV NODE_ENV=production
ENV PORT=4000

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy pre-generated Prisma client and schema
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/prisma ./prisma

# Copy compiled application JavaScript
COPY --from=builder /app/dist ./dist

# Support cloud-injected PORT (defaults to 4000)
EXPOSE 4000

# Start with compiled production entrypoint
# Note: Migrations and seeding are intentionally decoupled and NOT run on container startup
CMD ["node", "dist/src/main.js"]
