FROM node:22-bookworm

WORKDIR /app

RUN npm install --global pnpm@12.10.1

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm exec playwright install --with-deps chromium webkit
RUN pnpm build

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    AUTOMATION_HEADLESS=true \
    TESTDOG_DATA_DIR=/data

EXPOSE 3000

CMD ["pnpm", "start"]
