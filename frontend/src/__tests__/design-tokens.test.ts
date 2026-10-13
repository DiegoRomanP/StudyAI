import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tokenSource = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");
const tailwindSource = readFileSync(resolve(process.cwd(), "tailwind.config.js"), "utf8");
const globalStyles = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const documentSource = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

function readRgbToken(name: string): [number, number, number] {
  const match = tokenSource.match(
    new RegExp(`--${name}:\\s*(\\d{1,3})\\s+(\\d{1,3})\\s+(\\d{1,3})\\s*;`),
  );
  if (!match) throw new Error(`Missing RGB color token: ${name}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function readConfigBlock(name: string): string {
  const property = new RegExp(`\\b${name}\\s*:\\s*\\{`).exec(tailwindSource);
  if (!property) return "";

  const openingBrace = tailwindSource.indexOf("{", property.index);
  let depth = 0;
  for (let index = openingBrace; index < tailwindSource.length; index += 1) {
    if (tailwindSource[index] === "{") depth += 1;
    if (tailwindSource[index] === "}") {
      depth -= 1;
      if (depth === 0) return tailwindSource.slice(openingBrace, index + 1);
    }
  }
  return "";
}

function linearize(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: [number, number, number]): number {
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

function contrastRatio(
  foreground: [number, number, number],
  background: [number, number, number],
): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("StudyAI dark design tokens", () => {
  it("uses the specified flow palette and accessible text, action, and focus pairs", () => {
    expect(tokenSource).toContain("color-scheme: dark");
    expect(tokenSource).toMatch(/--font-display:\s*"Manrope"/);
    expect(tokenSource).toMatch(/--font-ui:\s*"Inter"/);
    expect(readRgbToken("color-canvas")).toEqual([8, 13, 28]);
    expect(readRgbToken("color-surface-paper")).toEqual([16, 26, 48]);
    expect(readRgbToken("color-surface-elevated")).toEqual([23, 36, 64]);
    expect(readRgbToken("color-action-primary")).toEqual([81, 120, 255]);
    expect(readRgbToken("color-action-hover")).toEqual([97, 217, 242]);
    expect(readRgbToken("color-action-text")).toEqual([169, 145, 255]);

    const surfaces = [
      readRgbToken("color-canvas"),
      readRgbToken("color-surface-paper"),
      readRgbToken("color-surface-elevated"),
      readRgbToken("color-surface-muted"),
      readRgbToken("color-surface-subtle"),
      readRgbToken("color-surface-action-subtle"),
      readRgbToken("color-surface-success"),
      readRgbToken("color-surface-warning"),
      readRgbToken("color-surface-error"),
    ];
    const primaryText = readRgbToken("color-text-primary");
    const mutedText = readRgbToken("color-text-muted");
    const actionText = readRgbToken("color-action-text");
    const focus = readRgbToken("color-focus");

    for (const surface of surfaces) {
      expect(contrastRatio(primaryText, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(mutedText, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(actionText, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(focus, surface)).toBeGreaterThanOrEqual(3);
    }

    const textOnAction = readRgbToken("color-text-on-action");
    for (const actionFill of [
      readRgbToken("color-action-primary"),
      readRgbToken("color-action-hover"),
      readRgbToken("color-action-text"),
    ]) {
      expect(contrastRatio(textOnAction, actionFill)).toBeGreaterThanOrEqual(4.5);
    }

    expect(
      contrastRatio(readRgbToken("color-state-success"), readRgbToken("color-surface-success")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(readRgbToken("color-state-warning"), readRgbToken("color-surface-warning")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(readRgbToken("color-state-error"), readRgbToken("color-surface-error")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("connects loaded font families, accessible action aliases, and visible focus tokens", () => {
    expect(documentSource).toMatch(/family=Inter:[^&]*&family=Manrope:/);
    expect(tailwindSource).toContain('DEFAULT: tokenColor("--color-action-text")');
    expect(tailwindSource).toContain('fill: tokenColor("--color-action-primary")');
    expect(tailwindSource).toContain('white: tokenColor("--color-text-primary")');
    expect(globalStyles).toContain("outline: 3px solid rgb(var(--color-focus));");
    expect(globalStyles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("reserves mobile root scroll space for the fixed navigation and device safe area", () => {
    expect(globalStyles).toContain("scroll-padding-bottom: 0;");
    expect(globalStyles).toContain("@media (max-width: 767px)");
    expect(globalStyles).toContain(
      "scroll-padding-bottom: calc(6rem + env(safe-area-inset-bottom));",
    );
  });

  it("locks font fallback stacks and legacy Tailwind aliases", () => {
    expect(tokenSource).toContain('--font-display: "Manrope", "Segoe UI", sans-serif;');
    expect(tokenSource).toContain('--font-ui: "Inter", "Segoe UI", sans-serif;');
    expect(tokenSource).toContain('--font-reading: "Inter", "Segoe UI", sans-serif;');
    expect(tailwindSource).toContain('sans: ["var(--font-ui)"]');
    expect(tailwindSource).toContain('display: ["var(--font-display)"]');
    expect(tailwindSource).toContain('ui: ["var(--font-ui)"]');
    expect(tailwindSource).toContain('reading: ["var(--font-reading)"]');

    const brandAliases = readConfigBlock("brand");
    const slateAliases = readConfigBlock("slate");
    expect(brandAliases).not.toBe("");
    expect(slateAliases).not.toBe("");

    for (const alias of [
      '50: tokenColor("--color-surface-action-subtle")',
      '100: tokenColor("--color-surface-muted")',
      '300: tokenColor("--color-surface-muted")',
      '400: tokenColor("--color-action-text")',
      '500: tokenColor("--color-action-text")',
      '600: tokenColor("--color-action-text")',
      '700: tokenColor("--color-action-hover")',
    ]) {
      expect(brandAliases).toContain(alias);
    }

    for (const alias of [
      '50: tokenColor("--color-surface-subtle")',
      '100: tokenColor("--color-surface-muted")',
      '200: tokenColor("--color-line")',
      '300: tokenColor("--color-line-strong")',
      '400: tokenColor("--color-text-muted")',
      '500: tokenColor("--color-text-muted")',
      '600: tokenColor("--color-text-muted")',
      '700: tokenColor("--color-text-primary")',
      '800: tokenColor("--color-text-primary")',
      '900: tokenColor("--color-text-primary")',
    ]) {
      expect(slateAliases).toContain(alias);
    }
  });

  it("publishes the flowing SVG source mark as the brand favicon", () => {
    const faviconPath = resolve(process.cwd(), "public/favicon.svg");
    expect(existsSync(faviconPath)).toBe(true);

    const faviconSource = readFileSync(faviconPath, "utf8");
    expect(faviconSource).toContain('d="M12 39 C21 16 31 15 37 28 S48 48 54 22"');
    expect(faviconSource).toContain('stop-color="#61D9F2"');
    expect(faviconSource).toContain('stop-color="#A991FF"');
    expect(documentSource).toContain('rel="icon" type="image/svg+xml" href="/favicon.svg"');
  });
});
