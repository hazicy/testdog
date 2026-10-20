FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

RUN npm install --global pnpm@12.10.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/server/package.json ./packages/server/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    AUTOMATION_HEADLESS=true \
    TESTDOG_DATA_DIR=/data

EXPOSE 3000

CMD ["pnpm", "start"]
