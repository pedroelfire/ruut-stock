/** Detail page of a symbol. Encoded, since class suffixes such as BRK.B or BF-B are valid. */
export function stockPath(symbol: string): string {
  return `/stocks/${encodeURIComponent(symbol)}`;
}
