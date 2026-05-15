# syntax=docker/dockerfile:1.7

############################
# Stage 1 — Builder
############################
FROM node:20-alpine AS builder

WORKDIR /app

# Install build deps first so they cache independently of source changes.
# Using `npm ci` for deterministic installs based on the committed lockfile.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

############################
# Stage 2 — Production deps
############################
FROM node:20-alpine AS prod-deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

############################
# Stage 3 — Runtime
############################
FROM node:20-alpine AS runtime

# dumb-init handles SIGTERM correctly so graceful shutdown actually fires.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Run as the unprivileged "node" user that ships with the base image
USER node

COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
# Migrations are TS files and must be runnable in production — copy the
# source folder so typeorm-ts-node-commonjs can load them via the Job.
COPY --chown=node:node --from=builder /app/src ./src
COPY --chown=node:node package.json ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/v1/health > /dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
