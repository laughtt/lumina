# Lumina API + the built web app (Studio, /tv, /alexa, /ana) on one port.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
COPY tv/shared/package.json tv/shared/
RUN npm ci --no-audit --no-fund
COPY api api
COPY web web
COPY tv/shared tv/shared
RUN npm run build -w web
WORKDIR /app/api
ENV WEB_DIST=/app/web/dist PORT=8787 WEB_PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "src/server.ts"]
