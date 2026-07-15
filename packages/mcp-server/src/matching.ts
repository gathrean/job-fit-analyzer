/**
 * Deterministic skill matching — the grounding layer.
 *
 * No LLM here on purpose. Given a requirement string ("3+ years of React") and a
 * resume, we decide — with plain, explainable rules — whether the skill is present
 * and show the evidence. Four tiers, most confident first:
 *   exact   — the skill's own phrase appears verbatim
 *   alias   — a known spelling appears (JS↔JavaScript, Node.js↔NodeJS, REST↔RESTful)
 *   stemmed — every content word matches after light stemming (design↔designing)
 *   partial — ≥60% of content words appear (loose fallback)
 */

export type MatchType = "exact" | "alias" | "stemmed" | "partial" | "none";

export interface Match {
  requirement: string;
  skill: string; // the canonical skill after stripping qualifiers/aliasing
  covered: boolean;
  match_type: MatchType;
  evidence?: string; // short snippet from the resume showing where it matched
}

/**
 * Canonical skill -> alternate spellings. Matching is symmetric: a requirement or a
 * resume mentioning any surface form resolves to the same canonical skill.
 */
const ALIASES: Record<string, string[]> = {
  javascript: ["js", "ecmascript", "es6", "es2015"],
  typescript: ["ts"],
  react: ["reactjs", "react.js"],
  "react native": ["reactnative", "react-native"],
  "next.js": ["nextjs", "next js"],
  node: ["nodejs", "node.js"],
  express: ["expressjs", "express.js"],
  "rest api": ["rest", "restful", "restful api", "rest apis", "rest services"],
  graphql: ["gql", "apollo"],
  redux: ["redux toolkit", "rtk"],
  tailwind: ["tailwindcss", "tailwind css"],
  css: ["css3", "scss", "sass"],
  html: ["html5"],
  postgresql: ["postgres", "psql"],
  mongodb: ["mongo"],
  kubernetes: ["k8s"],
  docker: ["containers", "containerization"],
  "ci/cd": ["cicd", "ci cd", "continuous integration", "continuous delivery", "continuous deployment", "github actions"],
  aws: ["amazon web services"],
  "unit testing": ["unit tests", "jest", "vitest"],
  "end-to-end testing": ["e2e", "e2e testing", "cypress", "playwright"],
  accessibility: ["a11y", "wcag"],
};

/** alias surface form -> canonical skill (built once from ALIASES). */
const ALIAS_TO_CANONICAL: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    map[canonical] = canonical;
    for (const a of aliases) map[a] = canonical;
  }
  return map;
})();

/** Words that describe the *ask* around a skill, not the skill itself. */
const QUALIFIER_PATTERNS: RegExp[] = [
  /\b\d+\s*\+?\s*(?:years?|yrs?)\b/g,
  /\byears?\s+of\s+experience\b/g,
  /\bexperience\s+(?:with|in|of|using)\b/g,
  /\b(?:strong|solid|proven|hands[- ]?on|deep|extensive|working|advanced|excellent|good|basic)\b/g,
  /\b(?:proficien\w*|expert\w*|knowledge|familiar\w*|understanding|proficiency|fluency|competen\w*|ability)\b/g,
  /\b(?:required|preferred|must[- ]?have|nice[- ]?to[- ]?have|a\s+plus|plus|ideally|bonus)\b/g,
  /\bin\s+(?:building|developing|designing|writing)\b/g,
];

const STOPWORDS = new Set([
  "and", "or", "the", "of", "in", "with", "for", "to", "a", "an", "on", "using",
  "our", "your", "their", "is", "are", "be", "as", "at", "by", "we", "you",
]);

/** Split into clean lowercase tokens, keeping tech punctuation like c++ / c#. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+.#]+/)
    .map((t) => t.replace(/^[.+#]+|[.+#]+$/g, "")) // trim edge punctuation, keep c++ internal
    .filter((t) => t.length > 0);
}

/** Content tokens of a phrase: drop stopwords and 1-char noise. */
function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Conservative stemmer: normalizes plurals and common verb endings only. */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  for (const suf of ["ing", "ers", "ment", "tion", "er", "ed", "es", "s"]) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) {
      return word.slice(0, word.length - suf.length);
    }
  }
  return word;
}

/** Remove spaces/dots/slashes so react.js, react js and reactjs all compare equal. */
function squash(text: string): string {
  return text.toLowerCase().replace(/[.\s_/-]+/g, "");
}

/** Strip "3 years of", "strong experience with", "a plus", etc. down to the skill. */
export function stripQualifiers(requirement: string): string {
  let s = requirement.toLowerCase();
  for (const re of QUALIFIER_PATTERNS) s = s.replace(re, " ");
  s = s.replace(/[(),;:]/g, " ").replace(/\s+/g, " ").trim();
  // Drop dangling connective words left at the edges (e.g. "of react" -> "react").
  const words = s.split(" ").filter(Boolean);
  while (words.length && STOPWORDS.has(words[0])) words.shift();
  while (words.length && STOPWORDS.has(words[words.length - 1])) words.pop();
  s = words.join(" ");
  return s || requirement.trim().toLowerCase();
}

/** Resolve a cleaned skill phrase to its canonical form (via the alias table). */
export function canonicalize(skill: string): string {
  const key = skill.trim().toLowerCase();
  if (ALIAS_TO_CANONICAL[key]) return ALIAS_TO_CANONICAL[key];
  const sq = squash(key);
  for (const [surface, canonical] of Object.entries(ALIAS_TO_CANONICAL)) {
    if (squash(surface) === sq) return canonical;
  }
  return key;
}

/** Every surface form (canonical + aliases) that should count as this skill. */
function surfaceForms(canonical: string): string[] {
  const forms = new Set<string>([canonical]);
  for (const a of ALIASES[canonical] ?? []) forms.add(a);
  return [...forms];
}

/** Precomputed views of a resume so we don't re-scan it per requirement. */
interface ResumeIndex {
  lower: string;
  squashed: string;
  tokens: Set<string>;
  stems: Set<string>;
}

export function indexResume(resume: string): ResumeIndex {
  const tokens = tokenize(resume).filter((t) => t.length > 1);
  return {
    lower: resume.toLowerCase(),
    squashed: squash(resume),
    tokens: new Set(tokens),
    stems: new Set(tokens.map(stem)),
  };
}

/**
 * How a surface form hit the resume:
 *  "whole"  — appears as a whole token / verbatim phrase (strongest)
 *  "squash" — appears once spacing/punctuation is ignored (react.js ↔ reactjs)
 *  null     — not present as a surface form (word-level tiers may still catch it)
 */
type Hit = "whole" | "squash";

function surfaceHit(surface: string, idx: ResumeIndex): Hit | null {
  const parts = contentTokens(surface);
  if (parts.length > 1) {
    if (idx.lower.includes(surface.toLowerCase())) return "whole";
    if (idx.squashed.includes(squash(surface))) return "squash";
    return null;
  }
  const one = parts[0] ?? squash(surface);
  if (idx.tokens.has(one)) return "whole";
  // Short forms (js, ts, go, ci, qa) must hit a whole token, never a substring.
  if (one.length <= 3) return null;
  if (idx.squashed.includes(one)) return "squash";
  return null;
}

/** A ~140-char single-line window of the resume around `needle`, for display. */
function evidenceFor(needle: string, idx: ResumeIndex): string | undefined {
  const at = idx.lower.indexOf(needle.toLowerCase());
  if (at === -1) return undefined;
  const start = Math.max(0, at - 50);
  const end = Math.min(idx.lower.length, at + needle.length + 50);
  const raw = idx.lower.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + raw + (end < idx.lower.length ? "…" : "");
}

/** Decide whether one requirement is covered, and how. */
export function matchRequirement(requirement: string, idx: ResumeIndex): Match {
  const core = stripQualifiers(requirement);
  const skill = canonicalize(core);
  const base: Match = { requirement, skill, covered: false, match_type: "none" };

  // Tier 1 & 2: exact / alias — any surface form appears.
  const forms = surfaceForms(skill);
  for (const form of forms) {
    const hit = surfaceHit(form, idx);
    if (hit) {
      // "exact" only when the skill's own phrase appears verbatim; anything that
      // required an alias or squashing is reported as "alias".
      const isExact = hit === "whole" && squash(form) === squash(core);
      return {
        ...base,
        covered: true,
        match_type: isExact ? "exact" : "alias",
        evidence: evidenceFor(form, idx) ?? evidenceFor(contentTokens(form)[0] ?? form, idx),
      };
    }
  }

  // Tier 3: stemmed — every content word of the skill matches after stemming.
  const words = contentTokens(core);
  if (words.length > 0 && words.every((w) => idx.stems.has(stem(w)))) {
    return { ...base, covered: true, match_type: "stemmed", evidence: evidenceFor(words[0], idx) };
  }

  // Tier 4: partial — ≥60% of content words present.
  if (words.length > 0) {
    const hits = words.filter((w) => idx.tokens.has(w) || idx.stems.has(stem(w)));
    if (hits.length / words.length >= 0.6) {
      return { ...base, covered: true, match_type: "partial", evidence: evidenceFor(hits[0], idx) };
    }
  }

  return base;
}
