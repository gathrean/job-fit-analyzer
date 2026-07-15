import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { indexResume, matchRequirement } from "./matching.js";
import { suggestEdits } from "./suggest.js";

/**
 * A tiny MCP server exposing two deterministic tools.
 *
 * The whole reason these are separate tools (and not something we let Claude
 * eyeball) is grounding: Claude is good at *reading* a job posting and pulling
 * out requirements, but "does the resume actually contain X" and "how should I
 * fix a gap" are things we answer with explainable code, not vibes. Claude
 * orchestrates and chains the tools; the tools decide the facts.
 */
const server = new McpServer({
  name: "job-fit-tools",
  version: "0.2.0",
});

server.tool(
  "check_keyword_coverage",
  "Deterministically check which of a list of job requirements actually appear in a " +
    "resume. Handles aliases (JS/JavaScript, Node.js/NodeJS), light stemming, and " +
    "experience qualifiers ('3 years React' -> 'React'). Returns each requirement's " +
    "match type and the resume evidence, plus covered/missing lists and a score. Use " +
    "this as the source of truth for what the resume contains — do not guess.",
  {
    resume_text: z.string().describe("The full text of the candidate's resume."),
    requirements: z
      .array(z.string())
      .describe("Short, concrete requirements extracted from the job posting."),
  },
  async ({ resume_text, requirements }) => {
    const idx = indexResume(resume_text);
    const results = requirements.map((req) => matchRequirement(req, idx));

    const covered = results.filter((r) => r.covered).map((r) => r.requirement);
    const missing = results.filter((r) => !r.covered).map((r) => r.requirement);
    const total = requirements.length || 1;

    const result = {
      coverage_score: Math.round((covered.length / total) * 100),
      covered,
      missing,
      results, // per-requirement: skill, match_type, evidence
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "suggest_resume_edits",
  "Given a resume and the requirements it is MISSING, return concrete, grounded resume " +
    "edit suggestions. For each gap it looks for a same-category skill the resume already " +
    "has and suggests bridging from it. Deterministic — no guessing. Call this after " +
    "check_keyword_coverage, passing the `missing` list, to turn gaps into actionable advice.",
  {
    resume_text: z.string().describe("The full text of the candidate's resume."),
    missing_requirements: z
      .array(z.string())
      .describe("The requirements check_keyword_coverage reported as missing."),
  },
  async ({ resume_text, missing_requirements }) => {
    const suggestions = suggestEdits(resume_text, missing_requirements);
    return { content: [{ type: "text", text: JSON.stringify({ suggestions }, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
