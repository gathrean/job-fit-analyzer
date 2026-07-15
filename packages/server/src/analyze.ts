import Anthropic from "@anthropic-ai/sdk";
import { getMcpTools, callMcpTool } from "./mcp.js";

const MODEL = process.env.MODEL ?? "claude-opus-4-8";

const SYSTEM = `You are a Job-Fit Analyzer. Given a job posting and a candidate's resume, assess how well the candidate fits the role.

You have two deterministic tools — treat their output as ground truth, never guess:
- check_keyword_coverage(resume_text, requirements): reports which requirements actually appear in the resume, with a match_type and evidence for each.
- suggest_resume_edits(resume_text, missing_requirements): turns a list of gaps into concrete, grounded edit suggestions.

Do this in order:
1. Read the job posting and extract 6-12 concrete, checkable requirements (skills, tools, qualifications). Keep each short, e.g. "React", "TypeScript", "REST API design".
2. Call check_keyword_coverage once with the resume text and that list.
3. If it reports any missing requirements, call suggest_resume_edits with the resume text and that missing list.
4. Using ONLY the tools' results as ground truth, write in clean Markdown:
   - **Fit score:** a number out of 100.
   - **Strengths:** requirements the resume covers (you may cite the evidence).
   - **Gaps:** each missing requirement with the one-line suggestion from suggest_resume_edits.
   - **Verdict:** two sentences.

Never claim a requirement is met unless check_keyword_coverage marked it covered.`;

export type Send = (event: string, data: unknown) => void;

/**
 * Forward a tool's JSON result to the client as a typed event, so the UI can render
 * a real score gauge and covered/missing breakdown instead of dumping raw text. Both
 * the live loop and demo mode share this, so the interface looks the same either way.
 */
function emitStructured(toolName: string, output: string, send: Send): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return; // non-JSON tool output; nothing structured to emit
  }
  if (toolName === "check_keyword_coverage") send("coverage", parsed);
  else if (toolName === "suggest_resume_edits") send("suggestions", parsed);
}

export interface AnalyzeInput {
  jobPosting: string;
  resume: string;
}

/**
 * Runs the agentic loop: stream Claude's text out as it goes, and whenever Claude
 * asks for a tool, dispatch it to the MCP server and feed the result back.
 * Falls back to a no-LLM demo (still using the MCP tool) when no API key is set.
 */
export async function analyze({ jobPosting, resume }: AnalyzeInput, send: Send): Promise<void> {
  // DEMO=1 forces the no-LLM path even when a key is present (useful for showing the
  // pipeline, or while billing is being set up).
  if (process.env.DEMO === "1" || !process.env.ANTHROPIC_API_KEY) {
    await runDemo({ jobPosting, resume }, send);
    return;
  }

  const anthropic = new Anthropic();
  const mcpTools = await getMcpTools();
  const tools = mcpTools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `JOB POSTING:\n${jobPosting}\n\nRESUME:\n${resume}` },
  ];

  for (let turn = 0; turn < 6; turn++) {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      tools,
      messages,
    });
    stream.on("text", (delta) => send("delta", delta));
    const message = await stream.finalMessage();
    messages.push({ role: "assistant", content: message.content });

    if (message.stop_reason !== "tool_use") break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of message.content) {
      if (block.type === "tool_use") {
        send("tool", { name: block.name, input: block.input });
        const output = await callMcpTool(block.name, block.input as Record<string, unknown>);
        emitStructured(block.name, output, send);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  send("done", {});
}

/** Common skills/phrases the demo scans a posting for, so requirements read as intentional. */
const SKILL_VOCAB = [
  "React Native", "React", "Next.js", "Redux", "TypeScript", "JavaScript", "ES6",
  "HTML", "CSS", "Tailwind", "Vite", "Node.js", "Express", "REST API", "GraphQL",
  "Python", "Java", "C++", "C#", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis",
  "Docker", "Kubernetes", "AWS", "GCP", "Azure", "CI/CD", "Jest", "Cypress",
  "Playwright", "unit testing", "accessibility", "GenAI", "MCP",
  "agentic workflows", "prompt engineering", "microservices", "UI/UX",
];

/**
 * Demo requirement extraction (no LLM). Scan the posting for known skills; if too few
 * land, fall back to salient words so an arbitrary posting still exercises the tools.
 * With an API key, Claude does this extraction properly instead.
 */
function extractRequirements(posting: string): string[] {
  const lower = posting.toLowerCase();
  const hits = SKILL_VOCAB.filter((s) => lower.includes(s.toLowerCase()));
  // Drop a skill fully contained in a longer match (e.g. "React" when "React Native" hit).
  const deduped = hits.filter(
    (s) => !hits.some((o) => o !== s && o.toLowerCase().includes(s.toLowerCase())),
  );
  if (deduped.length >= 4) return deduped.slice(0, 12);

  const STOP = new Set([
    "need", "and", "with", "the", "for", "you", "our", "are", "will", "must",
    "have", "want", "years", "year", "experience", "engineer", "developer",
    "strong", "plus", "who", "this", "that", "role", "team", "work", "using",
  ]);
  return Array.from(
    new Set((posting.match(/[A-Za-z][A-Za-z+.#]{2,}/g) ?? []).map((s) => s.replace(/\.+$/, ""))),
  )
    .filter((w) => !STOP.has(w.toLowerCase()))
    .slice(0, 12);
}

/** No API key: still run both MCP tools end-to-end and emit the same structured events. */
async function runDemo({ jobPosting, resume }: AnalyzeInput, send: Send): Promise<void> {
  const requirements = extractRequirements(jobPosting);

  const coverage = await callMcpTool("check_keyword_coverage", {
    resume_text: resume,
    requirements,
  });
  send("tool", { name: "check_keyword_coverage", input: { requirements } });
  emitStructured("check_keyword_coverage", coverage, send);

  // Chain the second tool on whatever came back missing — the same flow Claude runs.
  const missing = (JSON.parse(coverage) as { missing?: string[] }).missing ?? [];
  if (missing.length > 0) {
    const edits = await callMcpTool("suggest_resume_edits", {
      resume_text: resume,
      missing_requirements: missing,
    });
    send("tool", { name: "suggest_resume_edits", input: { missing_requirements: missing } });
    emitStructured("suggest_resume_edits", edits, send);
  }

  send("done", {});
}
