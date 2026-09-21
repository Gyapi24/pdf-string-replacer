export function createRequire(_url?: string): { resolve: (id: string) => string } {
  return {
    resolve(): string {
      throw new Error("require.resolve is not available in the browser.");
    },
  };
}
