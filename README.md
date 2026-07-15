# Job-Fit Analyzer

Paste a job posting and your resume; Claude scores how well you match and tells you
which requirements you cover and which you're missing.

The point of the project is the architecture, not the feature: a **React + TypeScript**
front-end talks to a **Node** backend, which runs an **agentic Claude loop** that calls
a **custom MCP (Model Context Protocol) server** for the one thing an LLM shouldn't be
trusted to do by itself — deciding whether a specific skill literally appears in the
resume. That deterministic tool is what keeps the analysis grounded instead of
hallucinated.

## Architecture

```
  React + TS (Vite)                Node / Express                MCP server (stdio)
  packages/web            --->     packages/server      --->     packages/mcp-server
  - two textareas                  - POST /api/analyze           - one tool:
  - streams the result             - agentic Claude loop           check_keyword_coverage
    over fetch/SSE                  (@anthropic-ai/sdk)             (deterministic, no LLM)
                                   - MCP client spawns and
                                     calls the MCP server
```

Flow of one analysis:

1. Claude reads the posting and extracts a short list of concrete requirements.
2. Claude calls `check_keyword_coverage(resume_text, requirements)` on the MCP server.
   The server does plain string/token matching — no model involved — and returns exactly
   which requirements are present.
3. Claude writes the fit score, strengths, and gaps **using only the tool's result as
   ground truth**. That is the anti-hallucination story: the model orchestrates, the tool
   decides what's actually in the resume.

## Requirements matched to what each layer proves

| Layer | Demonstrates |
| --- | --- |
| `packages/web` | ReactJS, TypeScript, responsive UI, streaming responses |
| `packages/server` | Node backend integration, agentic workflow, Claude API |
| `packages/mcp-server` | Model Context Protocol server, grounding / reducing hallucination |

## Run it

```bash
npm install
cp .env.example .env      # then paste your ANTHROPIC_API_KEY into .env
npm run dev               # builds the MCP server, then starts API + web
```

- Web: http://localhost:5173
- API: http://localhost:8787

**No API key yet?** It still runs. Without `ANTHROPIC_API_KEY` the app drops into a demo
mode that exercises the MCP coverage tool directly (deterministic, no LLM) so you can see
the pipeline end-to-end before wiring up billing.

## Next steps (the week's work)

- [ ] Render the streamed Markdown properly (add `react-markdown`).
- [ ] Smarter matching in the MCP tool (synonyms, stemming, "3 years React" vs "React").
- [ ] A second MCP tool, e.g. `suggest_resume_edits`, and let Claude chain them.
- [ ] Persist past analyses; add a share link.
- [ ] Deploy (Vercel for web, a small Node host for the API).
