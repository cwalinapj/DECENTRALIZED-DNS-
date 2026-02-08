import fs from "node:fs";
import path from "node:path";

const sample = {
  name: "DDNS Toll Pass",
  symbol: "DDNS",
  description: "Toll Pass NFT for ddns.",
  image: "https://example.com/image.png",
  attributes: [{ trait_type: "type", value: "toll-pass" }],
  properties: {
    files: [{ uri: "https://example.com/image.png", type: "image/png" }],
    category: "image",
  },
};

const outPath = path.join(process.cwd(), "scripts", "sample-metadata.json");
fs.writeFileSync(outPath, JSON.stringify(sample, null, 2));
console.log(`Wrote ${outPath}`);
console.log("Next steps:");
console.log("1) Upload scripts/sample-metadata.json to IPFS or HTTPS");
console.log("2) Run: npm run apply-metadata -- --mint <MINT> --uri <URI> --name \"DDNS Toll Pass\"");
