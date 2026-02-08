import { listRoutes, readRoute } from "./route_lib.js";

const ids = listRoutes();
if (!ids.length) {
  console.log("no routes found");
  process.exit(0);
}
for (const id of ids) {
  const route = readRoute(id);
  console.log(id, route?.name, route?.dest, route?.ttl);
}
