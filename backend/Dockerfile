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

# scripts/ (e.g. sync-drip-emporium-feed.ts) is outside tsconfig's rootDir on
# purpose -- it's a standalone script run via ts-node, not part of the
# compiled Nest app -- so `npm run build` above never touches it and it has
# to be copied in explicitly here.
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

COPY --from=builder /app/node_modules ./node_modules
# ts-node/typescript are devDependencies and would normally be pruned below
# with the rest -- reinstalled right after because scripts/*.ts is run via
# `npm run sync:drip-emporium` -> ts-node, in this same production image,
# not a separate build step.
RUN npm prune --omit=dev \
    && npm install --no-save --silent prisma@5.22.0 ts-node@10.9.2 typescript@5.6.2
RUN npx prisma generate

EXPOSE 3200
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
