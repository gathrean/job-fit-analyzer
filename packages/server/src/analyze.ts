import Anthropic from "@anthropic-ai/sdk";
import { getMcpTools, callMcpTool } from "./mcp.js";

const MODEL = process.env.MODEL ?? "claude-opus-4-8";

const SYSTEM = `You are a Job-Fit Analyzer. Given a job posting and a candidate's resume, assess how well the candidate fits the role.

You have one tool: check_keyword_coverage(resume_text, requirements). It deterministically reports which of a list of requirements actually appear in the resume. This is your source of truth — never guess whether a skill is present.

Do this in order:
1. Read the job posting and extract 6-12 concrete, checkable requirements (skills, tools, qualifications). Keep each short, e.g. "React", "TypeScript", "REST API design".
2. Call check_keyword_coverage once with the resume text and that list.
3. Using ONLY the tool's covered/missing result as ground truth, write in clean Markdown:
   - **Fit score:** a number out of 100.
   - **Strengths:** requirements the resume covers.
   - **Gaps:** requirements it is missing, each with a one-line suggestion.
   - **Verdict:** two sentences.

Never claim a requirement is met unless the tool marked it covered.`;

export type Send = (event: string, data: unknown) => void;

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
  if (!process.env.ANTHROPIC_API_KEY) {
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

/** No API key: still show the MCP tool working end-to-end. */
async function runDemo({ jobPosting, resume }: AnalyzeInput, send: Send): Promise<void> {
  send(
    "delta",
    "**Demo mode** (no `ANTHROPIC_API_KEY` set). Running the MCP coverage tool directly — no LLM.\n\n",
  );

  const requirements = Array.from(
    new Set((jobPosting.match(/[A-Za-z][A-Za-z+.#]{2,}/g) ?? []).map((s) => s)),
  ).slice(0, 12);

  const output = await callMcpTool("check_keyword_coverage", {
    resume_text: resume,
    requirements,
  });

  send("tool", { name: "check_keyword_coverage", input: { requirements } });
  send(
    "delta",
    "```json\n" + output + "\n```\n\nSet `ANTHROPIC_API_KEY` in `.env` for the full AI analysis.",
  );
  send("done", {});
}
