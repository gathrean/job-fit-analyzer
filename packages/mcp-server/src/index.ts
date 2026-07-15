import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * A tiny MCP server exposing one deterministic tool.
 *
 * The whole reason this is a separate tool (and not something we let Claude
 * eyeball) is grounding: Claude is good at *reading* a job posting and pulling
 * out requirements, but "does the resume actually contain X" is a factual
 * lookup we want to answer with code, not vibes. Claude calls this tool and
 * treats its answer as ground truth.
 */
const server = new McpServer({
  name: "job-fit-tools",
  version: "0.1.0",
});

/** Normalize text into a lowercase token set for matching. */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9+.#]+/)
      .filter((t) => t.length > 1),
  );
}

/**
 * A requirement counts as covered if:
 *  - its exact lowercased phrase appears in the resume, OR
 *  - at least 60% of its meaningful tokens appear in the resume.
 * Deliberately simple and explainable — this is a scaffold to build on.
 */
function isCovered(requirement: string, resume: string, resumeTokens: Set<string>): boolean {
  const needle = requirement.trim().toLowerCase();
  if (!needle) return false;
  if (resume.toLowerCase().includes(needle)) return true;

  const reqTokens = [...tokenize(requirement)].filter((t) => t.length > 2);
  if (reqTokens.length === 0) return false;
  const hits = reqTokens.filter((t) => resumeTokens.has(t)).length;
  return hits / reqTokens.length >= 0.6;
}

server.tool(
  "check_keyword_coverage",
  "Deterministically check which of a list of job requirements actually appear in a " +
    "resume. Returns the covered and missing requirements plus a coverage score. Use " +
    "this as the source of truth for what the resume contains — do not guess.",
  {
    resume_text: z.string().describe("The full text of the candidate's resume."),
    requirements: z
      .array(z.string())
      .describe("Short, concrete requirements extracted from the job posting."),
  },
  async ({ resume_text, requirements }) => {
    const resumeTokens = tokenize(resume_text);
    const covered: string[] = [];
    const missing: string[] = [];

    for (const req of requirements) {
      if (isCovered(req, resume_text, resumeTokens)) covered.push(req);
      else missing.push(req);
    }

    const total = requirements.length || 1;
    const result = {
      covered,
      missing,
      coverage_score: Math.round((covered.length / total) * 100),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
