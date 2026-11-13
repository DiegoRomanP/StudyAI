import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeMarkdown } from "./SafeMarkdown";

describe("SafeMarkdown", () => {
  it("renders formulas with KaTeX and tables, but never images or links", () => {
    const { container } = render(
      <SafeMarkdown>
        {"Área: $A = \\pi r^2$\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n![x](https://evil.test/x.png) [web](https://evil.test)"}
      </SafeMarkdown>,
    );

    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });
});
