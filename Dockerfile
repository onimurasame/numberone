# Multi-stage deterministic image pinned by SHA-256 digest
FROM node:22.22-alpine3.24@sha256:e58326d0d441090181ac150dc2078d3e2cf6a0d42e809aebba3ef5880935ffdd AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src ./src
RUN npm run build

FROM node:22.22-alpine3.24@sha256:e58326d0d441090181ac150dc2078d3e2cf6a0d42e809aebba3ef5880935ffdd AS runtime
LABEL org.opencontainers.image.title="Number One (n1)" \
      org.opencontainers.image.description="Harness-agnostic event-sourced authoritative workspace curator and System of Record" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tini git
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /root/.npm \
    && mkdir -p /workspace \
    && chown node:node /workspace
# Keep /app owned by root:root (read-only to runtime user `node`)
COPY --from=builder /app/dist ./dist
USER node
WORKDIR /workspace
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "/app/dist/cli.js", "doctor", "--workspace", "/workspace", "--json"]
ENTRYPOINT ["/sbin/tini", "--", "node", "/app/dist/cli.js"]
CMD ["watch", "--foreground", "--workspace", "/workspace"]
