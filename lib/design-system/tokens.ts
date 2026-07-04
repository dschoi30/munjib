export const honenDesignTokens = {
  font: {
    family: {
      primary: "Inter",
      stack: "Inter, Helvetica Neue, system-ui, sans-serif",
    },
    size: {
      xs: "7.5px",
      sm: "9.5px",
      md: "11.5px",
      lg: "12px",
      xl: "12.48px",
      "2xl": "12.5px",
      "3xl": "13px",
      "4xl": "13.5px",
      base: "16px",
    },
    weight: {
      base: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    },
    lineHeight: {
      base: "24px",
      compact: "1.25",
      relaxed: "1.65",
    },
  },
  color: {
    brand: {
      primary: "#2f7d46",
      primaryHover: "#286d3d",
      primaryActive: "#225f35",
      primaryForeground: "#ffffff",
      primaryMuted: "#edf4ee",
      primaryMutedHover: "#e4eee5",
    },
    text: {
      body: "#191818",
      heading: "#1a1a1a",
      muted: "#5e5b50",
      inverse: "#ffffff",
      danger: "#9f1239",
    },
    surface: {
      page: "#f7f6f1",
      card: "#ffffff",
      control: "#ffffff",
      editor: "#fbfaf6",
      inverse: "#000000",
      muted: "#f2f1ec",
      danger: "#fff1f2",
    },
    border: {
      default: "#e5e1d8",
      muted: "#eeeae1",
      strong: "#756f63",
      danger: "#e11d48",
    },
    focus: {
      ring: "#2563eb",
    },
  },
  space: {
    1: "2px",
    2: "6px",
    3: "7px",
    4: "8px",
    5: "9px",
    6: "10px",
    7: "12px",
    8: "13px",
  },
  radius: {
    xs: "4px",
    sm: "7px",
    md: "10px",
    lg: "12px",
    xl: "16px",
    "2xl": "20px",
    step7: "50px",
    step8: "999px",
  },
  shadow: {
    1: "rgba(0, 0, 0, 0.03) 0px 1px 2px 0px, rgba(0, 0, 0, 0.06) 0px 8px 22px 0px",
    2: "rgba(0, 0, 0, 0.18) 0px 1px 2px 0px, rgba(0, 0, 0, 0.14) 0px 4px 12px 0px",
    3: "rgba(25, 24, 24, 0.18) 0px 1px 2px 0px, rgba(25, 24, 24, 0.14) 0px 8px 20px 0px",
    4: "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px",
  },
  motion: {
    duration: {
      instant: "120ms",
      fast: "140ms",
      normal: "150ms",
      slow: "160ms",
      slower: "180ms",
      step6: "200ms",
      step7: "240ms",
      step8: "420ms",
    },
  },
} as const;

export const honenSemanticTokens = {
  color: {
    brand: {
      primary: "var(--color-brand-primary)",
      primaryHover: "var(--color-brand-primary-hover)",
      primaryActive: "var(--color-brand-primary-active)",
      primaryForeground: "var(--color-brand-primary-foreground)",
      primaryMuted: "var(--color-brand-primary-muted)",
      primaryMutedHover: "var(--color-brand-primary-muted-hover)",
    },
    text: {
      body: "var(--color-text-body)",
      heading: "var(--color-text-heading)",
      muted: "var(--color-text-muted)",
      inverse: "var(--color-text-inverse)",
      danger: "var(--color-text-danger)",
    },
    surface: {
      page: "var(--color-surface-page)",
      card: "var(--color-surface-card)",
      control: "var(--color-surface-control)",
      editor: "var(--color-surface-editor)",
      inverse: "var(--color-surface-inverse)",
      muted: "var(--color-surface-muted)",
      danger: "var(--color-surface-danger)",
    },
    border: {
      default: "var(--color-border-default)",
      muted: "var(--color-border-muted)",
      strong: "var(--color-border-strong)",
      danger: "var(--color-border-danger)",
    },
    focus: {
      visible: "var(--color-focus-visible)",
    },
  },
  component: {
    button: {
      radius: "var(--radius-interactive)",
      height: "var(--size-control-md)",
    },
    card: {
      radius: "var(--radius-card)",
      shadow: "var(--shadow-card-default)",
    },
  },
} as const;
