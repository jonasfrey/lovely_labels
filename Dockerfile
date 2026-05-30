# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build the Vite/Vue frontend ----------
FROM node:20-bookworm-slim AS client-build

WORKDIR /app/client

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ---------- Stage 2: Deno runtime + ImageMagick ----------
FROM denoland/deno:debian-2.1.4 AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends imagemagick \
 && ln -sf /usr/bin/convert /usr/local/bin/magick \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The denoland/deno base image ships a non-root `deno` user (uid 1993).
# Everything we COPY is chowned to it so the runtime stage never needs root.
COPY --chown=deno:deno deno.json server.ts ./
COPY --chown=deno:deno fonts/ ./fonts/
COPY --chown=deno:deno tile_masters/ ./tile_masters/
COPY --chown=deno:deno --from=client-build /app/client/dist ./client/dist

ENV PORT=8080
ENV MAGICK_BIN=magick
EXPOSE 8080

USER deno
RUN deno cache server.ts

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "--allow-run=magick,convert", "server.ts"]
