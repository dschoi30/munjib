// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AttachmentUpload } from "@/components/attachment-upload";
import { AppShell } from "@/components/app-shell";
import { MetadataPanel } from "@/components/metadata-panel";
import { I18nProvider } from "@/components/i18n-provider";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(action: Parameters<typeof AttachmentUpload>[0]["action"]) {
  return render(<I18nProvider><AppShell left={<button>Elsewhere</button>}
    center={<AttachmentUpload documentId="doc" canWrite action={action} />}
    right={<MetadataPanel document={{ id: "doc", contentMarkdown: "" }} versions={[]} auditLogs={[]}
      attachments={[{id:"new-file", fileName:"한글.txt", mimeType:"text/plain", size:6}]}
      canWrite restoreVersionAction={async () => {}} />} /></I18nProvider>);
}
function selectFile() {
  const file = new File(["본문"], "한글.txt", {type:"text/plain"});
  fireEvent.change(screen.getByLabelText("Upload attachment"), {target:{files:[file]}});
  // jsdom's synthetic FileList is not used by its native FormData constructor.
  const data = new FormData(); data.set("attachment", file); data.set("documentId", "doc");
  vi.stubGlobal("FormData", class { constructor() { return data; } });
}
it("blocks empty upload, opens collapsed attachments, highlights new card and clears outside", async () => {
  let finish!: (value: {attachmentId:string}) => void;
  const action = vi.fn(() => new Promise<{attachmentId:string}>(resolve => { finish=resolve; }));
  setup(action);
  const button = screen.getByRole("button", {name:"Upload"}) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.submit(button.closest("form")!);
  expect(action).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name:"Close metadata panel"}));
  selectFile();
  expect(button.disabled).toBe(false);
  fireEvent.submit(button.closest("form")!);
  expect(screen.getByRole("button", {name:"Attachments"}).getAttribute("aria-pressed")).toBe("true");
  expect(button.disabled).toBe(true);
  fireEvent.submit(button.closest("form")!);
  expect(action).toHaveBeenCalledTimes(1);
  finish({attachmentId:"new-file"});
  await waitFor(() => expect(screen.getByText("한글.txt").closest("li")?.className).toContain("border-green-600"));
  expect(screen.getByText("한글.txt").getAttribute("download")).toBe("한글.txt");
  expect(screen.getByText("한글.txt").getAttribute("href")).toContain("?download=1");
  fireEvent.pointerDown(screen.getByText("한글.txt"));
  expect(screen.getByText("한글.txt").closest("li")?.className).toContain("border-green-600");
  fireEvent.pointerDown(screen.getByText("Elsewhere"));
  expect(screen.getByText("한글.txt").closest("li")?.className).not.toContain("border-green-600");
  expect(button.disabled).toBe(true);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("shows failure and allows retry without resetting the chosen file", async () => {
  setup(vi.fn().mockRejectedValue(new Error("upload failed")));
  selectFile();
  const button = screen.getByRole("button", {name:"Upload"}) as HTMLButtonElement;
  fireEvent.submit(button.closest("form")!);
  await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
  expect(button.disabled).toBe(false);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
