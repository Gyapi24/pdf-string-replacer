import { readFile } from "node:fs/promises";
import { PdfDocument } from "ts-pdf-edit";
import {
  replacePdfTextInBytes,
  type ReplacePdfTextResult,
} from "./replace-core.js";

export type {
  ReplacePdfTextResult,
  ReplacementSkip,
  ReplacementSuccess,
} from "./replace-core.js";

export interface ReplacePdfTextOptions {
  inputPath: string;
  find: string;
  replaceWith: string;
  caseSensitive?: boolean;
  maxReplacements?: number;
  substituteFontPath?: string;
}

export async function replacePdfText(
  options: ReplacePdfTextOptions
): Promise<ReplacePdfTextResult> {
  const bytes = new Uint8Array(await readFile(options.inputPath));
  const substituteFont = options.substituteFontPath
    ? new Uint8Array(await readFile(options.substituteFontPath))
    : undefined;

  return replacePdfTextInBytes({
    bytes,
    find: options.find,
    replaceWith: options.replaceWith,
    caseSensitive: options.caseSensitive,
    maxReplacements: options.maxReplacements,
    substituteFont,
  });
}

export async function extractPdfText(inputPath: string): Promise<string> {
  const doc = await PdfDocument.open(inputPath);

  try {
    const pages = [];
    for (let i = 0; i < doc.pageCount; i += 1) {
      const { plainText } = await doc.getPage(i).text();
      pages.push(`--- page ${i + 1} ---\n${plainText}`);
    }
    return pages.join("\n\n");
  } finally {
    await doc.close();
  }
}
