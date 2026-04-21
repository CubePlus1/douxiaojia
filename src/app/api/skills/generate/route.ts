/**
 * app/api/skills/generate/route.ts
 *
 * Skill 生成 API 端点
 * POST /api/skills/generate
 */

import { NextRequest, NextResponse } from "next/server";
import { hasAIKey, type RetrievalContext } from "@/lib/ai-client";
import {
  generateSkillWithAI,
  generateSkillMarkdown,
  validateSkillName,
} from "@/lib/skillTemplate";
import {
  categoryIdSchema,
  inlineVideosSchema,
  intentSchema,
  MAX_TRANSCRIPT_LENGTH,
} from "@/lib/validators/videoInput";
import {
  type GenerateSkillRequest,
  type GenerateSkillResponse,
  type Video,
} from "@/types/index";
import { retrieveForSkill } from "@/lib/retrieval";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!hasAIKey()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "AI_API_KEY 未配置。Skill 生成依赖真实 LLM，请在 .env 中配置后重试。",
        } as GenerateSkillResponse,
        { status: 503 }
      );
    }

    const body = (await req.json()) as GenerateSkillRequest & { intent?: string };
    const {
      category,
      videos: inlineVideos,
      skillName,
      skillDescription,
      intent: rawIntent,
    } = body;

    const parsedIntent = intentSchema.safeParse(rawIntent);
    if (!parsedIntent.success && rawIntent != null && rawIntent !== "") {
      console.warn(
        "[generate] intent validation failed, discarding:",
        parsedIntent.error.issues[0]?.message
      );
    }
    const intent = parsedIntent.success ? (parsedIntent.data ?? "") : "";

    const parsedCategory = categoryIdSchema.safeParse(category);

    if (!parsedCategory.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            parsedCategory.error.issues[0]?.message ??
            "category 是必填字段",
        } as GenerateSkillResponse,
        { status: 400 }
      );
    }
    const safeCategory = parsedCategory.data;

    if (skillName) {
      const validation = validateSkillName(skillName);
      if (!validation.valid) {
        return NextResponse.json(
          {
            success: false,
            error: validation.error,
          } as GenerateSkillResponse,
          { status: 400 }
        );
      }
    }

    const parsedVideos = inlineVideosSchema.safeParse(inlineVideos);

    if (!parsedVideos.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            parsedVideos.error.issues[0]?.message ?? "视频输入校验失败",
        } as GenerateSkillResponse,
        { status: 422 }
      );
    }

    let truncated = false;
    const baseId = `user-input-${Date.now()}`;
    const videos: Video[] = parsedVideos.data.map((video, index) => {
      const transcript = video.transcript.slice(0, MAX_TRANSCRIPT_LENGTH);
      if (transcript.length < video.transcript.length) {
        truncated = true;
      }

      return {
        id: `${baseId}-${index}`,
        title: video.title,
        description: video.description ?? "",
        tags: video.tags ?? [],
        category: safeCategory,
        savedAt: new Date().toISOString(),
        transcript,
        author: video.author,
        url: video.url,
        duration: video.duration,
      };
    });

    const retrieval = await retrieveForSkill({
      videos: videos.map((v) => ({
        id: v.id,
        title: v.title,
        tags: v.tags,
        transcript: v.transcript ?? "",
      })),
      intent,
    });

    let retrievalContext: RetrievalContext | undefined;
    if (retrieval.strategy === "retrieved") {
      const videoMap: RetrievalContext["videoMap"] = {};
      videos.forEach((v, i) => {
        videoMap[v.id] = { title: v.title, index: i };
      });
      retrievalContext = { intent, chunks: retrieval.chunks, videoMap };
    } else if (retrieval.notes.length > 0) {
      console.warn("[generate] retrieval fell back to full mode:", retrieval.notes);
    }

    const skill = await generateSkillWithAI({
      videos,
      category: safeCategory,
      customName: skillName,
      customDescription: skillDescription,
      retrievalContext,
    });
    const skillContent = generateSkillMarkdown(skill, videos);

    return NextResponse.json({
      success: true,
      skillPath: `.claude/skills/${skill.name}/SKILL.md`,
      skillName: skill.name,
      skillContent,
      skill,
      usageExample: `/${skill.name}`,
      truncated,
    } as GenerateSkillResponse);
  } catch (error) {
    console.error("[Skill Generate Error]", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "生成 Skill 时发生未知错误",
      } as GenerateSkillResponse,
      { status: 500 }
    );
  }
}
