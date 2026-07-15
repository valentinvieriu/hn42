ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS build
WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY shared ./shared
COPY capture-agent ./capture-agent

RUN npx tsc -p capture-agent/tsconfig.json \
  && npx esbuild capture-agent/src/index.ts \
    --bundle \
    --format=esm \
    --platform=node \
    --target=node24 \
    --outfile=capture-agent/dist/index.mjs

FROM node:${NODE_VERSION}
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /build/capture-agent/dist/index.mjs ./index.mjs

USER node
EXPOSE 3002
CMD ["node", "index.mjs"]
