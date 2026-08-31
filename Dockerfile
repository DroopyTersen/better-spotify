FROM oven/bun:1.4.0 AS base
WORKDIR /app

FROM base AS development-dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

FROM base AS build
COPY --from=development-dependencies /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM base AS production-dependencies
ENV NODE_ENV=production
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
COPY package.json ./
COPY server.ts ./
COPY serverRequest.ts ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/build ./build
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/healthcheck').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
USER bun
CMD ["bun", "run", "start"]
