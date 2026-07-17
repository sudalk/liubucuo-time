import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {
      colors: {
        // DESIGN.md Soft Spectrum — oklch
        "mist-blue": "oklch(85% 0.085 235)",
        lilac: "oklch(84% 0.09 300)",
        mint: "oklch(87% 0.095 145)",
        apricot: "oklch(88% 0.105 72)",
        blush: "oklch(88% 0.09 12)",
        steel: "oklch(68% 0.055 270)",
        "steel-deep": "oklch(49% 0.055 270)",
        "warm-paper": "oklch(98.7% 0.006 255)",
        "quiet-surface": "oklch(99.6% 0.003 250)",
        ink: "oklch(25% 0.025 270)",
        "soft-line": "oklch(89.5% 0.022 260)"
      },
      fontFamily: {
        display: ["Inter", "SF Pro Rounded", "PingFang SC", "system-ui", "sans-serif"],
        sans: ["Inter", "PingFang SC", "system-ui", "sans-serif"]
      },
      fontSize: {
        display: ["32px", { lineHeight: "1.13", fontWeight: "850", letterSpacing: "-0.045em" }],
        headline: ["21px", { lineHeight: "1.25", fontWeight: "800" }],
        body: ["14px", { lineHeight: "1.55", fontWeight: "500" }],
        label: ["12px", { lineHeight: "1.3", fontWeight: "800" }]
      },
      borderRadius: {
        sm: "12px",
        md: "20px",
        lg: "30px",
        pill: "999px"
      },
      spacing: {
        xs: "6px",
        sm: "10px",
        md: "16px",
        lg: "24px",
        xl: "34px"
      },
      boxShadow: {
        "env-lift": "0 18px 50px color-mix(in oklch, var(--ink) 10%, transparent)",
        "touch-lift": "0 8px 24px color-mix(in oklch, var(--ink) 7%, transparent)"
      }
    }
  },
  plugins: []
};

export default config;
