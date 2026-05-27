# Image size ~ 400MB
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json rollup.config.js ./

RUN apk add --no-cache --virtual .gyp \
        python3 \
        make \
        g++ \
    && apk add --no-cache git \
    && npm install \
    && npm run build \
    && apk del .gyp

FROM node:22-alpine AS deploy

WORKDIR /app

ARG PORT=3008
ENV PORT=$PORT
EXPOSE $PORT

COPY --from=builder /app/assets ./assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 nodejs

USER nodejs
CMD ["npm", "start"]
