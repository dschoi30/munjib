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
        primary: "var(--color-brand-primary)",
        "primary-hover": "var(--color-brand-primary-hover)",
        "primary-active": "var(--color-brand-primary-active)",
        "primary-foreground": "var(--color-brand-primary-foreground)",
        "primary-muted": "var(--color-brand-primary-muted)",
        "primary-muted-hover": "var(--color-brand-primary-muted-hover)",
        border: "var(--color-border-default)",
        "border-muted": "var(--color-border-muted)",
        "border-strong": "var(--color-border-strong)",
        "border-danger": "var(--color-border-danger)",
        "surface-page": "var(--color-surface-page)",
        surface: "var(--color-surface-card)",
        "surface-control": "var(--color-surface-control)",
        "surface-editor": "var(--color-surface-editor)",
        "surface-inverse": "var(--color-surface-inverse)",
        muted: "var(--color-surface-muted)",
        "surface-muted": "var(--color-surface-muted)",
        "surface-danger": "var(--color-surface-danger)",
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
        interactive: "var(--radius-interactive)",
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
