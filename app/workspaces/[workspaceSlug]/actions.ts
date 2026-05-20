"use server";

import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  uploadDocumentAttachment,
  uploadPastedDocumentImageAttachment,
} from "@/lib/attachments/service";
import { requireCurrentUser } from "@/lib/auth/session";
import { createComment } from "@/lib/comments/service";
import { archiveFolder, createFolder, renameFolder } from "@/lib/folders/service";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import {
  deriveMarkdownImportTitle,
  isSupportedMarkdownImportFile,
} from "@/lib/documents/import-markdown";
import {
  archiveDocument,
  createDocument,
  createDocumentFromBrokenLink,
  restoreDocumentVersion,
  updateDocument,
} from "@/lib/documents/service";

const maxPastedImageBytes = 5 * 1024 * 1024;
const pastedImageMimeTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

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
}

export async function createDocumentAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const folderId = String(formData.get("folderId") || "") || null;
  const document = await createDocument({
    workspaceSlug,
    actorId: user.id,
    folderId,
    title: "Untitled",
    contentMarkdown: "",
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  redirect(`/workspaces/${workspaceSlug}?document=${document.id}`);
}

export async function importMarkdownDocumentAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const file = formData.get("markdownFile");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error(SERVICE_ERROR_CODES.MARKDOWN_IMPORT_FILE_REQUIRED);
  }

  if (!isSupportedMarkdownImportFile(file)) {
    throw new Error(SERVICE_ERROR_CODES.MARKDOWN_IMPORT_UNSUPPORTED_FILE);
  }

  const contentMarkdown = await file.text();
  const document = await createDocument({
    workspaceSlug,
    actorId: user.id,
    title: deriveMarkdownImportTitle({ fileName: file.name, contentMarkdown }),
    contentMarkdown,
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
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_FILE_REQUIRED);
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

export async function pasteDocumentImageAttachmentAction(
  workspaceSlug: string,
  formData: FormData,
) {
  const user = await requireCurrentUser();
  const file = formData.get("attachment");
  const documentId = String(formData.get("documentId"));
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const requestedFileName = String(formData.get("fileName") ?? "").trim();

  if (!(file instanceof File) && !imageUrl) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_FILE_REQUIRED);
  }

  const attachmentInput = file instanceof File
    ? {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes: new Uint8Array(await file.arrayBuffer()),
      }
    : await fetchPastedImageUrl(imageUrl, requestedFileName);

  const attachment = await uploadPastedDocumentImageAttachment({
    documentId,
    actorId: user.id,
    ...attachmentInput,
  });

  revalidatePath(`/workspaces/${workspaceSlug}`);
  return { markdown: attachment.markdown };
}

async function fetchPastedImageUrl(imageUrl: string, requestedFileName: string) {
  const url = new URL(imageUrl);
  const validatedAddress = await resolvePublicHttpUrl(url);
  const response = await requestPinnedImageUrl(url, validatedAddress);
  const statusCode = response.statusCode ?? 0;
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_FILE_REQUIRED);
  }

  const mimeType = headerValue(response.headers["content-type"])
    ?.split(";")[0]
    ?.trim() || "application/octet-stream";
  if (!pastedImageMimeTypes.has(mimeType)) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_MIME_TYPE_FORBIDDEN);
  }

  const contentLength = Number(headerValue(response.headers["content-length"]) ?? "0");
  if (contentLength > maxPastedImageBytes) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_TOO_LARGE);
  }

  return {
    fileName: requestedFileName || url.pathname.split("/").pop() || "pasted-image",
    mimeType,
    bytes: await readNodeResponseBytesWithLimit(response, maxPastedImageBytes),
  };
}

async function resolvePublicHttpUrl(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_MIME_TYPE_FORBIDDEN);
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_MIME_TYPE_FORBIDDEN);
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_MIME_TYPE_FORBIDDEN);
  }

  return addresses[0].address;
}

function requestPinnedImageUrl(url: URL, address: string) {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  const hostHeader = url.port ? `${url.hostname}:${url.port}` : url.hostname;

  return new Promise<IncomingMessage>((resolve, reject) => {
    const clientRequest = request(
      {
        hostname: address,
        port: url.port || undefined,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        headers: {
          Host: hostHeader,
        },
      },
      (response) => {
        if ((response.statusCode ?? 0) >= 300 && (response.statusCode ?? 0) < 400) {
          response.resume();
          reject(new Error(SERVICE_ERROR_CODES.ATTACHMENT_FILE_REQUIRED));
          return;
        }

        resolve(response);
      },
    );

    clientRequest.setTimeout(5_000, () => {
      clientRequest.destroy(new Error(SERVICE_ERROR_CODES.ATTACHMENT_FILE_REQUIRED));
    });
    clientRequest.on("error", reject);
    clientRequest.end();
  });
}

function isPublicAddress(address: string) {
  if (isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;

    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mappedIpv4) {
      return isPublicAddress(mappedIpv4);
    }

    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return false;
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function readNodeResponseBytesWithLimit(response: IncomingMessage, limit: number) {
  const chunks: Uint8Array[] = [];
  let total = 0;

  for await (const value of response) {
    const chunk = value instanceof Uint8Array ? value : Buffer.from(value);
    total += chunk.byteLength;
    if (total > limit) {
      response.destroy();
      throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_TOO_LARGE);
    }
    chunks.push(chunk);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
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
}
