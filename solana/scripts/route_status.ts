import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { readRoute, readWitnesses, routeId } from "./route_lib.js";

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("route-id", { type: "string", demandOption: true })
    .strict()
    .parse();

  const route = readRoute(argv["route-id"]);
  if (!route) {
    throw new Error("route not found in wallet-cache");
  }
  const id = routeId(route);
  const witnesses = readWitnesses(id);
  console.log("route_id:", id);
  console.log("route:", route);
  console.log("witnesses:", witnesses);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
