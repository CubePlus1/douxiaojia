import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRun = vi.fn();
vi.mock("@/lib/batch/runner", () => ({
  runBatchExtract: (urls: string[]) => mockRun(urls),
}));

function defaultOk(urls: string[]) {
  return {
    items: urls.map((url) => ({
      url,
      status: "done" as const,
      result: {
        title: "T",
        transcript: "t",
        tags: [],
        url,
        platform: "youtube",
        subtitleMeta: { lang: "en", source: "auto", format: "srt", isAuto: true },
      },
    })),
    successCount: urls.length,
    failureCount: 0,
  };
}

mockRun.mockImplementation(async (urls: string[]) => defaultOk(urls));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/videos/batch-extract", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/videos/batch-extract", () => {
  it("returns items for valid input", async () => {
    const res = await POST(makeReq({ urls: ["https://a.com", "https://b.com"] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(2);
    expect(json.successCount).toBe(2);
  });

  it("rejects empty urls", async () => {
    const res = await POST(makeReq({ urls: [] }));
    expect(res.status).toBe(422);
  });

  it("rejects more than 10 urls", async () => {
    const res = await POST(makeReq({ urls: Array(11).fill("https://x.com") }));
    expect(res.status).toBe(422);
  });

  it("rejects non-url strings", async () => {
    const res = await POST(makeReq({ urls: ["not-a-url"] }));
    expect(res.status).toBe(422);
  });

  it("400 on invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/videos/batch-extract", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("422 when every URL fails (but still returns items for UI)", async () => {
    mockRun.mockResolvedValueOnce({
      items: [
        {
          url: "https://bad.example.com",
          status: "failed" as const,
          error: { code: "EXTRACTOR_FAILED", message: "boom" },
        },
      ],
      successCount: 0,
      failureCount: 1,
    });
    const res = await POST(makeReq({ urls: ["https://bad.example.com"] }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.successCount).toBe(0);
    expect(json.error).toBeDefined();
  });

  it("500 when runBatchExtract itself throws", async () => {
    mockRun.mockRejectedValueOnce(new Error("runner import failed"));
    const res = await POST(makeReq({ urls: ["https://a.com"] }));
    expect(res.status).toBe(500);
  });
});
