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
import {
  defaultWorkspaceNameForLanguage,
} from "@/lib/auth/provisioning";
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
import { updateWorkspaceArchivedDocumentRetentionPolicy } from "@/lib/workspaces/retention-service";
import { parseArchivedDocumentRetentionPolicy } from "@/lib/workspaces/retention-policy";
import { parseLanguage } from "@/lib/i18n/language";
import {
  archiveWorkspace,
  createWorkspace,
  renameWorkspace,
} from "@/lib/workspaces/management-service";

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
  if (formData.get("redirect") === "false") {
    return { documentId: document.id };
  }
  redirect(`/workspaces/${workspaceSlug}?document=${document.id}`);
}

export async function importMarkdownDocumentAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const files = markdownImportFilesFromFormData(formData);
  const folderId = String(formData.get("folderId") || "") || null;

  if (files.length === 0) {
    throw new Error(SERVICE_ERROR_CODES.MARKDOWN_IMPORT_FILE_REQUIRED);
  }

  const imported: Array<{ fileName: string; documentId: string }> = [];
  const failed: Array<{ fileName: string; error: string }> = [];

  for (const file of files) {
    if (file.size === 0) {
      failed.push({
        fileName: file.name,
        error: SERVICE_ERROR_CODES.MARKDOWN_IMPORT_FILE_REQUIRED,
      });
      continue;
    }

    if (!isSupportedMarkdownImportFile(file)) {
      failed.push({
        fileName: file.name,
        error: SERVICE_ERROR_CODES.MARKDOWN_IMPORT_UNSUPPORTED_FILE,
      });
      continue;
    }

    try {
      const contentMarkdown = await file.text();
      const document = await createDocument({
        workspaceSlug,
        actorId: user.id,
        folderId,
        title: deriveMarkdownImportTitle({ fileName: file.name, contentMarkdown }),
        contentMarkdown,
      });
      imported.push({ fileName: file.name, documentId: document.id });
    } catch (error) {
      failed.push({
        fileName: file.name,
        error: error instanceof Error
          ? error.message
          : SERVICE_ERROR_CODES.MARKDOWN_IMPORT_UNSUPPORTED_FILE,
      });
    }
  }

  revalidatePath(`/workspaces/${workspaceSlug}`);
  return {
    documentIds: imported.map((item) => item.documentId),
    imported,
    failed,
  };
}

export async function updateWorkspaceRetentionPolicyAction(
  workspaceSlug: string,
  formData: FormData,
) {
  const user = await requireCurrentUser();
  const policy = parseArchivedDocumentRetentionPolicy(
    formData.get("archivedDocumentRetentionPolicy"),
  );

  if (!policy) {
    return { error: SERVICE_ERROR_CODES.ARCHIVED_DOCUMENT_RETENTION_POLICY_INVALID };
  }

  try {
    const updated = await updateWorkspaceArchivedDocumentRetentionPolicy({
      workspaceSlug,
      actorId: user.id,
      policy,
    });
    revalidatePath(`/workspaces/${workspaceSlug}`);
    return { archivedDocumentRetentionPolicy: updated.archivedDocumentRetentionPolicy };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

export async function createWorkspaceAction(currentWorkspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const language = parseLanguage(formData.get("language")) ?? "en";
  const name =
    String(formData.get("name") ?? "").trim() || defaultWorkspaceNameForLanguage(language);

  try {
    const workspace = await createWorkspace({
      actorId: user.id,
      currentWorkspaceSlug,
      name,
      language,
    });
    revalidatePath(`/workspaces/${currentWorkspaceSlug}`);
    redirect(`/workspaces/${workspace.slug}`);
  } catch (error) {
    if (isWorkspaceManagementActionError(error)) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function renameWorkspaceAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: SERVICE_ERROR_CODES.WORKSPACE_NAME_REQUIRED };
  }

  try {
    const workspace = await renameWorkspace({
      actorId: user.id,
      workspaceSlug,
      name,
    });
    revalidatePath(`/workspaces/${workspaceSlug}`);
    return { workspaceName: workspace.name };
  } catch (error) {
    if (isWorkspaceManagementActionError(error)) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function archiveWorkspaceAction(workspaceSlug: string, _formData: FormData) {
  const user = await requireCurrentUser();

  try {
    const result = await archiveWorkspace({
      actorId: user.id,
      workspaceSlug,
    });
    revalidatePath(`/workspaces/${workspaceSlug}`);
    redirect(`/workspaces/${result.fallbackWorkspaceSlug}`);
  } catch (error) {
    if (isWorkspaceManagementActionError(error)) {
      return { error: error.message };
    }
    throw error;
  }
}

function isWorkspaceManagementActionError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  return workspaceManagementActionErrorCodes.has(error.message);
}

const workspaceManagementActionErrorCodes = new Set<string>([
  SERVICE_ERROR_CODES.WORKSPACE_ARCHIVE_LAST_ACTIVE,
  SERVICE_ERROR_CODES.WORKSPACE_CREATE_FORBIDDEN,
  SERVICE_ERROR_CODES.WORKSPACE_MANAGE_FORBIDDEN,
  SERVICE_ERROR_CODES.WORKSPACE_NAME_REQUIRED,
  SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND,
  SERVICE_ERROR_CODES.WORKSPACE_SLUG_AMBIGUOUS,
]);

function markdownImportFilesFromFormData(formData: FormData) {
  const batchFiles = formData
    .getAll("markdownFiles")
    .filter((value): value is File => value instanceof File);
  if (batchFiles.length > 0) return batchFiles;

  const singleFile = formData.get("markdownFile");
  return singleFile instanceof File ? [singleFile] : [];
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
  if (formData.get("redirect") === "false") {
    return { folderId: folder.id };
  }
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
  const cascade = formData.get("cascade") === "true";

  try {
    await archiveFolder({
      folderId,
      actorId: user.id,
      cascade,
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

  if (!(file instanceof File) || !file.name || file.size === 0) {
    return { error: SERVICE_ERROR_CODES.ATTACHMENT_FILE_REQUIRED };
  }

  const attachment = await uploadDocumentAttachment({
    documentId,
    actorId: user.id,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes: new Uint8Array(await file.arrayBuffer()),
  });

  revalidatePath(`/workspaces/${workspaceSlug}`);
  return { attachmentId: attachment.id };
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
  const validatedAddresses = await resolvePublicHttpUrl(url);
  let lastError: unknown;

  for (const address of validatedAddresses) {
    try {
      return await fetchPastedImageUrlAtAddress(url, requestedFileName, address);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(SERVICE_ERROR_CODES.ATTACHMENT_FILE_REQUIRED);
}

async function fetchPastedImageUrlAtAddress(
  url: URL,
  requestedFileName: string,
  address: string,
) {
  const response = await requestPinnedImageUrl(url, address);
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

  return addresses.map(({ address }) => address);
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
    const mappedIpv4 = ipv4MappedAddress(normalized);
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

function ipv4MappedAddress(address: string) {
  const dotted = address.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) {
    return dotted;
  }

  const hex = address.match(/^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) {
    return null;
  }

  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  if (!Number.isFinite(high) || !Number.isFinite(low) || high > 0xffff || low > 0xffff) {
    return null;
  }

  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join(".");
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
