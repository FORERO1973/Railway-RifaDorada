FROM node:22-alpine

WORKDIR /app

ARG PORT=3008
ENV PORT=$PORT
EXPOSE $PORT

COPY package*.json ./
RUN npm install

COPY src ./src
COPY assets ./assets

RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 nodejs \
    && chown -R nodejs:nodejs /app

USER nodejs
CMD ["npx", "tsx", "src/app.ts"]
