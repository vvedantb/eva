import tailwindcssAnimate from "tailwindcss-animate";
import tailwindcssTypography from "@tailwindcss/typography";

/** Colour with Tailwind's opacity modifier. The tokens are full colours
 * (oklch or rgb), so the alpha is mixed in rather than written as `/ <alpha>`. */
function v(name) {
  return `color-mix(in oklch, var(--${name}) calc(<alpha-value> * 100%), transparent)`;
}

/** Maps Tailwind Typography's colour variables onto the design tokens. */
function proseTokenCss() {
  return {
    "--tw-prose-body": "var(--foreground)",
    "--tw-prose-headings": "var(--foreground)",
    "--tw-prose-lead": "var(--muted)",
    "--tw-prose-links": "var(--accent)",
    "--tw-prose-bold": "var(--foreground)",
    "--tw-prose-counters": "var(--muted)",
    "--tw-prose-bullets": "var(--muted)",
    "--tw-prose-hr": "var(--border)",
    "--tw-prose-quotes": "var(--foreground)",
    "--tw-prose-quote-borders": "var(--border)",
    "--tw-prose-captions": "var(--muted)",
    "--tw-prose-kbd": "var(--foreground)",
    // Used directly as a box-shadow colour, so the translucency is baked in
    // (upstream default is the heading colour at 10%).
    "--tw-prose-kbd-shadows":
      "color-mix(in oklch, var(--foreground) 10%, transparent)",
    "--tw-prose-code": "var(--foreground)",
    "--tw-prose-pre-code": "var(--foreground)",
    "--tw-prose-pre-bg": "var(--surface-secondary)",
    "--tw-prose-th-borders": "var(--border)",
    "--tw-prose-td-borders": "var(--border)",
  };
}

/** Colour names that `@vvedantb/ui/tokens` defines in its CSS `@theme`
 * (`primary` is the brand `--accent`, `card`, `popover`, `destructive` and the
 * rest) win over this file, so they are not repeated here. Only eva's own
 * tokens and sub-keys live below. The shadcn `muted` fill is remapped in
 * `globals.css` for the same reason. */
export const themeExtend = {
  colors: {
    // Soft hover / selected fill. `accent` itself stays the package brand.
    "accent-soft": {
      DEFAULT: v("accent-soft"),
      foreground: v("accent-soft-foreground"),
    },
    destructive: {
      DEFAULT: v("danger"),
      foreground: v("danger-foreground"),
      bg: v("destructive-bg"),
      strong: v("destructive-strong"),
    },
    warning: {
      DEFAULT: v("warning"),
      foreground: v("warning-foreground"),
      strong: v("warning-strong"),
    },
    sidebar: {
      DEFAULT: v("background"),
      foreground: v("foreground"),
      primary: v("accent"),
      "primary-foreground": v("accent-foreground"),
      accent: v("sidebar-accent"),
      "accent-foreground": v("accent-soft-foreground"),
      border: v("border"),
      ring: v("focus"),
    },
    chart: {
      1: v("chart-1"),
      2: v("chart-2"),
      3: v("chart-3"),
      4: v("chart-4"),
      5: v("chart-5"),
    },
    // Muted categorical ramp for hash-assigned identity colour (tab groups,
    // repo tiles, avatars) — not for status; status uses `status-*`.
    cat: {
      1: v("cat-1"),
      2: v("cat-2"),
      3: v("cat-3"),
      4: v("cat-4"),
      5: v("cat-5"),
      6: v("cat-6"),
      7: v("cat-7"),
      8: v("cat-8"),
    },
    "warning-bg": v("warning-bg"),
    "success-bg": v("success-bg"),
    status: {
      progress: {
        DEFAULT: v("status-progress"),
        bg: v("status-progress-bg"),
        subtle: v("status-progress-subtle"),
        bar: v("status-progress-bar"),
      },
      "business-review": {
        DEFAULT: v("status-business-review"),
        bg: v("status-business-review-bg"),
        subtle: v("status-business-review-subtle"),
        bar: v("status-business-review-bar"),
      },
      "code-review": {
        DEFAULT: v("status-code-review"),
        bg: v("status-code-review-bg"),
        subtle: v("status-code-review-subtle"),
        bar: v("status-code-review-bar"),
      },
      done: {
        DEFAULT: v("status-done"),
        bg: v("status-done-bg"),
        subtle: v("status-done-subtle"),
        bar: v("status-done-bar"),
      },
      cancelled: {
        DEFAULT: v("status-cancelled"),
        bg: v("status-cancelled-bg"),
        subtle: v("status-cancelled-subtle"),
        bar: v("status-cancelled-bar"),
      },
    },
  },
  boxShadow: {
    "2xs": "var(--shadow-2xs)",
    xs: "var(--shadow-xs)",
    sm: "var(--shadow-sm)",
    DEFAULT: "var(--shadow)",
    md: "var(--shadow-md)",
    lg: "var(--shadow-lg)",
    xl: "var(--shadow-xl)",
    "2xl": "var(--shadow-2xl)",
  },
  borderRadius: {
    // Controls stay ~10px, surfaces 12–16px, menu items tighter still. Capped
    // so the "Full" radius theme (--radius: 9999px) cannot turn these into pills.
    surface: "clamp(0.75rem, var(--radius), 1rem)",
    control: "min(var(--radius), 0.625rem)",
    "menu-item": "min(var(--radius), 0.5rem)",
    "2xl": "calc(var(--radius) + 8px)",
    xl: "calc(var(--radius) + 4px)",
    lg: "var(--radius)",
    md: "calc(var(--radius) - 2px)",
    sm: "calc(var(--radius) - 4px)",
  },
  fontFamily: {
    sans: ["var(--font-sans)"],
    mono: ["var(--font-mono)"],
  },
  // Do NOT add `transitionDuration.DEFAULT` / `transitionTimingFunction.DEFAULT`
  // here. A v3-config override of either one makes Tailwind v4 drop its own
  // `--default-transition-duration` / `--default-transition-timing-function`
  // definitions from the sheet while still emitting the 29 `var()` references to
  // them, so every bare `transition-*` falls back to `0s` and stops animating.
  // The house defaults live in the `@theme` block in `globals.css` instead.
  // The `text-*` scale (size-specific tracking, `3xs`/`2xs`/`2sm` tiers) comes
  // from `@vvedantb/ui/tokens` (type-scale.css), imported in `globals.css`.
  // Tailwind Typography ships an unthemed grey palette, which fights the design
  // tokens wherever rendered markdown sits next to normal UI text. Both the base
  // and `prose-invert` variable sets point at the same tokens, because the tokens
  // already flip on `.dark` — so `dark:prose-invert` becomes a harmless no-op.
  typography: {
    DEFAULT: { css: proseTokenCss() },
    invert: { css: proseTokenCss() },
  },
};

/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: { extend: themeExtend },
  plugins: [tailwindcssAnimate, tailwindcssTypography],
};
export default config;
