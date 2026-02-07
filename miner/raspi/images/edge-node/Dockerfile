FROM node:20-alpine
WORKDIR /app
RUN mkdir -p /app/config /var/lib/ddns
COPY miner/raspi/images/edge-node/healthcheck.js /app/healthcheck.js
# Stub server (replace with real edge-node binary later)
RUN printf "setInterval(()=>{}, 1<<30)\n" > /app/stub.js
CMD ["node", "/app/stub.js"]
