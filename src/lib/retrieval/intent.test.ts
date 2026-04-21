import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));
vi.mock("@/lib/ai-client", () => ({
  hasAIKey: vi.fn(() => true),
  getAIModel: vi.fn(async () => ({ mock: "model" })),
}));

import { expandIntent, _resetIntentCacheForTests } from "./intent";
import { generateObject } from "ai";

describe("expandIntent", () => {
  beforeEach(() => {
    _resetIntentCacheForTests();
    vi.clearAllMocks();
  });

  it("returns tokens from intent + LLM expansion", async () => {
    (generateObject as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: { keywords: ["self-attention", "softmax"] },
    });
    const out = await expandIntent({
      intent: "attention mechanism",
      titles: ["Transformers"],
      tags: ["ML"],
    });
    expect(out).toContain("attention");
    expect(out).toContain("mechanism");
    expect(out).toContain("self");
    expect(out).toContain("softmax");
  });

  it("caches by (intent + title) key", async () => {
    (generateObject as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: { keywords: ["k1"] },
    });
    await expandIntent({ intent: "x y", titles: ["t"], tags: [] });
    await expandIntent({ intent: "x y", titles: ["t"], tags: [] });
    expect((generateObject as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("falls back to raw intent tokens when LLM fails", async () => {
    (generateObject as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("LLM down"));
    const out = await expandIntent({
      intent: "attention mechanism",
      titles: ["T"],
      tags: [],
    });
    expect(out).toContain("attention");
    expect(out).toContain("mechanism");
  });

  it("returns empty list for empty intent", async () => {
    const out = await expandIntent({ intent: "", titles: [], tags: [] });
    expect(out).toEqual([]);
    expect((generateObject as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("returns raw tokens when hasAIKey is false", async () => {
    const { hasAIKey } = await import("@/lib/ai-client");
    (hasAIKey as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const out = await expandIntent({
      intent: "attention mechanism",
      titles: [],
      tags: [],
    });
    expect(out).toContain("attention");
    expect(out).toContain("mechanism");
    expect((generateObject as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});
