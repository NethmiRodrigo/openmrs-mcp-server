export interface Page {
  results: unknown[];
  startIndex: number;
  totalCount?: number;
  nextStartIndex?: number;
  truncated?: true;
  returned?: number;
  note?: string;
}

export const MAX_BYTES = 100_000;

const CUT_WARNING =
  "Response cut at 100 KB; the text below is not valid JSON. Use v=custom:(...) to request fewer fields.";

export function stripLinks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLinks);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key !== "links") out[key] = stripLinks(child);
    }
    return out;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function toPage(body: unknown, startIndex: number): Page {
  if (!isRecord(body) || !Array.isArray(body.results)) {
    return { results: [], startIndex };
  }
  const results = stripLinks(body.results) as unknown[];
  const page: Page = { results, startIndex };
  if (typeof body.totalCount === "number") page.totalCount = body.totalCount;
  const hasNext =
    Array.isArray(body.links) &&
    body.links.some((link) => isRecord(link) && link.rel === "next");
  if (hasNext) page.nextStartIndex = startIndex + results.length;
  return page;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function truncatePage(value: Record<string, unknown>, items: unknown[]): string | undefined {
  const startIndex = typeof value.startIndex === "number" ? value.startIndex : 0;
  const build = (returned: number): string =>
    JSON.stringify(
      {
        ...value,
        results: items.slice(0, returned),
        truncated: true,
        returned,
        nextStartIndex: startIndex + Math.max(returned, 1),
        note:
          returned === 0
            ? `The item at startIndex ${startIndex} is larger than 100 KB and was left out. Request it on its own with v=custom:(...) to choose fewer fields. Continue with startIndex=${startIndex + 1}.`
            : `Output capped at 100 KB; ${returned} of ${items.length} items returned. Request the next items with startIndex=${startIndex + returned}, use a smaller limit, or use v=custom:(...) to request fewer fields.`,
      },
      null,
      2,
    );
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (byteLength(build(mid)) <= MAX_BYTES) low = mid;
    else high = mid - 1;
  }
  const out = build(low);
  return byteLength(out) <= MAX_BYTES ? out : undefined;
}

function cutBytes(text: string): string {
  const bytes = Buffer.from(text, "utf8");
  let end = MAX_BYTES;
  // Step back so the cut does not split a UTF-8 sequence.
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return `${CUT_WARNING}\n${bytes.subarray(0, end).toString("utf8")}`;
}

export function toText(value: unknown): string {
  const text = JSON.stringify(value, null, 2) ?? "null";
  if (byteLength(text) <= MAX_BYTES) return text;
  if (isRecord(value) && Array.isArray(value.results)) {
    const page = value.results.length > 0 ? truncatePage(value, value.results) : undefined;
    if (page !== undefined) return page;
  }
  return cutBytes(text);
}
