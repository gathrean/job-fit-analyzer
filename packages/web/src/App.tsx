import { useState } from "react";
import { streamAnalyze } from "./streamAnalyze";

interface ToolCall {
  name: string;
  input: unknown;
}

export default function App() {
  const [jobPosting, setJobPosting] = useState("");
  const [resume, setResume] = useState("");
  const [output, setOutput] = useState("");
  const [tools, setTools] = useState<ToolCall[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = jobPosting.trim() && resume.trim() && !running;

  async function run() {
    setRunning(true);
    setOutput("");
    setTools([]);
    setError(null);
    try {
      await streamAnalyze(
        { jobPosting, resume },
        {
          onDelta: (text) => setOutput((prev) => prev + text),
          onTool: (info) => setTools((prev) => [...prev, info]),
          onError: (message) => setError(message),
          onDone: () => setRunning(false),
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Job-Fit Analyzer</h1>
          <p className="mt-1 text-slate-600">
            Paste a job posting and your resume. Claude scores the match, grounded by an
            MCP tool that checks which requirements actually appear in your resume.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Job posting"
            value={jobPosting}
            onChange={setJobPosting}
            placeholder="Paste the full job description…"
          />
          <Field
            label="Your resume"
            value={resume}
            onChange={setResume}
            placeholder="Paste your resume text…"
          />
        </div>

        <button
          onClick={run}
          disabled={!canRun}
          className="mt-4 rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Analyzing…" : "Analyze fit"}
        </button>

        {tools.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {tools.map((t, i) => (
              <span
                key={i}
                className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800"
              >
                🔧 called MCP tool: {t.name}
              </span>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
            {error}
          </div>
        )}

        {(output || running) && (
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Result</h2>
            <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-slate-800">
              {output}
              {running && <span className="animate-pulse">▍</span>}
            </pre>
          </section>
        )}
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col">
      <span className="mb-1 text-sm font-medium text-slate-700">{props.label}</span>
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="h-64 resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />
    </label>
  );
}
