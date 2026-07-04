// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

afterEach(() => {
  cleanup();
});

describe("Honen primitive components", () => {
  it("uses the screenshot-matched green token for primary button chrome", () => {
    const className = buttonVariants({ variant: "primary" });

    expect(className).toContain("bg-primary");
    expect(className).toContain("text-primary-foreground");
    expect(className).toContain("hover:bg-primary-hover");
    expect(className).not.toContain("bg-surface-inverse");
  });

  it("uses the warm editor surface for multiline editing", () => {
    render(<Textarea data-testid="honen-editor" />);

    expect(screen.getByTestId("honen-editor").className).toContain("bg-surface-editor");
  });

  it("keeps primary active chrome out of custom default buttons", () => {
    render(
      <Button data-testid="custom-default" className="bg-white text-ink hover:bg-slate-50">
        Custom
      </Button>,
    );

    expect(screen.getByTestId("custom-default").className).not.toContain("active:bg-primary-active");
  });

  it("uses neutral hover chrome for custom default buttons without an explicit hover", () => {
    render(
      <Button data-testid="custom-default" className="bg-white text-ink">
        Custom
      </Button>,
    );

    const className = screen.getByTestId("custom-default").className;
    expect(className).toContain("hover:bg-slate-200");
    expect(className).not.toContain("hover:bg-primary-hover");
  });

  it("keeps pressed feedback for explicit primary buttons", () => {
    render(
      <Button data-testid="explicit-primary" variant="primary">
        Primary
      </Button>,
    );

    expect(screen.getByTestId("explicit-primary").className).toContain("active:bg-primary-active");
  });
});
