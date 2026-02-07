import express from "express";

import adminRouter from "./admin.js";
import { config } from "./config.js";
import optinRouter from "./optin.js";
import { loadState } from "./storage.js";

loadState();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "64kb" }));

app.use("/v1/admin", adminRouter);
app.use("/v1/optin", optinRouter);

app.listen(config.port, () => {
  console.log(`optin-server listening on :${config.port}`);
});
