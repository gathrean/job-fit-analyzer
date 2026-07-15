/**
 * Second deterministic tool: suggest_resume_edits.
 *
 * Given the resume and the requirements it's *missing*, produce concrete, grounded
 * edit suggestions — still no LLM. The trick that keeps it useful instead of generic:
 * for each gap we look for a same-category skill the resume already has, and suggest
 * bridging from it. "You show REST + Node; if you've touched GraphQL, add it there."
 * Claude chains this after check_keyword_coverage and folds the results into its Gaps.
 */

import { canonicalize, indexResume, matchRequirement } from "./matching.js";

/** Skill -> category, used to find related experience already in the resume. */
const CATEGORY_OF: Record<string, string> = {
  react: "frontend", "react native": "frontend", "next.js": "frontend", vue: "frontend",
  angular: "frontend", svelte: "frontend", redux: "frontend", javascript: "frontend",
  typescript: "frontend", html: "frontend", css: "frontend", tailwind: "frontend",
  accessibility: "frontend",
  node: "backend", express: "backend", python: "backend", java: "backend", go: "backend",
  "rest api": "backend", graphql: "backend", microservices: "backend",
  postgresql: "database", mysql: "database", mongodb: "database", redis: "database", sql: "database",
  docker: "devops", kubernetes: "devops", "ci/cd": "devops", aws: "devops", gcp: "devops",
  azure: "devops", terraform: "devops",
  "unit testing": "testing", "end-to-end testing": "testing",
};

/** Every known skill in a category (for scanning the resume for related experience). */
const SKILLS_BY_CATEGORY: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const [skill, cat] of Object.entries(CATEGORY_OF)) {
    (out[cat] ??= []).push(skill);
  }
  return out;
})();

const BULLET_TEMPLATE: Record<string, (skill: string, related?: string) => string> = {
  frontend: (s, r) =>
    r
      ? `Built responsive UI with ${r}; extend a bullet to name ${s} explicitly, e.g. "Implemented accessible components in ${r} and ${s}."`
      : `Add a front-end bullet naming ${s}, e.g. "Built a responsive interface using ${s}."`,
  backend: (s, r) =>
    r
      ? `You already show ${r}. If you've used ${s}, add it beside that work, e.g. "Exposed a ${s} layer over the existing ${r} service."`
      : `Add a back-end bullet for ${s}, e.g. "Designed and shipped a ${s} consumed by the front-end."`,
  database: (s, r) =>
    r
      ? `You list ${r}. Mention ${s} alongside it, e.g. "Modeled and queried data in ${r} and ${s}."`
      : `Add a data bullet naming ${s}, e.g. "Designed schemas and queries in ${s}."`,
  devops: (s, r) =>
    r
      ? `You show ${r}. Note ${s} in the same pipeline, e.g. "Automated builds with ${r} and deployed via ${s}."`
      : `Add a delivery bullet for ${s}, e.g. "Set up ${s} to build, test, and deploy the app."`,
  testing: (s, r) =>
    r
      ? `You already do ${r}. Call out ${s} too, e.g. "Covered critical paths with ${r} and ${s}."`
      : `Add a testing bullet for ${s}, e.g. "Wrote ${s} covering the core user flows."`,
  general: (s) => `Add a concrete bullet demonstrating ${s} with a measurable outcome.`,
};

export interface Suggestion {
  requirement: string;
  skill: string;
  category: string;
  related_present: string[]; // same-category skills the resume already shows
  suggestion: string;
}

/** Build one grounded suggestion per missing requirement. */
export function suggestEdits(resume: string, missing: string[]): Suggestion[] {
  const idx = indexResume(resume);

  return missing.map((requirement) => {
    const skill = canonicalize(requirement);
    const category = CATEGORY_OF[skill] ?? "general";

    // Which other skills in this category does the resume already prove?
    const related = (SKILLS_BY_CATEGORY[category] ?? [])
      .filter((s) => s !== skill)
      .filter((s) => matchRequirement(s, idx).covered);

    const template = BULLET_TEMPLATE[category] ?? BULLET_TEMPLATE.general;
    return {
      requirement,
      skill,
      category,
      related_present: related,
      suggestion: template(skill, related[0]),
    };
  });
}
