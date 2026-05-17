import { foldedRanges } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import {
  buildHeadingFoldTree,
  createHeadingFoldStorageValue,
  getValidFoldedHeadingKeys,
  parseHeadingFoldStorageValue,
  type HeadingFoldTree,
} from "@/lib/markdown/folding";

export function readStoredFoldedHeadingKeys(storageKey: string, validKeys: Set<string>) {
  try {
    return getValidFoldedHeadingKeys(
      parseHeadingFoldStorageValue(window.localStorage.getItem(storageKey)),
      validKeys,
    );
  } catch {
    return [];
  }
}

export function writeStoredFoldedHeadingKeys(storageKey: string, foldedKeys: Set<string>) {
  try {
    window.localStorage.setItem(storageKey, createHeadingFoldStorageValue(foldedKeys));
  } catch {
    // Folding remains usable in memory when browser storage is unavailable.
  }
}

export function persistEditorFoldState(view: EditorView, storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  const foldTree = buildHeadingFoldTree(view.state.doc.toString());
  const foldedKeys = getEditorFoldedHeadingKeys(view, foldTree);

  if (!foldedKeys) {
    return;
  }

  writeStoredFoldedHeadingKeys(storageKey, foldedKeys);
}

function getEditorFoldedHeadingKeys(view: EditorView, foldTree: HeadingFoldTree) {
  const sectionKeyByEditorRange = new Map<string, string>();

  for (const section of foldTree.sectionByKey.values()) {
    const editorRange = section.editorRange;

    if (editorRange && editorRange.fromLine <= editorRange.toLine) {
      const headingLine = editorRange.fromLine - 1;

      sectionKeyByEditorRange.set(
        createEditorRangeKey(editorRange.fromLine, editorRange.toLine),
        section.key,
      );

      if (headingLine >= 1 && headingLine <= editorRange.toLine) {
        sectionKeyByEditorRange.set(createEditorRangeKey(headingLine, editorRange.toLine), section.key);
      }
    }
  }

  try {
    const foldedKeys = new Set<string>();

    foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
      try {
        const fromLine = view.state.doc.lineAt(from).number;
        const toLine = view.state.doc.lineAt(to).number;
        const sectionKey = sectionKeyByEditorRange.get(createEditorRangeKey(fromLine, toLine));

        if (sectionKey) {
          foldedKeys.add(sectionKey);
        }
      } catch {
        // Ignore a range that cannot be mapped back to a document line.
      }
    });

    return new Set(getValidFoldedHeadingKeys(foldedKeys, foldTree.headingKeys));
  } catch {
    return null;
  }
}

function createEditorRangeKey(fromLine: number, toLine: number) {
  return `${fromLine}:${toLine}`;
}
