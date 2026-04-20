import { NextRequest, NextResponse } from "next/server";
import { getAIModel, hasAIKey } from "@/lib/ai-client";
import { getCategories } from "@/config/categories";
import {
  categoryIds,
  videoClassificationSchema,
} from "@/lib/validators/videoInput";

export const runtime = "nodejs";

const MISSING_KEY_ERROR = {
  error:
    "AI_API_KEY 未配置。分类建议依赖真实 LLM，请在 .env.local 中配置后重试。",
} as const;

export async function POST(req: NextRequest) {
  try {
    if (!hasAIKey()) {
      return NextResponse.json(MISSING_KEY_ERROR, { status: 503 });
    }

    const body = await req.json();
    const parsed = videoClassificationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "视频信息校验失败",
        },
        { status: 422 }
      );
    }

    const input = parsed.data;

    const { generateObject } = await import("ai");
    const { z } = await import("zod");

    const ClassifySchema = z.object({
      category: z.enum(categoryIds),
      confidence: z.number().min(0).max(1),
      reason: z.string().min(1),
    });

    const categories = getCategories()
      .map(
        (category) =>
          `- ${category.id} / ${category.name}: ${category.description}；关键词：${category.topTags.join("、")}`
      )
      .join("\n");

    const transcriptSnippet = input.transcript.slice(0, 5000);
    const result = await generateObject({
      model: await getAIModel(),
      schema: ClassifySchema,
      prompt: `你是 FavToSkill 的分类助手。请根据视频的标题、简介和字幕，从以下分类中选出最合适的一类，只能选一个：

${categories}

视频标题：${input.title}
视频简介：${input.description ?? "无"}
视频字幕：
${transcriptSnippet}

输出要求：
1. category 必须是给定 id 之一
2. confidence 返回 0 到 1 的小数
3. reason 用中文简洁说明判断依据
4. 如果内容同时涉及多个领域，优先选择最核心的创作/学习场景。`,
    });

    return NextResponse.json(result.object);
  } catch (error) {
    console.error("[Skill Classify Error]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "分类时发生未知错误",
      },
      { status: 500 }
    );
  }
}
