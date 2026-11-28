import tailwindcssAnimate from "tailwindcss-animate";

function c(name) {
  return `rgb(var(--${name}) / <alpha-value>)`;
}

const config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: c("border"),
        input: c("input"),
        ring: c("ring"),
        background: c("background"),
        foreground: c("foreground"),
        primary: {
          DEFAULT: c("primary"),
          foreground: c("primary-foreground"),
        },
        secondary: {
          DEFAULT: c("secondary"),
          foreground: c("secondary-foreground"),
        },
        destructive: {
          DEFAULT: c("destructive"),
          foreground: c("destructive-foreground"),
        },
        muted: {
          DEFAULT: c("muted"),
          foreground: c("muted-foreground"),
        },
        accent: {
          DEFAULT: c("accent"),
          foreground: c("accent-foreground"),
        },
        "accent-soft": {
          DEFAULT: c("accent"),
          foreground: c("accent-foreground"),
        },
        popover: {
          DEFAULT: c("popover"),
          foreground: c("popover-foreground"),
        },
        card: {
          DEFAULT: c("card"),
          foreground: c("card-foreground"),
        },
        sidebar: {
          DEFAULT: c("sidebar"),
          foreground: c("sidebar-foreground"),
          primary: c("sidebar-primary"),
          "primary-foreground": c("sidebar-primary-foreground"),
          accent: c("sidebar-accent"),
          "accent-foreground": c("sidebar-accent-foreground"),
          border: c("sidebar-border"),
          ring: c("sidebar-ring"),
        },
        chart: {
          1: c("chart-1"),
          2: c("chart-2"),
          3: c("chart-3"),
          4: c("chart-4"),
          5: c("chart-5"),
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
