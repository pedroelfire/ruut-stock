export type SearchParams = Record<string, string | string[] | undefined>;

/** First value of a query parameter: `?next=/a&next=/b` reads as `/a`. */
export function firstParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
