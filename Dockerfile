FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY server.mjs ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3000/health').then(r => r.json()).then(j => j.status === 'ok' ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"]

CMD ["node", "server.mjs"]