export interface StreamHandlers {
  onDelta: (text: string) => void;
  onTool: (info: { name: string; input: unknown }) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

/**
 * Absolute API origin in production (e.g. the Render API service). Empty in dev
 * so requests stay same-origin and the Vite proxy forwards /api to :8787.
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/**
 * POSTs to /api/analyze and parses the Server-Sent Events off the streamed
 * response body. EventSource can't POST, so we read the body ourselves.
 */
export async function streamAnalyze(
  body: { jobPosting: string; resume: string },
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    handlers.onError(`Request failed (${res.status}).`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      let event = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const parsed = JSON.parse(data);
      switch (event) {
        case "delta":
          handlers.onDelta(parsed as string);
          break;
        case "tool":
          handlers.onTool(parsed as { name: string; input: unknown });
          break;
        case "error":
          handlers.onError((parsed as { message: string }).message);
          break;
        case "done":
          handlers.onDone();
          break;
      }
    }
  }
}
