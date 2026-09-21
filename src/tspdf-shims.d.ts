declare module "#tspdf/pageEditor.js" {
  export const PageContentEditorImpl: {
    prototype: {
      rewriteText: (
        this: unknown,
        located: unknown,
        newText: string,
        opts?: unknown
      ) => Promise<unknown>;
    };
  };
}

declare module "#tspdf/scanner.js" {
  export function scan(bytes: Uint8Array): Array<{
    op: string;
    operands: unknown[];
    start: number;
    end: number;
    index: number;
  }>;
}

declare module "#tspdf/splicer.js" {
  export function spliceLogical(
    logical: { bytes: Uint8Array },
    start: number,
    end: number,
    replacement: Uint8Array
  ): { touchedRefKeys: string[] };
  export function hexString(bytes: Uint8Array): string;
}
