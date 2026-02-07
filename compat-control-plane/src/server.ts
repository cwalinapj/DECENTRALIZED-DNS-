import express from "express";
import { Storage } from "./storage.js";
import { sitesRouter } from "./routes/sites.js";
import { uploadsRouter } from "./routes/uploads.js";
import { jobsRouter } from "./routes/jobs.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

const store = new Storage(process.env.DATA_DIR || "./data");

app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.use("/v1/sites", sitesRouter(store));
app.use("/v1/uploads", uploadsRouter(store));
app.use("/v1/jobs", jobsRouter(store));

// serve reports for inspection (lock down later)
app.use("/reports", express.static((process.env.DATA_DIR || "./data") + "/reports"));

const PORT = Number(process.env.PORT || "8788");
app.listen(PORT, () => console.log(`compat-control-plane listening on :${PORT}`));
