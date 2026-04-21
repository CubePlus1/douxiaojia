import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./intent", () => ({
  expandIntent: vi.fn(async ({ intent }: { intent: string }) =>
    intent ? ["attention", "softmax"] : []
  ),
}));

import { retrieveForSkill } from "./index";

describe("retrieveForSkill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns strategy=full when all transcripts under threshold", async () => {
    const res = await retrieveForSkill({
      videos: [{ id: "v1", title: "short", tags: [], transcript: "tiny content attention" }],
      intent: "attention",
    });
    expect(res.strategy).toBe("full");
  });

  it("retrieves top-K from multi-video pool when transcript total exceeds threshold", async () => {
    const big = "attention softmax\n\n" + "filler ".repeat(500);
    const res = await retrieveForSkill({
      videos: [
        { id: "v1", title: "", tags: [], transcript: big },
        { id: "v2", title: "", tags: [], transcript: big.replace("attention", "notthere") },
      ],
      intent: "attention",
    });
    expect(res.strategy).toBe("retrieved");
    expect(res.chunks.length).toBeGreaterThan(0);
    expect(res.chunks.length).toBeLessThanOrEqual(8);
  });

  it("falls back to full when BM25 produces zero matches", async () => {
    const noMatch = "zebra ".repeat(2000);
    const res = await retrieveForSkill({
      videos: [{ id: "v1", title: "", tags: [], transcript: noMatch }],
      intent: "attention mechanism",
    });
    expect(res.strategy).toBe("full");
    expect(res.notes.some((n) => n.toLowerCase().includes("fallback"))).toBe(true);
  });

  it("includes title + tag tokens in query", async () => {
    const { expandIntent } = await import("./intent");
    (expandIntent as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const transcript = "transformer model architecture\n\n" + "padding ".repeat(500);
    const res = await retrieveForSkill({
      videos: [
        {
          id: "v1",
          title: "transformer",
          tags: ["architecture"],
          transcript,
        },
      ],
      intent: "",
    });
    // title+tag tokens become the query; should match and return retrieved
    expect(res.strategy).toBe("retrieved");
  });
});
