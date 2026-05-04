import type { Prisma } from "@prisma/client";
import {
  normalizeTag,
  parseDocumentMetadata,
} from "@/lib/document-metadata/parser";

export async function reconcileDocumentMetadata(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    documentId: string;
    contentMarkdown: string;
  },
) {
  const metadata = parseDocumentMetadata(input.contentMarkdown);

  await tx.documentTag.deleteMany({ where: { documentId: input.documentId } });
  await tx.documentProperty.deleteMany({ where: { documentId: input.documentId } });

  for (const tagName of metadata.tags) {
    const tag = await tx.tag.upsert({
      where: {
        workspaceId_normalizedName: {
          workspaceId: input.workspaceId,
          normalizedName: normalizeTag(tagName),
        },
      },
      update: { name: tagName },
      create: {
        workspaceId: input.workspaceId,
        name: tagName,
        normalizedName: normalizeTag(tagName),
      },
    });

    await tx.documentTag.create({
      data: {
        documentId: input.documentId,
        tagId: tag.id,
      },
    });
  }

  if (metadata.properties.length > 0) {
    await tx.documentProperty.createMany({
      data: metadata.properties.map((property, index) => ({
        documentId: input.documentId,
        key: property.key,
        valueJson: property.value,
        valueType: property.valueType,
        sortOrder: index,
      })),
    });
  }
}
