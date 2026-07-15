import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // All colors resolve to OKLCH CSS variables defined in index.css, so the same
      // class names produce the light and dark palettes without duplicated utilities.
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        accent: "var(--accent)",
        "accent-strong": "var(--accent-strong)",
        "accent-tint": "var(--accent-tint)",
        good: "var(--good)",
        "good-tint": "var(--good-tint)",
        gap: "var(--gap)",
        "gap-tint": "var(--gap-tint)",
      },
      fontFamily: {
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px oklch(0 0 0 / 0.04), 0 8px 24px -12px oklch(0 0 0 / 0.12)",
        lift: "0 2px 4px oklch(0 0 0 / 0.05), 0 18px 40px -18px oklch(0 0 0 / 0.22)",
      },
    },
  },
  plugins: [typography],
};
