FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app
COPY . .

CMD ["node", "--experimental-strip-types", "src/run.ts"]
