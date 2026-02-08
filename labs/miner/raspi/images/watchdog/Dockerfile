FROM node:20-alpine
WORKDIR /app
COPY miner/raspi/images/watchdog/healthcheck.js /app/healthcheck.js
RUN printf "setInterval(()=>{}, 1<<30)\n" > /app/stub.js
CMD ["node", "/app/stub.js"]
