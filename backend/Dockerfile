FROM node:24-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl python3 make g++

COPY package*.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm install --silent

RUN npm run prisma:generate

COPY . ./
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev \
    && npm install --no-save --silent prisma@5.22.0
RUN npx prisma generate

EXPOSE 3200
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
