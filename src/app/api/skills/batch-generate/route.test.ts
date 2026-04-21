import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRetrieve = vi.fn();
const mockGenerate = vi.fn();
const mockMarkdown = vi.fn(() => "# Skill\n- x");
const mockValidate = vi.fn();
const mockHasKey = vi.fn();

vi.mock("@/lib/retrieval", () => ({
  retrieveForSkill: (args: unknown) => mockRetrieve(args),
}));
vi.mock("@/lib/skillTemplate", () => ({
  generateSkillWithAI: (opts: unknown) => mockGenerate(opts),
  generateSkillMarkdown: () => mockMarkdown(),
  validateSkillName: (n: string) => mockValidate(n),
}));
vi.mock("@/lib/ai-client", () => ({
  hasAIKey: () => mockHasKey(),
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/skills/batch-generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const baseSkill = {
  name: "test-skill",
  displayName: "Test Skill",
  description: "desc",
  trigger: "trigger",
  instructions: "- do x",
  examples: [{ userInput: "i", assistantOutput: "o" }],
  constraints: ["c"],
  capabilities: ["cap"],
  useCases: ["use"],
  category: "tech" as const,
  sourceVideoIds: ["v1"],
  createdAt: new Date().toISOString(),
};

const validBody = {
  videos: [
    {
      id: "v1",
      title: "T1",
      transcript: "content",
      tags: [],
      url: "https://a.com",
    },
  ],
  intent: "attention",
  category: "tech",
  skillName: "attention-skill",
};

describe("POST /api/skills/batch-generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasKey.mockReturnValue(true);
    mockValidate.mockReturnValue({ valid: true });
    mockGenerate.mockResolvedValue(baseSkill);
    mockRetrieve.mockResolvedValue({
      strategy: "retrieved" as const,
      chunks: [
        {
          id: "v1:c0",
          sourceId: "v1",
          index: 0,
          text: "some content",
          startRatio: 0,
          endRatio: 1,
          score: 2,
          matchedTokens: ["attention"],
        },
      ],
      keywords: ["attention"],
      notes: [],
    });
  });

  it("returns skillContent + strategy for valid input", async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.skillContent).toContain("Skill");
    expect(json.strategy).toBe("retrieved");
    expect(json.sources).toHaveLength(1);
  });

  it("passes skillDescription through to generateSkillWithAI", async () => {
    await POST(makeReq({ ...validBody, skillDescription: "custom desc" }));
    const call = mockGenerate.mock.calls[0][0];
    expect(call.customDescription).toBe("custom desc");
  });

  it("503 when hasAIKey=false", async () => {
    mockHasKey.mockReturnValue(false);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(503);
  });

  it("400 when skillName is invalid", async () => {
    mockValidate.mockReturnValue({ valid: false, error: "bad name" });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(400);
  });

  it("422 on empty videos", async () => {
    const res = await POST(makeReq({ ...validBody, videos: [] }));
    expect(res.status).toBe(422);
  });

  it("422 on oversize transcript (DoS guard)", async () => {
    const res = await POST(
      makeReq({
        ...validBody,
        videos: [
          { ...validBody.videos[0], transcript: "x".repeat(10_001) },
        ],
      })
    );
    expect(res.status).toBe(422);
  });

  it("400 on invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/skills/batch-generate", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("500 when generateSkillWithAI throws", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("LLM failed"));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
  });

  it("omits retrievalContext when strategy=full (short batch)", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "full" as const,
      chunks: [],
      keywords: [],
      notes: ["under threshold"],
    });
    await POST(makeReq(validBody));
    const call = mockGenerate.mock.calls[0][0];
    expect(call.retrievalContext).toBeUndefined();
  });
});
