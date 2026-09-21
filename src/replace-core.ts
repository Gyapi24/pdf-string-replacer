import { PdfDocument } from "ts-pdf-edit";
import {
  isTjOperator,
  rewriteWholeTjOperator,
  type MutableEditor,
} from "./tj-rewrite.js";

export interface ReplacementSkip {
  pageIndex: number;
  text: string;
  reason: string;
}

export interface ReplacementSuccess {
  pageIndex: number;
  original: string;
  replacement: string;
  strategy: string;
}

export interface ReplacePdfTextResult {
  matchCount: number;
  replaced: ReplacementSuccess[];
  skipped: ReplacementSkip[];
  bytes: Uint8Array;
}

export interface ReplacePdfBytesOptions {
  bytes: Uint8Array;
  find: string;
  replaceWith: string;
  caseSensitive?: boolean;
  maxReplacements?: number;
  substituteFont?: Uint8Array;
}

async function replaceInPlace(
  doc: PdfDocument,
  hit: Awaited<ReturnType<PdfDocument["searchText"]>>[number],
  replacement: string,
  substituteFont: Uint8Array | undefined
): Promise<ReplacementSuccess | ReplacementSkip> {
  const editor = doc.getPage(hit.pageIndex).editor() as unknown as MutableEditor;
  const located = await editor.locate(hit);

  if (!located.editable) {
    return {
      pageIndex: hit.pageIndex,
      text: hit.text,
      reason: located.reason ?? "not-editable",
    };
  }

  const opts = {
    ...(substituteFont ? { substituteFont } : {}),
  };

  // TJ operators often split one word across multiple strings. Replacing only one
  // string leaves the rest visible and looks like an overlay — replace the whole TJ.
  const report = isTjOperator(editor, located.located)
    ? await rewriteWholeTjOperator(editor, located.located, replacement, opts)
    : await editor.rewriteText(located.located, replacement, opts);

  return {
    pageIndex: hit.pageIndex,
    original: hit.text,
    replacement,
    strategy: report.fontStrategy,
  };
}

export async function replacePdfTextInBytes(
  options: ReplacePdfBytesOptions
): Promise<ReplacePdfTextResult> {
  const {
    bytes,
    find,
    replaceWith,
    caseSensitive = true,
    maxReplacements,
    substituteFont,
  } = options;

  if (!find) {
    throw new Error("Search text cannot be empty.");
  }

  const doc = await PdfDocument.open(bytes);

  try {
    const matches = await doc.searchText(find, { caseSensitive });
    const selected =
      typeof maxReplacements === "number"
        ? matches.slice(0, maxReplacements)
        : matches;

    const replaced: ReplacementSuccess[] = [];
    const skipped: ReplacementSkip[] = [];

    for (const hit of [...selected].reverse()) {
      try {
        const result = await replaceInPlace(doc, hit, replaceWith, substituteFont);
        if ("strategy" in result) {
          replaced.push(result);
        } else {
          skipped.push(result);
        }
      } catch (error) {
        skipped.push({
          pageIndex: hit.pageIndex,
          text: hit.text,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const saved = await doc.save();
    replaced.reverse();

    return {
      matchCount: matches.length,
      replaced,
      skipped,
      bytes: saved.bytes,
    };
  } finally {
    await doc.close();
  }
}
