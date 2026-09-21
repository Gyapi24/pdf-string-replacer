import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function clonePdfBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array
    ? new Uint8Array(data)
    : new Uint8Array(data.slice(0));
}

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  pageIndex: number;
}

export interface TextMatch {
  pageIndex: number;
  start: number;
  end: number;
  text: string;
  rects: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
  }>;
}

export async function loadPdf(data: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ data: clonePdfBytes(data) }).promise;
}

export async function extractItems(
  pdf: PDFDocumentProxy
): Promise<{ items: PdfTextItem[]; plainText: string }> {
  const items: PdfTextItem[] = [];
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageItems: PdfTextItem[] = [];

    for (const raw of content.items) {
      if (!("str" in raw)) {
        continue;
      }
      const item = raw as TextItem;
      const transform = item.transform;
      const fontSize = Math.hypot(transform[2], transform[3]) || item.height || 12;
      pageItems.push({
        str: item.str,
        x: transform[4],
        y: transform[5],
        width: item.width,
        height: item.height || fontSize,
        fontSize,
        pageIndex: pageNumber - 1,
      });
    }

    items.push(...pageItems);
    pages.push(`--- page ${pageNumber} ---\n${joinVisibleText(pageItems)}`);
  }

  return { items, plainText: pages.join("\n\n") };
}

function joinVisibleText(items: PdfTextItem[]): string {
  let text = "";
  let lastY: number | null = null;
  let lastRight: number | null = null;

  for (const item of items) {
    if (lastY !== null && Math.abs(item.y - lastY) > item.fontSize * 0.5) {
      text += "\n";
    } else if (lastRight !== null && item.x - lastRight > item.fontSize * 0.3) {
      text += " ";
    }
    text += item.str;
    lastY = item.y;
    lastRight = item.x + item.width;
  }

  return text;
}

export function findMatches(
  items: PdfTextItem[],
  query: string,
  caseSensitive: boolean
): TextMatch[] {
  if (!query) {
    return [];
  }

  const matches: TextMatch[] = [];
  const byPage = new Map<number, PdfTextItem[]>();

  for (const item of items) {
    const list = byPage.get(item.pageIndex) ?? [];
    list.push(item);
    byPage.set(item.pageIndex, list);
  }

  for (const [pageIndex, pageItems] of byPage) {
    const full = pageItems.map((item) => item.str).join("");
    const haystack = caseSensitive ? full : full.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    let from = 0;

    while (from <= haystack.length - needle.length) {
      const start = haystack.indexOf(needle, from);
      if (start === -1) {
        break;
      }
      const end = start + needle.length;
      matches.push({
        pageIndex,
        start,
        end,
        text: full.slice(start, end),
        rects: rectsForRange(pageItems, start, end),
      });
      from = end;
    }
  }

  return matches;
}

function rectsForRange(items: PdfTextItem[], start: number, end: number) {
  const rects: TextMatch["rects"] = [];
  let offset = 0;

  for (const item of items) {
    const itemStart = offset;
    const itemEnd = offset + item.str.length;
    offset = itemEnd;

    const overlapStart = Math.max(itemStart, start);
    const overlapEnd = Math.min(itemEnd, end);
    if (overlapStart >= overlapEnd) {
      continue;
    }

    const localStart = overlapStart - itemStart;
    const localEnd = overlapEnd - itemStart;
    const unit = item.str.length > 0 ? item.width / item.str.length : 0;
    const fontSize = item.fontSize || 12;

    rects.push({
      x: item.x + localStart * unit,
      y: item.y - fontSize * 0.2,
      width: Math.max((localEnd - localStart) * unit, 1),
      height: fontSize * 1.25,
      fontSize,
    });
  }

  return rects;
}

export async function renderFirstPage(
  data: ArrayBuffer | Uint8Array,
  canvas: HTMLCanvasElement
): Promise<void> {
  const pdf = await loadPdf(data);
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.4 });
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not create a 2D canvas context.");
    }
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
  } finally {
    await pdf.destroy();
  }
}
