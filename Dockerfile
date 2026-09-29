# Build the SPA with the vendored yarn (no corepack), then serve dist/ with
# rootless nginx on port 8080.
FROM node:26-alpine AS build
WORKDIR /app
COPY .yarnrc.yml package.json yarn.lock ./
COPY .yarn/ .yarn/
RUN node .yarn/releases/yarn-*.cjs install --immutable
COPY . .
RUN node .yarn/releases/yarn-*.cjs build

FROM nginxinc/nginx-unprivileged:alpine
COPY default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Absolute URLs for canonical and Open Graph, from SITE_URL.
COPY --chmod=755 docker/30-site-url.sh /docker-entrypoint.d/
# Optional analytics, off unless LIWAN_SCRIPT_URL + LIWAN_ENTITY are set.
COPY --chmod=755 docker/40-liwan-tracker.sh /docker-entrypoint.d/
EXPOSE 8080
