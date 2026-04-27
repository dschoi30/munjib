"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  archiveDocument,
  createDocument,
  createDocumentFromBrokenLink,
  updateDocument,
} from "@/lib/documents/service";

export async function updateDocumentAction(formData: FormData) {
  const user = await requireCurrentUser();
  const documentId = String(formData.get("documentId"));
  await updateDocument({
    documentId,
    actorId: user.id,
    title: String(formData.get("title") ?? ""),
    contentMarkdown: String(formData.get("contentMarkdown") ?? ""),
  });
}

export async function createDocumentAction(workspaceSlug: string) {
  const user = await requireCurrentUser();
  const document = await createDocument({
    workspaceSlug,
    actorId: user.id,
    title: "Untitled",
    contentMarkdown: "",
  });
  redirect(`/workspaces/${workspaceSlug}?document=${document.id}`);
}

export async function archiveDocumentAction(formData: FormData) {
  const user = await requireCurrentUser();
  await archiveDocument({
    actorId: user.id,
    documentId: String(formData.get("documentId")),
  });
}

export async function createDocumentFromBrokenLinkAction(
  workspaceSlug: string,
  formData: FormData,
) {
  const user = await requireCurrentUser();
  const document = await createDocumentFromBrokenLink({
    actorId: user.id,
    linkId: String(formData.get("linkId")),
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  redirect(`/workspaces/${workspaceSlug}?document=${document.id}`);
}
