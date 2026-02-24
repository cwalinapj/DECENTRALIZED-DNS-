import { createServer } from "./server.js";

const PORT = Number(process.env.PORT || "8093");
const HOST = process.env.HOST || "0.0.0.0";

createServer().listen(PORT, HOST, () => {
  console.log(`ns-control-plane listening on ${HOST}:${PORT}`);
});
