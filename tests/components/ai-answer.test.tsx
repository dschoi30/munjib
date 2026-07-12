// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiAnswer, AiCitations } from "@/components/ai/answer";

afterEach(() => {
  cleanup();
});

describe("AiAnswer", () => {
  it("produces no external media element during SSR", () => {
    const html = renderToStaticMarkup(
      <AiAnswer
        content={[
          "![pixel](https://attacker.example/ssr.png)",
          '<img src="https://attacker.example/raw.png">',
        ].join("\n")}
      />,
    );
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/rel="(?:preload|prefetch|preconnect)"/);
    expect(html).not.toContain("attacker.example/ssr.png");
    expect(html).not.toMatch(/(?:href|src|action|formaction|data-[^=]+)="[^"]*attacker/i);
    expect(html).toContain("<button");
  });

  it("keeps model-authored external destinations out of DOM attributes until explicit confirmation", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { container } = render(
      <AiAnswer
        content={[
          "![external](https://attacker.example/pixel.png)",
          "![forged](/api/attachments/forged)",
          '<img src="https://attacker.example/raw.png">',
          '<link rel="preload" as="image" href="https://attacker.example/preload.png">',
        ].join("\n\n")}
      />,
    );

    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll('link[rel="preload"], link[rel="prefetch"], link[rel="preconnect"]')).toHaveLength(0);
    const destination = screen.getByRole("button", { name: /external.*https:\/\/attacker\.example/i });
    expect(destination.getAttribute("href")).toBeNull();
    expect([...destination.attributes].map(({ name, value }) => `${name}=${value}`).join(" "))
      .not.toContain("attacker.example/pixel.png");
    expect(container.innerHTML).not.toContain("attacker.example/pixel.png");
    expect(open).not.toHaveBeenCalled();

    fireEvent.click(destination);
    const confirm = await screen.findByRole("button", { name: "Open external destination" });
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(open).toHaveBeenCalledWith(
      "https://attacker.example/pixel.png",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("renders only an independently supplied attachment id", () => {
    render(
      <AiAnswer
        content="![approved](/api/attachments/att-1) ![forged](/api/attachments/att-2)"
        allowedAttachmentIds={["att-1"]}
      />,
    );
    expect(screen.getByRole("img", { name: "approved" }).getAttribute("src")).toBe(
      "/api/attachments/att-1",
    );
    expect(screen.queryByRole("img", { name: "forged" })).toBeNull();
  });

  it("uses the primary green theme for markdown answer links", () => {
    render(<AiAnswer content="[Runbook](https://example.com)" />);

    const destination = screen.getByRole("button", { name: /Runbook.*https:\/\/example\.com/ });
    expect(destination.className).toContain("text-primary");
    expect(destination.className).not.toContain("violet");
  });

  it("uses the primary green theme for citation links", () => {
    render(
      <AiCitations
        workspaceSlug="company-handbook"
        citations={[
          {
            index: 1,
            documentId: "doc-1",
            documentTitle: "Runbook",
          },
        ]}
      />,
    );

    const citationLink = screen.getByRole("link", { name: "[1] Runbook" });
    expect(citationLink.className).toContain("text-primary");
    expect(citationLink.className).not.toContain("violet");
  });
});
