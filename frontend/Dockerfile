# syntax=docker/dockerfile:1.7

############################
# Stage 1 — Builder
############################
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src

# Build-time API base URL — defaults to "" (relative paths) so the SPA can be
# served behind the same Traefik host as the backend with no rebuild needed.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

############################
# Stage 2 — Runtime (Nginx)
############################
FROM nginx:1.27-alpine AS runtime

# Drop the default vhost and ship our SPA-aware config instead
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

# Run as a non-root user. Alpine's nginx image ships a "nginx" user already.
# Listen on 8080 so we don't need CAP_NET_BIND_SERVICE for ports < 1024.
RUN sed -i 's/user  nginx;/# user nginx;/' /etc/nginx/nginx.conf \
    && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx \
    && touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
