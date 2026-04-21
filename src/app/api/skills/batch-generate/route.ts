import { NextRequest, NextResponse } from "next/server";
import { batchGenerateInputSchema } from "@/lib/validators/videoInput";
import { retrieveForSkill } from "@/lib/retrieval";
import {
  generateSkillWithAI,
  generateSkillMarkdown,
  validateSkillName,
} from "@/lib/skillTemplate";
import { hasAIKey, type RetrievalContext } from "@/lib/ai-client";
import type { Video } from "@/types/index";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!hasAIKey()) {
    return NextResponse.json(
      { error: "AI_API_KEY 未配置。请在 .env 中配置后重试。" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    console.warn(
      "[batch-generate] failed to parse request body:",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const parsed = batchGenerateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "输入校验失败" },
      { status: 422 }
    );
  }

  const {
    videos: inputVideos,
    intent: rawIntent,
    category,
    skillName,
    skillDescription,
  } = parsed.data;
  const intent = rawIntent ?? "";

  const nameCheck = validateSkillName(skillName);
  if (!nameCheck.valid) {
    return NextResponse.json({ error: nameCheck.error }, { status: 400 });
  }

  try {
    const videoMap: RetrievalContext["videoMap"] = {};
    inputVideos.forEach((v, i) => {
      videoMap[v.id] = { title: v.title, index: i };
    });

    const retrieval = await retrieveForSkill({
      videos: inputVideos.map((v) => ({
        id: v.id,
        title: v.title,
        tags: v.tags,
        transcript: v.transcript,
      })),
      intent,
    });

    let retrievalContext: RetrievalContext | undefined;
    if (retrieval.strategy === "retrieved") {
      retrievalContext = { intent, chunks: retrieval.chunks, videoMap };
    } else if (retrieval.notes.length > 0) {
      console.warn(
        "[batch-generate] retrieval fell back to full mode:",
        retrieval.notes
      );
    }

    // Map to internal Video type expected by generateSkillWithAI
    const savedAt = new Date().toISOString();
    const videos: Video[] = inputVideos.map((v) => ({
      id: v.id,
      title: v.title,
      description: v.description ?? "",
      tags: v.tags ?? [],
      category,
      savedAt,
      transcript: v.transcript,
      author: v.author ?? undefined,
      url: v.url,
    }));

    const skill = await generateSkillWithAI({
      videos,
      category,
      customName: skillName,
      customDescription: skillDescription,
      retrievalContext,
    });
    const skillContent = generateSkillMarkdown(skill, videos);

    return NextResponse.json({
      success: true,
      strategy: retrieval.strategy,
      skillName: skill.name,
      skillPath: `.claude/skills/${skill.name}/SKILL.md`,
      skillContent,
      skill,
      sources: inputVideos.map((v, i) => ({ index: i + 1, title: v.title, url: v.url })),
      retrievalNotes: retrieval.notes,
    });
  } catch (err) {
    console.error("[batch-generate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "批量生成失败" },
      { status: 500 }
    );
  }
}
