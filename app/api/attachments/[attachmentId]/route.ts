import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { getReadableAttachment } from "@/lib/attachments/service";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await requireCurrentUser();
  const { attachmentId } = await params;
  let readableAttachment: Awaited<ReturnType<typeof getReadableAttachment>>;
  try {
    readableAttachment = await getReadableAttachment(attachmentId, user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message === SERVICE_ERROR_CODES.ATTACHMENT_NOT_FOUND ||
      message === SERVICE_ERROR_CODES.ATTACHMENT_STORAGE_KEY_INVALID ||
      message === "WORKSPACE_READ_FORBIDDEN" ||
      message === "DOCUMENT_READ_FORBIDDEN"
    ) {
      return NextResponse.json(
        { error: SERVICE_ERROR_CODES.ATTACHMENT_NOT_FOUND },
        { status: 404 },
      );
    }

    return NextResponse.json({ error: "ATTACHMENT_REQUEST_FAILED" }, { status: 500 });
  }
  const { attachment, bytes } = readableAttachment;

  return new NextResponse(bytes, {
    headers: {
      "content-type": attachment.mimeType,
      "content-length": String(attachment.size),
      "content-disposition": `inline; filename="${attachment.fileName.replace(/"/g, "")}"`,
    },
  });
}
