/**
 * app/api/skills/generate/route.ts
 *
 * Skill 生成 API 端点
 * POST /api/skills/generate
 */

import { NextRequest, NextResponse } from "next/server";
import { hasAIKey } from "@/lib/ai-client";
import {
  generateSkillWithAI,
  generateSkillMarkdown,
  validateSkillName,
} from "@/lib/skillTemplate";
import {
  categoryIdSchema,
  inlineVideosSchema,
  MAX_TRANSCRIPT_LENGTH,
} from "@/lib/validators/videoInput";
import {
  type GenerateSkillRequest,
  type GenerateSkillResponse,
  type Video,
} from "@/types/index";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!hasAIKey()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "AI_API_KEY 未配置。Skill 生成依赖真实 LLM，请在 .env.local 中配置后重试。",
        } as GenerateSkillResponse,
        { status: 503 }
      );
    }

    const body: GenerateSkillRequest = await req.json();
    const {
      category,
      videos: inlineVideos,
      skillName,
      skillDescription,
    } = body;

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

    const skill = await generateSkillWithAI(
      videos,
      safeCategory,
      skillName,
      skillDescription
    );
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
