import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "var(--color-border-default)",
        "border-muted": "var(--color-border-muted)",
        surface: "var(--color-surface-card)",
        muted: "var(--color-surface-muted)",
        ink: "var(--color-text-body)",
        "ink-muted": "var(--color-text-muted)",
        "ink-inverse": "var(--color-text-inverse)",
        danger: "var(--color-text-danger)",
        "danger-surface": "var(--color-surface-danger)",
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card-default)",
        interactive: "var(--shadow-interactive)",
        subtle: "var(--shadow-subtle)",
      },
      fontFamily: {
        sans: ["var(--font-family-primary)"],
      },
      transitionDuration: {
        instant: "var(--motion-duration-instant)",
        fast: "var(--motion-duration-fast)",
        normal: "var(--motion-duration-normal)",
      },
    },
  },
  plugins: [],
};

export default config;
