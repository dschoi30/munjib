import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { getReadableAttachment } from "@/lib/attachments/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await requireCurrentUser();
  const { attachmentId } = await params;
  const { attachment, bytes } = await getReadableAttachment(attachmentId, user.id);

  return new NextResponse(bytes, {
    headers: {
      "content-type": attachment.mimeType,
      "content-length": String(attachment.size),
      "content-disposition": `inline; filename="${attachment.fileName.replace(/"/g, "")}"`,
    },
  });
}
