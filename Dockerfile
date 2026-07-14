# 构建 Vite 前端产物。
FROM oven/bun:1.3.13 AS web-build

WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --cache-dir=/root/.bun/install/cache
COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md
COPY web ./
RUN bun run build

# 运行镜像：提供静态前端，并执行渠道代理 Route Handler。
FROM oven/bun:1.3.13

WORKDIR /app
COPY --from=web-build /app/web/dist ./dist
COPY web/server.ts ./server.ts
COPY web/src/app ./src/app

EXPOSE 3000

CMD ["bun", "run", "server.ts"]
