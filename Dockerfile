# syntax=docker/dockerfile:1

# Build stage
FROM --platform=$BUILDPLATFORM docker.io/library/node:22 AS builder

# Set working directory
WORKDIR /app

# Install dependencies first (for better caching)
COPY package*.json ./
COPY prisma ./prisma/

# Install system dependencies and npm packages
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/* && \
    npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Production stage
FROM docker.io/library/node:22 AS production

# Set environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Set working directory
WORKDIR /app

# Copy prisma schema files (needed for migrate deploy + generate in entrypoint)
COPY prisma ./prisma/

# Copy package-lock.json to extract Prisma version
COPY package-lock.json ./package-lock.json

# Install system dependencies and Prisma CLI only (Nuxt bundles everything into .output)
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/* && \
    PRISMA_VERSION=$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version") && \
    npm install -g prisma@${PRISMA_VERSION} && \
    rm package-lock.json

# Copy built application and Prisma client from builder stage
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy entrypoint script
COPY scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create data directory for SQLite and photos, set up volume
RUN mkdir -p /data /data/photos
VOLUME ["/data"]

# Expose the port the app runs on
EXPOSE 3000

# Use entrypoint script for database setup and startup
CMD ["/app/docker-entrypoint.sh"]
