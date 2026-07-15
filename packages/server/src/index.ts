import { config } from "dotenv";
import { fileURLToPath } from "node:url";
// npm runs workspace scripts with the package as CWD, so dotenv's default lookup
// misses the repo-root .env. Resolve it relative to this file instead (works from
// both src/ under tsx and dist/ under node — both are one level below the package).
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

import express from "express";
import cors from "cors";
import { analyze, type Send } from "./analyze.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  // DEMO=1 forces the no-LLM path, so report it as keyless for an accurate UI badge.
  const live = Boolean(process.env.ANTHROPIC_API_KEY) && process.env.DEMO !== "1";
  res.json({ ok: true, hasKey: live });
});

app.post("/api/analyze", async (req, res) => {
  const { jobPosting, resume } = req.body ?? {};
  if (typeof jobPosting !== "string" || typeof resume !== "string" || !jobPosting || !resume) {
    res.status(400).json({ error: "Both jobPosting and resume are required." });
    return;
  }

  // Server-Sent Events over the POST response.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send: Send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await analyze({ jobPosting, resume }, send);
  } catch (err) {
    console.error(err);
    send("error", { message: err instanceof Error ? err.message : "Unknown error" });
  } finally {
    res.end();
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("No ANTHROPIC_API_KEY set — /api/analyze runs in demo mode.");
  }
});
