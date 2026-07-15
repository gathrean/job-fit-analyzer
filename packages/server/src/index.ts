import "dotenv/config";
import express from "express";
import cors from "cors";
import { analyze, type Send } from "./analyze.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(process.env.ANTHROPIC_API_KEY) });
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
