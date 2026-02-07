FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# input/output mounts
RUN mkdir -p /in /out /work
CMD ["node", "dist/run.js"]
