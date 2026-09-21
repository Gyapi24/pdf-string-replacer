/**
 * In-place rewrite helpers for TJ operators (not supported by ts-pdf-edit v0.1.1).
 * Replaces the entire TJ operator so no old string fragments remain underneath.
 */
import { scan } from "#tspdf/scanner.js";
import { spliceLogical, hexString } from "#tspdf/splicer.js";
import { NotEditableError } from "ts-pdf-edit";
import { StandardFonts } from "pdf-lib";

type RewriteOpts = {
  allowInvisibleText?: boolean;
  sameFontOnly?: boolean;
  substituteFont?: Uint8Array;
};

type EditReport = {
  fontStrategy: "same-font" | "substituted-font";
  touchedRefs: string[];
  overflowRatio: number;
  compensated: "kern" | "none";
  warnings: string[];
  substitutedFontName?: string;
};

type Piece = {
  opIndex: number;
  stringStart: number;
  stringEnd: number;
  glyphStart: number;
  glyphEnd: number;
  bytesPerGlyph: number;
  fontName: string;
  fontSize: number;
  runText: string;
};

type Op = {
  op: string;
  operands: Array<{ t: string; [key: string]: unknown }>;
  start: number;
  end: number;
  index: number;
};

type PdfFont = {
  encode: (text: string) => { bytes: Uint8Array; missing: unknown[] } | null;
  decode: (bytes: Uint8Array) => Array<{ width1000: number }>;
};

type EmbeddedFont = {
  ref: unknown;
  encodeText: (text: string) => { toString: () => string };
  widthOfTextAtSize: (text: string, size: number) => number;
};

export type MutableEditor = {
  locate: (span: unknown) => Promise<
    | { editable: true; located: { span: unknown; pieces: Piece[]; warnings: string[] } }
    | { editable: false; reason: string; detail?: string }
  >;
  rewriteText: (
    located: { span: unknown; pieces: Piece[]; warnings: string[] },
    newText: string,
    opts?: RewriteOpts
  ) => Promise<EditReport>;
  interpret: () => { logical: { bytes: Uint8Array } };
  resolver: { font: (name: string) => PdfFont | null };
  innerDoc?: {
    registerFontkit: (fk: unknown) => void;
    embedFont: (
      font: string | Uint8Array,
      opts?: { subset?: boolean }
    ) => Promise<EmbeddedFont>;
  };
  node: {
    newFontDictionaryKey: (prefix: string) => { toString: () => string };
    setFontDictionary: (key: { toString: () => string }, ref: unknown) => void;
  };
  runs: unknown;
  logical: unknown;
  notifyChanged: () => void;
};

function advance1000(font: PdfFont, bytes: Uint8Array): number {
  let sum = 0;
  for (const glyph of font.decode(bytes)) {
    sum += glyph.width1000;
  }
  return sum;
}

function winAnsiCovers(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      continue;
    }
    if (code < 0x20 || code > 0xff) {
      return false;
    }
  }
  return true;
}

async function embedSubstituteFont(
  editor: MutableEditor,
  opts: RewriteOpts,
  newText: string
): Promise<{ embedded: EmbeddedFont; label: string }> {
  const inner = editor.innerDoc;
  if (!inner) {
    throw new NotEditableError("no-embedder", "substitution needs the document embedder");
  }

  if (opts.substituteFont) {
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    inner.registerFontkit(fontkit);
    return {
      embedded: await inner.embedFont(opts.substituteFont, { subset: true }),
      label: "caller-font",
    };
  }

  if (winAnsiCovers(newText)) {
    return {
      embedded: await inner.embedFont(StandardFonts.Helvetica),
      label: "Helvetica",
    };
  }

  throw new NotEditableError(
    "needs-font-buffer",
    "replacement text is not coverable by Helvetica; supply a substitute TTF/OTF"
  );
}

function selectedBytesAcrossPieces(editor: MutableEditor, pieces: Piece[], op: Op): Uint8Array {
  const arr = op.operands.find((operand) => operand.t === "arr") as
    | { t: "arr"; items: Array<{ t: string; bytes?: Uint8Array; start?: number; end?: number }> }
    | undefined;
  if (!arr) {
    return new Uint8Array(0);
  }

  const chunks: Uint8Array[] = [];
  for (const piece of pieces) {
    const item = arr.items.find(
      (candidate) =>
        candidate.t === "str" &&
        candidate.start === piece.stringStart
    ) ?? arr.items.find(
      (candidate) =>
        candidate.t === "str" &&
        (candidate.start ?? 0) <= piece.stringStart &&
        (candidate.end ?? 0) >= piece.stringEnd
    );
    if (!item?.bytes) {
      continue;
    }
    const bpg = piece.bytesPerGlyph;
    chunks.push(item.bytes.subarray(piece.glyphStart * bpg, piece.glyphEnd * bpg));
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Replace a whole TJ operator with a single Tj of `newText`.
 * This removes every old string in that operator — no leftover glyphs underneath.
 */
export async function rewriteWholeTjOperator(
  editor: MutableEditor,
  located: { pieces: Piece[]; warnings: string[] },
  newText: string,
  opts: RewriteOpts = {}
): Promise<EditReport> {
  if (located.pieces.length === 0) {
    throw new NotEditableError("no-match", "no pieces to rewrite");
  }

  if (located.warnings.includes("invisible-text") && !opts.allowInvisibleText) {
    throw new NotEditableError(
      "invisible-ocr-text",
      "selection is invisible OCR text; pass allowInvisibleText to edit it"
    );
  }

  const primary = located.pieces[0]!;
  const { logical } = editor.interpret();
  const ops = scan(logical.bytes) as Op[];
  const op = ops.find((candidate) => candidate.index === primary.opIndex);
  if (!op || op.op !== "TJ") {
    throw new NotEditableError("complex-operator", "expected a TJ operator");
  }

  // Only rewrite pieces that belong to this same TJ.
  const pieces = located.pieces.filter((piece) => piece.opIndex === primary.opIndex);
  const font = editor.resolver.font(primary.fontName);
  if (!font) {
    throw new NotEditableError("unknown-font", `font ${primary.fontName} not found`);
  }

  const selected = selectedBytesAcrossPieces(editor, pieces, op);
  const a0 = selected.length > 0 ? advance1000(font, selected) : 0;
  const encoded = font.encode(newText);

  let replacementText: string;
  let fontStrategy: EditReport["fontStrategy"] = "same-font";
  let substitutedFontName: string | undefined;
  let a1 = a0;

  if (encoded && encoded.missing.length === 0) {
    a1 = advance1000(font, encoded.bytes);
    replacementText = `${hexString(encoded.bytes)} Tj`;
  } else {
    if (opts.sameFontOnly) {
      throw new NotEditableError(
        "font-not-reusable",
        `font ${primary.fontName} cannot cover the replacement and substitution is disallowed`
      );
    }

    const { embedded, label } = await embedSubstituteFont(editor, opts, newText);
    const fontKey = editor.node.newFontDictionaryKey("TsF");
    editor.node.setFontDictionary(fontKey, embedded.ref);
    const subName = fontKey.toString();
    const encStr = embedded.encodeText(newText).toString();
    a1 = embedded.widthOfTextAtSize(newText, 1000);
    // Restore the original font afterward so later page operators keep working.
    replacementText = `${subName} ${primary.fontSize} Tf\n${encStr} Tj\n/${primary.fontName} ${primary.fontSize} Tf`;
    fontStrategy = "substituted-font";
    substitutedFontName = label;
  }

  const result = spliceLogical(
    logical,
    op.start,
    op.end,
    new Uint8Array(Buffer.from(replacementText, "latin1"))
  );

  editor.runs = null;
  editor.logical = null;
  (editor as { resolver: unknown }).resolver = null;
  editor.notifyChanged();

  return {
    fontStrategy,
    substitutedFontName,
    touchedRefs: result.touchedRefKeys,
    overflowRatio: a0 === 0 ? 1 : a1 / a0,
    compensated: "none",
    warnings: [
      ...located.warnings,
      "replaced-whole-tj-operator",
    ],
  };
}

export function isTjOperator(
  editor: MutableEditor,
  located: { pieces: Piece[] }
): boolean {
  if (located.pieces.length === 0) {
    return false;
  }
  const { logical } = editor.interpret();
  const ops = scan(logical.bytes) as Op[];
  const op = ops.find((candidate) => candidate.index === located.pieces[0]!.opIndex);
  return op?.op === "TJ";
}
