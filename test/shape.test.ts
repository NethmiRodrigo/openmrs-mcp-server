import { describe, expect, it } from "vitest";
import { MAX_BYTES, stripLinks, toPage, toText, type Page } from "../src/openmrs/shape.js";

const bigPage = (startIndex: number, count = 300): Page => ({
  results: Array.from({ length: count }, (_, i) => ({ i, text: "x".repeat(1000) })),
  startIndex,
});

describe("shape", () => {
  it("strips links deeply", () => {
    expect(
      stripLinks({ links: [1], results: [{ a: 1, links: [2], b: { links: [3] } }] }),
    ).toEqual({ results: [{ a: 1, b: {} }] });
  });

  it("toPage computes nextStartIndex", () => {
    const body = {
      results: Array.from({ length: 10 }, (_, i) => ({ i, links: [{ rel: "self" }] })),
      totalCount: 56,
      links: [{ rel: "next", uri: "http://host/openmrs/ws/rest/v1/obs?startIndex=30" }],
    };
    const page = toPage(body, 20);
    expect(page.nextStartIndex).toBe(30);
    expect(page.totalCount).toBe(56);
    expect(page.startIndex).toBe(20);
    expect(page.results).toHaveLength(10);
    expect(page.results[0]).toEqual({ i: 0 });
  });

  it("toPage omits nextStartIndex without next link", () => {
    const page = toPage({ results: [{ a: 1 }], links: [{ rel: "prev", uri: "u" }] }, 0);
    expect(page).toEqual({ results: [{ a: 1 }], startIndex: 0 });
    expect("nextStartIndex" in page).toBe(false);
    expect("totalCount" in page).toBe(false);
  });

  it("toPage handles a body without results", () => {
    expect(toPage({ uuid: "x" }, 5)).toEqual({ results: [], startIndex: 5 });
  });

  it("toText caps lists at whole items", () => {
    const out = toText(bigPage(0));
    const parsed = JSON.parse(out);
    expect(parsed.truncated).toBe(true);
    expect(parsed.returned).toBeLessThan(300);
    expect(parsed.results).toHaveLength(parsed.returned);
    expect(Buffer.byteLength(out)).toBeLessThanOrEqual(MAX_BYTES);
    expect(parsed.note).toContain("limit");
    expect(parsed.note).toContain("startIndex");
    expect(parsed.note).toContain("v=custom");
  });

  it("truncation fixes nextStartIndex", () => {
    const parsed = JSON.parse(toText(bigPage(40)));
    expect(parsed.nextStartIndex).toBe(40 + parsed.returned);
    expect(parsed.nextStartIndex).not.toBe(340);
  });

  it("toText cuts single objects with warning", () => {
    const warning =
      "Response cut at 100 KB; the text below is not valid JSON. Use v=custom:(...) to request fewer fields.";
    const out = toText({ blob: "é".repeat(100_000) });
    expect(out.startsWith(warning)).toBe(true);
    expect(Buffer.byteLength(out)).toBeLessThanOrEqual(MAX_BYTES + warning.length + 1);
    expect(out).not.toContain("�");
  });

  it("toText leaves small values unchanged", () => {
    const x = { a: [1, 2, { b: "c" }], d: null };
    expect(JSON.parse(toText(x))).toEqual(x);
    const page: Page = { results: [{ a: 1 }], startIndex: 0, totalCount: 1 };
    expect(JSON.parse(toText(page))).toEqual(page);
  });
});
