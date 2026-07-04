// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { buttonVariants } from "@/components/ui/button";
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
});
