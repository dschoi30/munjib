"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { uploadDocumentAttachment } from "@/lib/attachments/service";
import { requireCurrentUser } from "@/lib/auth/session";
import { createComment } from "@/lib/comments/service";
import { archiveFolder, createFolder, renameFolder } from "@/lib/folders/service";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import {
  archiveDocument,
  createDocument,
  createDocumentFromBrokenLink,
  restoreDocumentVersion,
  updateDocument,
} from "@/lib/documents/service";

export async function updateDocumentAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const documentId = String(formData.get("documentId"));
  await updateDocument({
    documentId,
    actorId: user.id,
    title: String(formData.get("title") ?? ""),
    contentMarkdown: String(formData.get("contentMarkdown") ?? ""),
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  redirect(`/workspaces/${workspaceSlug}?document=${documentId}`);
}

const documentTemplates: Record<string, { title: string; contentMarkdown: string }> = {
  blank: { title: "Untitled", contentMarkdown: "" },
  runbook: {
    title: "Untitled Runbook",
    contentMarkdown:
      "---\ntype: runbook\nstatus: draft\nreview_due_at: 2026-06-01\n---\n\n# Untitled Runbook\n\n## Context\n\n## Steps\n\n## Rollback\n",
  },
  policy: {
    title: "Untitled Policy",
    contentMarkdown:
      "---\ntype: policy\nstatus: draft\nowner: Team\nreview_due_at: 2026-06-01\n---\n\n# Untitled Policy\n\n## Scope\n\n## Policy\n\n## Review\n",
  },
};

export async function createDocumentAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const templateKey = String(formData.get("template") ?? "blank");
  const template = documentTemplates[templateKey] ?? documentTemplates.blank;
  const folderId = String(formData.get("folderId") || "") || null;
  const document = await createDocument({
    workspaceSlug,
    actorId: user.id,
    folderId,
    title: template.title,
    contentMarkdown: template.contentMarkdown,
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  redirect(`/workspaces/${workspaceSlug}?document=${document.id}`);
}

export async function createFolderAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const parentFolderId = String(formData.get("parentFolderId") || "") || null;
  const folder = await createFolder({
    workspaceSlug,
    actorId: user.id,
    parentFolderId,
    name: "Untitled folder",
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  redirect(`/workspaces/${workspaceSlug}?folder=${folder.id}`);
}

export async function renameFolderAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const folderId = String(formData.get("folderId"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { folderId, error: "FOLDER_NAME_REQUIRED" };
  }
  const folder = await renameFolder({
    folderId,
    actorId: user.id,
    name,
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  return { folderId: folder.id };
}

export async function archiveFolderAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const folderId = String(formData.get("folderId"));

  try {
    await archiveFolder({
      folderId,
      actorId: user.id,
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== SERVICE_ERROR_CODES.FOLDER_NOT_EMPTY) {
      throw error;
    }

    return { folderId, error: error.message };
  }

  revalidatePath(`/workspaces/${workspaceSlug}`);
  return { folderId };
}

export async function archiveDocumentAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const documentId = String(formData.get("documentId"));
  await archiveDocument({
    actorId: user.id,
    documentId,
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  return { documentId };
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

export async function restoreDocumentVersionAction(
  workspaceSlug: string,
  formData: FormData,
) {
  const user = await requireCurrentUser();
  const document = await restoreDocumentVersion({
    actorId: user.id,
    versionId: String(formData.get("versionId")),
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  redirect(`/workspaces/${workspaceSlug}?document=${document.id}`);
}

export async function uploadDocumentAttachmentAction(
  workspaceSlug: string,
  formData: FormData,
) {
  const user = await requireCurrentUser();
  const file = formData.get("attachment");
  const documentId = String(formData.get("documentId"));

  if (!(file instanceof File)) {
    throw new Error("ATTACHMENT_FILE_REQUIRED");
  }

  const attachment = await uploadDocumentAttachment({
    documentId,
    actorId: user.id,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes: new Uint8Array(await file.arrayBuffer()),
  });

  revalidatePath(`/workspaces/${workspaceSlug}`);
  redirect(`/workspaces/${workspaceSlug}?document=${attachment.documentId}`);
}

export async function createCommentAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const documentId = String(formData.get("documentId"));
  await createComment({
    documentId,
    actorId: user.id,
    body: String(formData.get("body") ?? ""),
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  redirect(`/workspaces/${workspaceSlug}?document=${documentId}`);
}
