// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceModeProvider } from "@/components/workspace-mode";
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

  it("uses formatted external link text in the confirmation label", async () => {
    render(<AiAnswer content="[**Runbook**](https://example.com/runbook)" />);

    fireEvent.click(screen.getByRole("button", { name: /Runbook.*https:\/\/example\.com/ }));

    const dialog = await screen.findByRole("dialog", {
      name: "External destination confirmation",
    });
    expect(dialog.textContent).toContain("Runbook");
    expect(dialog.textContent).not.toContain("External destination\n");
  });

  it("does not nest an external image button inside an external link button", () => {
    render(
      <AiAnswer content="[![Preview](https://images.example/pixel.png)](https://docs.example/runbook)" />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain("https://docs.example");
    expect(buttons[0].querySelector("button")).toBeNull();
  });

  it("focuses Cancel and closes the confirmation on Escape", async () => {
    render(<AiAnswer content="[Runbook](https://example.com/runbook)" />);

    fireEvent.click(screen.getByRole("button", { name: /Runbook.*https:\/\/example\.com/ }));

    await screen.findByRole("dialog", { name: "External destination confirmation" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
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

  it("keeps anonymous Trial citation links inside the read-only Trial route", () => {
    render(
      <AiCitations
        mode="anonymous-trial-readonly"
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

    expect(screen.getByRole("link", { name: "[1] Runbook" }).getAttribute("href")).toBe(
      "/trial/workspaces/company-handbook?document=doc-1",
    );
  });
});


it("routes authorized Trial attachment media through the isolated read-only endpoint", () => {
  const html=renderToStaticMarkup(<WorkspaceModeProvider mode="anonymous-trial-readonly"><AiAnswer content="![demo](/api/attachments/file-1) [download](/api/attachments/file-1) [hidden](/api/attachments/private)" allowedAttachmentIds={["file-1"]}/></WorkspaceModeProvider>);
  expect(html).toContain('src="/api/trial/attachments/file-1"');
  expect(html).toContain('href="/api/trial/attachments/file-1"');
  expect(html).not.toContain('href="/api/attachments/private"');
});

it.each(["?download=1", "#page=2", "?download=1#page=2"])("scopes suffixed Trial attachment links %s", (suffix) => {
 const html=renderToStaticMarkup(<WorkspaceModeProvider mode="anonymous-trial-readonly"><AiAnswer content={`[allowed](/api/attachments/file-1${suffix}) [hidden](/api/attachments/private${suffix})`} allowedAttachmentIds={["file-1"]}/></WorkspaceModeProvider>);
 expect(html).toContain(`href="/api/trial/attachments/file-1${suffix}"`);
 expect(html).not.toContain('href="/api/attachments/');
 expect(html).not.toContain('href="/api/trial/attachments/private');
});

it("normalizes encoded Trial attachment paths before checking the allowed set", () => {
 const html=renderToStaticMarkup(<WorkspaceModeProvider mode="anonymous-trial-readonly"><AiAnswer content="[allowed](/api/%61ttachments/file-1?download=1) [hidden](/api/attachments/%70rivate) [case](/API/ATTACHMENTS/private)" allowedAttachmentIds={["file-1"]}/></WorkspaceModeProvider>);
 expect(html).toContain('href="/api/trial/attachments/file-1?download=1"');
 expect(html).not.toContain('href="/api/attachments/');
 expect(html).not.toContain('href="/API/ATTACHMENTS/');
});

it.each(["/workspaces/demo?document=doc-1#heading", "/%77orkspaces/demo?document=doc-1#heading", "/WORKSPACES/demo?document=doc-1#heading"])("keeps explicit workspace links inside Trial: %s", (href) => {
 const html=renderToStaticMarkup(<WorkspaceModeProvider mode="anonymous-trial-readonly"><AiAnswer content={`[document](${href}) [private API](/api/workspaces/private/assistant/thread)`}/></WorkspaceModeProvider>);
 expect(html).toContain('href="/trial/workspaces/demo?document=doc-1#heading"');
 expect(html).not.toContain('href="/api/workspaces/');
});
