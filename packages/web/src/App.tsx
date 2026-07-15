import { useEffect, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  streamAnalyze,
  type CoverageItem,
  type CoverageResult,
  type Suggestion,
} from "./streamAnalyze";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const SAMPLE_POSTING = `ReactJS Developer

We are looking for a front-end engineer with 3+ years of React and strong TypeScript.
You will build responsive, aesthetically polished web applications, integrate REST APIs,
manage state with Redux, and write unit tests with Jest. Familiarity with GenAI, agentic
workflows, and the Model Context Protocol (MCP) is a strong plus. GraphQL and Kubernetes
experience is nice to have.`;

const SAMPLE_RESUME = `Front-end developer. Built responsive dashboards in ReactJS with Redux and TypeScript.
Integrated RESTful APIs from Node.js services and rendered streamed responses in the UI.
Wrote unit tests in Jest. Built an agentic Claude app that calls a custom MCP server for
grounded, hallucination-free analysis. Comfortable with prompt engineering.`;

type Status = "idle" | "running" | "done" | "error";

export default function App() {
  const [jobPosting, setJobPosting] = useState("");
  const [resume, setResume] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [narrative, setNarrative] = useState("");
  const [toolsSeen, setToolsSeen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((r) => r.json())
      .then((d) => setHasKey(Boolean(d.hasKey)))
      .catch(() => setHasKey(null));
  }, []);

  const canRun = jobPosting.trim() && resume.trim() && status !== "running";
  const hasResult = coverage || narrative || status === "running";

  async function run() {
    setStatus("running");
    setCoverage(null);
    setSuggestions(null);
    setNarrative("");
    setToolsSeen(new Set());
    setError(null);
    try {
      await streamAnalyze(
        { jobPosting, resume },
        {
          onDelta: (text) => setNarrative((prev) => prev + text),
          onTool: (info) =>
            setToolsSeen((prev) => new Set(prev).add(info.name)),
          onCoverage: (data) => setCoverage(data),
          onSuggestions: (data) => setSuggestions(data),
          onError: (message) => {
            setError(message);
            setStatus("error");
          },
          onDone: () => setStatus((s) => (s === "error" ? s : "done")),
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    } finally {
      setStatus((s) => (s === "running" ? "done" : s));
    }
  }

  function loadExample() {
    setJobPosting(SAMPLE_POSTING);
    setResume(SAMPLE_RESUME);
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <TopBar hasKey={hasKey} />

      <main className="mx-auto max-w-5xl px-5 pb-24 sm:px-8">
        <section className="pt-14 sm:pt-20">
          <p className="font-sans text-sm font-medium uppercase tracking-[0.2em] text-accent">
            Resume &times; job posting
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            See how you fit, before you apply.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Paste a posting and your resume. An agentic Claude loop calls a
            deterministic{" "}
            <span className="text-ink">MCP tool</span> to check which requirements
            actually appear, so the score is measured, not guessed.
          </p>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <Field
            label="Job posting"
            hint={`${jobPosting.length.toLocaleString()} chars`}
            value={jobPosting}
            onChange={setJobPosting}
            placeholder="Paste the full job description..."
          />
          <Field
            label="Your resume"
            hint={`${resume.length.toLocaleString()} chars`}
            value={resume}
            onChange={setResume}
            placeholder="Paste your resume text..."
          />
        </section>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={run}
            disabled={!canRun}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-[color:var(--on-accent)] shadow-soft transition-all duration-200 hover:bg-accent-strong hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {status === "running" ? (
              <>
                <Spinner /> Analyzing
              </>
            ) : (
              <>Analyze fit &rarr;</>
            )}
          </button>
          <button
            onClick={loadExample}
            disabled={status === "running"}
            className="rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            Try an example
          </button>
        </div>

        {error && (
          <div className="mt-8 animate-rise rounded-2xl border border-gap/40 bg-gap-tint px-5 py-4 text-sm text-gap">
            <span className="font-semibold">Analysis failed.</span> {error}
          </div>
        )}

        {hasResult && !error && (
          <section className="mt-12">
            <Pipeline
              status={status}
              hasKey={hasKey}
              coverage={coverage}
              suggestions={suggestions}
              narrative={narrative}
              toolsSeen={toolsSeen}
            />

            {coverage && (
              <div className="mt-8 grid animate-rise gap-6 lg:grid-cols-[auto_1fr]">
                <ScoreGauge score={coverage.coverage_score} />
                <Breakdown coverage={coverage} suggestions={suggestions} />
              </div>
            )}

            <Narrative
              text={narrative}
              running={status === "running"}
              hasKey={hasKey}
              hasCoverage={Boolean(coverage)}
            />
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

/* ---------------------------------------------------------------- Top bar */

function TopBar({ hasKey }: { hasKey: boolean | null }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line/70 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5 sm:px-8">
        <a href="/" className="flex items-baseline gap-2">
          <span className="font-display text-lg font-semibold tracking-tight">
            Job-Fit
          </span>
          <span className="font-display text-lg text-accent">Analyzer</span>
        </a>
        <div className="flex items-center gap-2.5">
          <ModeBadge hasKey={hasKey} />
          <a
            href="https://github.com/gathrean/job-fit-analyzer"
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-full border border-line-strong px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent sm:block"
          >
            GitHub
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function ModeBadge({ hasKey }: { hasKey: boolean | null }) {
  if (hasKey === null) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
      style={{
        borderColor: hasKey ? "var(--good)" : "var(--line-strong)",
        color: hasKey ? "var(--good)" : "var(--muted)",
      }}
      title={
        hasKey
          ? "An Anthropic API key is set: Claude writes the full analysis."
          : "No API key: the MCP tools run directly (deterministic, no LLM)."
      }
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: hasKey ? "var(--good)" : "var(--faint)" }}
      />
      {hasKey ? "Live" : "Demo"}
    </span>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle color theme"
      className="grid h-8 w-8 place-items-center rounded-full border border-line-strong text-muted transition-colors hover:border-accent hover:text-accent"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/* ---------------------------------------------------------------- Input */

function Field(props: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="group flex flex-col">
      <span className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">{props.label}</span>
        <span className="text-xs tabular-nums text-faint">{props.hint}</span>
      </span>
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        spellCheck={false}
        className="scroll-quiet h-60 resize-y rounded-2xl border border-line bg-surface p-4 text-sm leading-relaxed text-ink shadow-soft outline-none transition-colors placeholder:text-faint focus:border-accent"
      />
    </label>
  );
}

/* ---------------------------------------------------------------- Pipeline */

type StepState = "idle" | "active" | "done";

function Pipeline({
  status,
  hasKey,
  coverage,
  suggestions,
  narrative,
  toolsSeen,
}: {
  status: Status;
  hasKey: boolean | null;
  coverage: CoverageResult | null;
  suggestions: Suggestion[] | null;
  narrative: string;
  toolsSeen: Set<string>;
}) {
  const running = status === "running";
  const noGaps = Boolean(coverage && coverage.missing.length === 0);

  const steps: { label: string; state: StepState }[] = [
    {
      label: "Extract requirements",
      state: coverage ? "done" : running ? "active" : "idle",
    },
    {
      label: "check_keyword_coverage",
      state: coverage
        ? "done"
        : toolsSeen.has("check_keyword_coverage")
          ? "active"
          : "idle",
    },
    {
      label: "suggest_resume_edits",
      state: suggestions
        ? "done"
        : noGaps
          ? "done"
          : toolsSeen.has("suggest_resume_edits")
            ? "active"
            : "idle",
    },
  ];
  if (hasKey) {
    steps.push({
      label: "Write analysis",
      state:
        status === "done"
          ? "done"
          : narrative
            ? "active"
            : "idle",
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1.5">
          {i > 0 && <span className="h-px w-5 bg-line-strong" aria-hidden />}
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              borderColor:
                s.state === "idle" ? "var(--line)" : "var(--accent)",
              background:
                s.state === "done" ? "var(--accent-tint)" : "transparent",
              color:
                s.state === "idle" ? "var(--faint)" : "var(--accent-strong)",
            }}
          >
            <StepDot state={s.state} />
            <span className="font-mono">{s.label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function StepDot({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <svg viewBox="0 0 12 12" className="h-3 w-3" style={{ color: "var(--accent)" }}>
        <path
          d="M2.5 6.5l2.2 2.2 4.8-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (state === "active")
    return (
      <span
        className="h-2 w-2 animate-pulse rounded-full"
        style={{ background: "var(--accent)" }}
      />
    );
  return (
    <span
      className="h-2 w-2 rounded-full border"
      style={{ borderColor: "var(--faint)" }}
    />
  );
}

/* ---------------------------------------------------------------- Score gauge */

function ScoreGauge({ score }: { score: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const [offset, setOffset] = useState(c);

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setOffset(c * (1 - Math.max(0, Math.min(100, score)) / 100)),
    );
    return () => cancelAnimationFrame(id);
  }, [score, c]);

  const band =
    score >= 75 ? "var(--good)" : score >= 50 ? "var(--accent)" : "var(--gap)";
  const label =
    score >= 75 ? "Strong match" : score >= 50 ? "Partial match" : "Limited match";

  return (
    <div className="flex flex-row items-center gap-5 rounded-2xl border border-line bg-surface p-6 shadow-soft lg:w-56 lg:flex-col lg:gap-3 lg:text-center">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 130 130" className="h-full w-full -rotate-90">
          <circle
            cx="65"
            cy="65"
            r={r}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth="11"
          />
          <circle
            cx="65"
            cy="65"
            r={r}
            fill="none"
            stroke={band}
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="gauge-arc"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-4xl font-semibold tabular-nums leading-none">
            {score}
          </span>
          <span className="mt-0.5 text-xs text-faint">/ 100</span>
        </div>
      </div>
      <div>
        <p className="font-medium" style={{ color: band }}>
          {label}
        </p>
        <p className="mt-0.5 text-xs text-muted">coverage score</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Breakdown */

function Breakdown({
  coverage,
  suggestions,
}: {
  coverage: CoverageResult;
  suggestions: Suggestion[] | null;
}) {
  const covered = coverage.results.filter((r) => r.covered);
  const missing = coverage.results.filter((r) => !r.covered);
  const suggestionFor = (requirement: string) =>
    suggestions?.find((s) => s.requirement === requirement)?.suggestion;

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
      <Group
        title="Covered"
        count={covered.length}
        tone="good"
        empty="No requirements matched yet."
      >
        {covered.map((item) => (
          <CoveredRow key={item.requirement} item={item} />
        ))}
      </Group>

      {missing.length > 0 && (
        <Group title="Gaps" count={missing.length} tone="gap" className="mt-6">
          {missing.map((item) => (
            <GapRow
              key={item.requirement}
              item={item}
              suggestion={suggestionFor(item.requirement)}
            />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({
  title,
  count,
  tone,
  empty,
  className = "",
  children,
}: {
  title: string;
  count: number;
  tone: "good" | "gap";
  empty?: string;
  className?: string;
  children: ReactNode;
}) {
  const color = tone === "good" ? "var(--good)" : "var(--gap)";
  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="text-xs tabular-nums text-faint">{count}</span>
      </div>
      {count === 0 && empty ? (
        <p className="text-sm text-faint">{empty}</p>
      ) : (
        <ul className="space-y-2.5">{children}</ul>
      )}
    </div>
  );
}

function CoveredRow({ item }: { item: CoverageItem }) {
  return (
    <li className="flex flex-col gap-1 border-b border-line pb-2.5 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-ink">{item.requirement}</span>
        <MatchTag type={item.match_type} />
      </div>
      {item.evidence && (
        <p className="max-w-md text-xs italic leading-relaxed text-faint sm:text-right">
          &ldquo;{item.evidence}&rdquo;
        </p>
      )}
    </li>
  );
}

function GapRow({
  item,
  suggestion,
}: {
  item: CoverageItem;
  suggestion?: string;
}) {
  return (
    <li className="border-b border-line pb-2.5 last:border-0 last:pb-0">
      <span className="text-sm font-medium text-ink">{item.requirement}</span>
      {suggestion && (
        <p className="mt-1 text-xs leading-relaxed text-muted">{suggestion}</p>
      )}
    </li>
  );
}

function MatchTag({ type }: { type: CoverageItem["match_type"] }) {
  return (
    <span
      className="rounded-md bg-good-tint px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide"
      style={{ color: "var(--good)" }}
    >
      {type}
    </span>
  );
}

/* ---------------------------------------------------------------- Narrative */

function Narrative({
  text,
  running,
  hasKey,
  hasCoverage,
}: {
  text: string;
  running: boolean;
  hasKey: boolean | null;
  hasCoverage: boolean;
}) {
  if (text) {
    return (
      <div className="mt-8 animate-rise rounded-2xl border border-line bg-surface p-6 shadow-soft sm:p-8">
        <h2 className="mb-4 font-display text-xl font-semibold">
          Claude&rsquo;s analysis
        </h2>
        <div className="narrative prose prose-sm max-w-none sm:prose-base prose-pre:rounded-xl prose-pre:border prose-pre:border-line">
          <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
          {running && (
            <span
              className="animate-caret ml-0.5 inline-block h-4 w-[2px] align-middle"
              style={{ background: "var(--accent)" }}
            />
          )}
        </div>
      </div>
    );
  }

  // Demo mode: the structured breakdown above is the whole story.
  if (!running && hasKey === false && hasCoverage) {
    return (
      <p className="mt-6 text-sm text-muted">
        Everything above is computed by the MCP tools, no LLM involved. Add an
        Anthropic API key and Claude writes a full written analysis on top of these
        grounded facts.
      </p>
    );
  }
  return null;
}

/* ---------------------------------------------------------------- Footer */

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-8 text-sm text-faint sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>
          React + TypeScript UI &middot; agentic Claude loop &middot; custom MCP server.
        </p>
        <a
          href="https://github.com/gathrean/job-fit-analyzer"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-muted transition-colors hover:text-accent"
        >
          View the source &rarr;
        </a>
      </div>
    </footer>
  );
}

/* ---------------------------------------------------------------- Icons */

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 animate-spin" aria-hidden>
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="2"
      />
      <path
        d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="3.5" />
      <path
        strokeLinecap="round"
        d="M10 2.5v1.5M10 16v1.5M17.5 10H16M4 10H2.5M15.3 4.7l-1 1M5.7 14.3l-1 1M15.3 15.3l-1-1M5.7 5.7l-1-1"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 11.8A6.5 6.5 0 1 1 8.2 3.5a5 5 0 0 0 8.3 8.3z"
      />
    </svg>
  );
}
