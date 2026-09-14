# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c

FROM ${NODE_IMAGE} AS toolchain

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

WORKDIR /workspace

FROM toolchain AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/cms/package.json apps/cms/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS source

COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md THIRD_PARTY_LICENSES.txt ./
COPY docs/dependency-licenses.json ./docs/dependency-licenses.json

FROM source AS verify

ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/ascnucc_build
ENV PAYLOAD_SECRET=build-only-placeholder-never-used-at-runtime
ENV MEDIA_STORAGE_MODE=local
ENV MEDIA_LOCAL_ROOT=/tmp/ascnucc-media-build
ENV CMS_API_URL=http://127.0.0.1:39999

RUN pnpm lint && \
    pnpm typecheck && \
    pnpm check:boundaries && \
    pnpm test

FROM source AS web-build

ENV CMS_API_URL=http://127.0.0.1:39999

RUN pnpm --filter @ascnucc/web build

FROM toolchain AS web

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md THIRD_PARTY_LICENSES.txt ./
COPY docs/dependency-licenses.json ./docs/dependency-licenses.json
COPY --from=web-build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "const socket=require('node:net').connect(3000,'127.0.0.1');socket.setTimeout(4000);socket.on('connect',()=>{socket.destroy();process.exit(0)});socket.on('timeout',()=>{socket.destroy();process.exit(1)});socket.on('error',()=>process.exit(1))"]

CMD ["node", "apps/web/server.js"]

FROM source AS cms-build

ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/ascnucc_build
ENV PAYLOAD_SECRET=build-only-placeholder-never-used-at-runtime
ENV MEDIA_STORAGE_MODE=local
ENV MEDIA_LOCAL_ROOT=/tmp/ascnucc-media-build

RUN pnpm --filter @ascnucc/cms build

FROM toolchain AS cms

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001

WORKDIR /workspace

COPY --from=cms-build --chown=node:node /workspace ./

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/admin').then((response) => process.exit(response.status < 500 ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["pnpm", "--dir", "apps/cms", "start"]
