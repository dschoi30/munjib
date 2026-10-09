// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { ModelConnectionStatus } from "@/components/ai/model-connection-status";

const view = (model = "model-a") => <I18nProvider><ModelConnectionStatus workspaceSlug="example" chatProvider="openai-compatible" chatModel={model} /></I18nProvider>;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); window.localStorage.clear(); });

describe("model connection status", () => {
  it("checks on mount and displays a green connected indicator", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ connected: true }));
    vi.stubGlobal("fetch", fetcher);
    render(view());
    expect(screen.getByText("Checking connection…")).toBeTruthy();
    expect(await screen.findByText("Connected")).toBeTruthy();
    expect(screen.getByRole("status").querySelector("span")?.className).toContain("bg-emerald-600");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ chatProvider: "openai-compatible", chatModel: "model-a" });
  });

  it("cancels the old probe and ignores its late success after model change", async () => {
    let resolveOld!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(Response.json({ connected: false }));
    vi.stubGlobal("fetch", fetcher);
    const { rerender } = render(view());
    const oldSignal = fetcher.mock.calls[0][1].signal;
    rerender(view("model-b"));
    expect(oldSignal.aborted).toBe(true);
    expect(await screen.findByText("Could not connect")).toBeTruthy();
    await act(async () => { resolveOld(Response.json({ connected: true })); });
    expect(screen.queryByText("Connected")).toBeNull();
    expect(JSON.parse(fetcher.mock.calls[1][1].body).chatModel).toBe("model-b");
  });

  it("checks again after leaving and reopening the tab", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ connected: true })));
    vi.stubGlobal("fetch", fetcher);
    const { unmount } = render(view());
    await screen.findByText("Connected");
    unmount();
    render(view());
    await screen.findByText("Connected");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(["rejected", "unauthenticated", "malformed"])("shows failure for %s responses", async (kind) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => kind === "rejected" ? Promise.reject(new Error("offline")) :
      Promise.resolve(kind === "unauthenticated" ? new Response("", { status: 401 }) : new Response("invalid JSON"))));
    render(view());
    expect(await screen.findByText("Could not connect")).toBeTruthy();
  });

  it("bounds the browser wait and ignores late results", async () => {
    vi.useFakeTimers();
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetcher);
    render(view());
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(screen.getByText("Could not connect")).toBeTruthy();
    await act(async () => { resolve(Response.json({ connected: true })); });
    expect(screen.queryByText("Connected")).toBeNull();
  });

  it("renders the Korean label", async () => {
    window.localStorage.setItem("munjib:language", "ko");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ connected: true })));
    render(view());
    expect(await screen.findByText("연결됨")).toBeTruthy();
  });
});
