/** @type {import('tailwindcss').Config} */
const tokenColor = (token) => `rgb(var(${token}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: tokenColor("--color-canvas"),
        surface: {
          paper: tokenColor("--color-surface-paper"),
          elevated: tokenColor("--color-surface-elevated"),
          muted: tokenColor("--color-surface-muted"),
          subtle: tokenColor("--color-surface-subtle"),
          "action-subtle": tokenColor("--color-surface-action-subtle"),
        },
        text: {
          primary: tokenColor("--color-text-primary"),
          muted: tokenColor("--color-text-muted"),
          "on-action": tokenColor("--color-text-on-action"),
        },
        action: {
          DEFAULT: tokenColor("--color-action-text"),
          fill: tokenColor("--color-action-primary"),
          hover: tokenColor("--color-action-hover"),
          subtle: tokenColor("--color-surface-action-subtle"),
        },
        line: tokenColor("--color-line"),
        "line-strong": tokenColor("--color-line-strong"),
        control: tokenColor("--color-control-border"),
        "surface-disabled": tokenColor("--color-surface-muted"),
        "state-success": tokenColor("--color-state-success"),
        "state-success-subtle": tokenColor("--color-surface-success"),
        "state-warning": tokenColor("--color-state-warning"),
        "state-warning-subtle": tokenColor("--color-surface-warning"),
        "state-error": tokenColor("--color-state-error"),
        "state-error-subtle": tokenColor("--color-surface-error"),
        white: tokenColor("--color-text-primary"),

        // Legacy utility aliases keep existing pages on the semantic palette during extraction.
        brand: {
          50: tokenColor("--color-surface-action-subtle"),
          100: tokenColor("--color-surface-muted"),
          300: tokenColor("--color-surface-muted"),
          400: tokenColor("--color-action-text"),
          500: tokenColor("--color-action-text"),
          600: tokenColor("--color-action-text"),
          700: tokenColor("--color-action-hover"),
        },
        slate: {
          50: tokenColor("--color-surface-subtle"),
          100: tokenColor("--color-surface-muted"),
          200: tokenColor("--color-line"),
          300: tokenColor("--color-line-strong"),
          400: tokenColor("--color-text-muted"),
          500: tokenColor("--color-text-muted"),
          600: tokenColor("--color-text-muted"),
          700: tokenColor("--color-text-primary"),
          800: tokenColor("--color-text-primary"),
          900: tokenColor("--color-text-primary"),
        },
        green: {
          100: tokenColor("--color-surface-success"),
          600: tokenColor("--color-state-success"),
          700: tokenColor("--color-state-success"),
        },
        amber: {
          100: tokenColor("--color-surface-warning"),
          600: tokenColor("--color-state-warning"),
          700: tokenColor("--color-state-warning"),
        },
        red: {
          100: tokenColor("--color-surface-error"),
          200: tokenColor("--color-surface-error"),
          300: tokenColor("--color-state-error"),
          600: tokenColor("--color-state-error"),
          700: tokenColor("--color-state-error"),
        },
      },
      fontFamily: {
        sans: ["var(--font-ui)"],
        display: ["var(--font-display)"],
        ui: ["var(--font-ui)"],
        reading: ["var(--font-reading)"],
      },
      fontSize: {
        body: ["var(--font-size-body)", { lineHeight: "var(--line-height-ui)" }],
        small: ["var(--font-size-small)", { lineHeight: "var(--line-height-ui)" }],
        caption: ["var(--font-size-caption)", { lineHeight: "var(--line-height-ui)" }],
      },
      lineHeight: {
        ui: "var(--line-height-ui)",
        reading: "var(--line-height-reading)",
      },
      maxWidth: {
        reading: "var(--measure-reading)",
      },
      spacing: {
        "study-1": "var(--space-study-1)",
        "study-2": "var(--space-study-2)",
        "study-3": "var(--space-study-3)",
        "study-4": "var(--space-study-4)",
        "study-5": "var(--space-study-5)",
        "study-6": "var(--space-study-6)",
      },
      borderRadius: {
        control: "var(--radius-control)",
        surface: "var(--radius-surface)",
      },
    },
  },
  plugins: [],
};
