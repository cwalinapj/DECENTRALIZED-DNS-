import { createServer } from "./server.ts";

const port = Number(process.env.PORT || "8093");
const host = process.env.HOST || "127.0.0.1";

const server = createServer();
server.listen(port, host, () => {
  console.log(`traffic-oracle listening on ${host}:${port}`);
});
