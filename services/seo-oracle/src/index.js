import { createServer } from "./server.js";

const PORT = Number(process.env.PORT || "8094");
const HOST = process.env.HOST || "127.0.0.1";

createServer().listen(PORT, HOST, () => {
  console.log(`seo-oracle listening on ${HOST}:${PORT}`);
});
