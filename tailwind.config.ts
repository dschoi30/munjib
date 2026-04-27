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
        border: "hsl(214 18% 86%)",
        surface: "hsl(0 0% 100%)",
        muted: "hsl(210 20% 96%)",
        ink: "hsl(222 22% 12%)",
      },
    },
  },
  plugins: [],
};

export default config;
