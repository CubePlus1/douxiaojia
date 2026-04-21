import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGenerate = vi.fn();
const mockMarkdown = vi.fn(() => "# Skill\n- instr");
const mockValidateName = vi.fn();
const mockHasKey = vi.fn();
const mockRetrieve = vi.fn();

vi.mock("@/lib/skillTemplate", () => ({
  generateSkillWithAI: (opts: unknown) => mockGenerate(opts),
  generateSkillMarkdown: () => mockMarkdown(),
  validateSkillName: (n: string) => mockValidateName(n),
}));
vi.mock("@/lib/ai-client", () => ({
  hasAIKey: () => mockHasKey(),
}));
vi.mock("@/lib/retrieval", () => ({
  retrieveForSkill: (args: unknown) => mockRetrieve(args),
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/skills/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const baseSkill = {
  name: "some-skill",
  displayName: "X",
  description: "d",
  trigger: "t",
  instructions: "- do x",
  examples: [{ userInput: "i", assistantOutput: "o" }],
  constraints: ["c"],
  capabilities: ["cap"],
  useCases: ["uc"],
  category: "tech" as const,
  sourceVideoIds: ["v"],
  createdAt: new Date().toISOString(),
};

const validBody = {
  category: "tech",
  videos: [
    {
      title: "Test",
      transcript: "x".repeat(250),
      tags: [],
    },
  ],
  skillName: "test-skill",
};

describe("POST /api/skills/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasKey.mockReturnValue(true);
    mockValidateName.mockReturnValue({ valid: true });
    mockGenerate.mockResolvedValue(baseSkill);
  });

  it("happy path: returns 200 with skillContent", async () => {
    mockRetrieve.mockResolvedValue({
      strategy: "full",
      chunks: [],
      keywords: [],
      notes: [],
    });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.skillContent).toContain("Skill");
  });

  it("503 when hasAIKey=false", async () => {
    mockHasKey.mockReturnValue(false);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(503);
  });

  it("400 when category is invalid", async () => {
    const res = await POST(makeReq({ ...validBody, category: "bogus" }));
    expect(res.status).toBe(400);
  });

  it("400 when skillName is invalid", async () => {
    mockValidateName.mockReturnValue({ valid: false, error: "bad name" });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(400);
  });

  it("422 when videos array is empty", async () => {
    const res = await POST(makeReq({ ...validBody, videos: [] }));
    expect(res.status).toBe(422);
  });

  it("422 when intent is too long", async () => {
    const res = await POST(
      makeReq({ ...validBody, intent: "x".repeat(500) })
    );
    expect(res.status).toBe(422);
  });

  it("passes retrievalContext to generateSkillWithAI when strategy=retrieved", async () => {
    mockRetrieve.mockResolvedValue({
      strategy: "retrieved",
      chunks: [
        {
          id: "v1:c0",
          sourceId: `user-input-${Date.now()}-0`,
          index: 0,
          text: "content",
          startRatio: 0,
          endRatio: 1,
          score: 1,
          matchedTokens: ["x"],
        },
      ],
      keywords: ["x"],
      notes: [],
    });
    await POST(makeReq({ ...validBody, intent: "attention" }));
    const call = mockGenerate.mock.calls[0][0];
    expect(call.retrievalContext).toBeDefined();
    expect(call.retrievalContext.intent).toBe("attention");
  });

  it("omits retrievalContext when strategy=full", async () => {
    mockRetrieve.mockResolvedValue({
      strategy: "full",
      chunks: [],
      keywords: [],
      notes: ["under threshold"],
    });
    await POST(makeReq(validBody));
    const call = mockGenerate.mock.calls[0][0];
    expect(call.retrievalContext).toBeUndefined();
  });

  it("500 when generateSkillWithAI throws", async () => {
    mockRetrieve.mockResolvedValue({
      strategy: "full",
      chunks: [],
      keywords: [],
      notes: [],
    });
    mockGenerate.mockRejectedValueOnce(new Error("LLM down"));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
  });
});
