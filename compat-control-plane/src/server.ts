import express, { type Request, type Response } from "express";
import { Storage } from "./storage.js";
import { sitesRouter } from "./routes/sites.js";
import { uploadsRouter } from "./routes/uploads.js";
import { jobsRouter } from "./routes/jobs.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

const store = new Storage(process.env.DATA_DIR || "./data");
const adminToken = process.env.ADMIN_API_KEY || "";
const allowUnauthenticated = process.env.ALLOW_UNAUTHENTICATED === "1";

function requireAdmin(req: Request, res: Response, next: () => void) {
  if (allowUnauthenticated) return next();
  if (!adminToken) return res.status(500).json({ ok: false, error: "admin_token_missing" });
  const token = String(req.headers["x-ddns-admin-token"] || "");
  if (!token || token !== adminToken) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  return next();
}

app.get("/healthz", (_req: Request, res: Response) => res.json({ ok: true }));
app.use("/v1/sites", sitesRouter(store, requireAdmin));
app.use("/v1/uploads", uploadsRouter(store));
app.use("/v1/jobs", jobsRouter(store));

// serve reports for inspection (lock down later)
app.use("/reports", express.static((process.env.DATA_DIR || "./data") + "/reports"));

const PORT = Number(process.env.PORT || "8788");
app.listen(PORT, () => console.log(`compat-control-plane listening on :${PORT}`));
