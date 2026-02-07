FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY web ./web

RUN npx tsc -p tsconfig.json

EXPOSE 8080
CMD ["node", "dist/server.js"]

# Copy worker package into the GUI image
COPY ../diagnostics /workers/diagnostics
RUN cd /workers/diagnostics && npm install && npm run build
