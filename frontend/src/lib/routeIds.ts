/** Parse a URL segment only when it is a positive, safe decimal integer. */
export function parsePositiveSafeRouteId(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;

  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
