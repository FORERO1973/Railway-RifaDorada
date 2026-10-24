FROM node:22-alpine

WORKDIR /app

ARG PORT=3008
ENV PORT=$PORT
ENV NODE_ENV=production
EXPOSE $PORT

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY assets ./assets

RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 nodejs \
    && mkdir -p /app/uploads /app/bot_sessions \
    && chown -R nodejs:nodejs /app

USER nodejs
CMD ["node", "node_modules/tsx/dist/cli.mjs", "src/app.ts"]
