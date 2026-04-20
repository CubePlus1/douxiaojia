/**
 * lib/skillTemplate.ts
 *
 * Skill 模板生成逻辑
 * 负责将视频内容提炼为符合 Claude Code 规范的 SKILL.md 文件
 */

import { type CategoryId, getCategories } from "@/config/categories";
import {
  type Skill,
  type SkillMetadata,
  type Video,
} from "@/types/index";
import { getAIModel, buildSkillGenerationPrompt } from "@/lib/ai-client";

// ─────────────────────────────────────────────
// 辅助：获取分类展示名
// ─────────────────────────────────────────────

function getCategoryDisplayName(catId: CategoryId): string {
  const meta = getCategories().find((c) => c.id === catId);
  return meta?.name ?? catId;
}

// ─────────────────────────────────────────────
// AI Skill 生成（使用 OpenAI）
// ─────────────────────────────────────────────

export async function generateSkillWithAI(
  videos: Video[],
  category: CategoryId,
  customName?: string,
  customDescription?: string
): Promise<Skill> {
  const { generateObject } = await import("ai");
  const { z } = await import("zod");
  const model = await getAIModel();

  const catDisplayName = getCategoryDisplayName(category);

  const videoSummaries = videos
    .map((v) => {
      const content = v.transcript
        ? v.transcript.slice(0, 500)
        : v.description;
      return `【${v.title}】\n标签：${v.tags.join("、")}\n简介：${v.description}\n内容摘要：${content}`;
    })
    .join("\n\n---\n\n");

  const SkillSchema = z.object({
    displayName: z
      .string()
      .describe("Skill 的展示名称，如「美食写作技巧」"),
    description: z.string().describe("一句话描述 Skill 的功能"),
    trigger: z.string().describe("触发词，如「教你写美食文案」"),
    instructions: z
      .string()
      .describe(
        "Skill 的核心指令，告诉 AI 应该如何表现，要具体可执行"
      ),
    examples: z
      .array(
        z.object({
          userInput: z.string().describe("用户输入示例"),
          assistantOutput: z.string().describe("助手回复示例"),
        })
      )
      .length(3)
      .describe("3 个使用示例"),
    constraints: z
      .array(z.string())
      .min(2)
      .max(5)
      .describe("约束条件，如「不使用过度夸张的形容词」"),
    capabilities: z
      .array(z.string())
      .min(3)
      .max(6)
      .describe("核心能力列表"),
    useCases: z
      .array(z.string())
      .min(3)
      .max(5)
      .describe("使用场景列表"),
  });

  const prompt = buildSkillGenerationPrompt(
    catDisplayName,
    videos.length,
    videoSummaries
  );

  const result = await generateObject({
    model,
    schema: SkillSchema,
    prompt,
  });

  const skillName =
    customName || generateSkillName(category, videos[0]?.tags[0]);
  const metadata: SkillMetadata = {
    name: skillName,
    displayName: result.object.displayName,
    description:
      customDescription || result.object.description,
    category,
    sourceVideoIds: videos.map((v) => v.id),
    createdAt: new Date().toISOString(),
  };

  return {
    ...metadata,
    ...result.object,
  };
}

// ─────────────────────────────────────────────
// 生成 SKILL.md 文件内容
// ─────────────────────────────────────────────

export function generateSkillMarkdown(
  skill: Skill,
  videos: Video[]
): string {
  const catDisplayName = getCategoryDisplayName(skill.category);

  const examplesSection = skill.examples
    .map(
      (ex, idx) => `### 示例 ${idx + 1}

\`\`\`
用户：${ex.userInput}
助手：${ex.assistantOutput}
\`\`\`
`
    )
    .join("\n");

  const videoList = videos
    .map((v) => `- **${v.title}**`)
    .join("\n");

  return `# ${skill.displayName}

${skill.description}

## 使用场景

${skill.useCases.map((uc) => `- ${uc}`).join("\n")}

## 核心能力

基于用户收藏的「${catDisplayName}」领域视频，本 Skill 能够：

${skill.capabilities.map((cap, idx) => `${idx + 1}. ${cap}`).join("\n")}

## 使用示例

${examplesSection}

## 约束条件

${skill.constraints.map((con) => `- ${con}`).join("\n")}

---

## 核心指令

${skill.instructions}

## 知识来源

本 Skill 基于以下 ${videos.length} 个收藏视频生成：

${videoList}

> **生成时间**：${new Date(skill.createdAt).toLocaleString("zh-CN")}
> **领域**：${catDisplayName}
> **视频数量**：${videos.length}
> **Skill ID**：\`${skill.name}\`

---

<sub>由 FavToSkill 自动生成</sub>
`;
}

// ─────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────

export function generateSkillName(
  category: CategoryId,
  mainTag?: string
): string {
  const categorySlug = category
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "");

  const tagSlug = mainTag
    ? mainTag
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
    : "";

  const base = tagSlug ? `${categorySlug}-${tagSlug}` : categorySlug;
  return `${base}-skill`;
}

export function validateSkillName(name: string): {
  valid: boolean;
  error?: string;
} {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Skill 名称不能为空" };
  }

  if (!/^[a-z0-9\u4e00-\u9fa5]+(-[a-z0-9\u4e00-\u9fa5]+)*$/.test(name)) {
    return {
      valid: false,
      error: "Skill 名称必须使用 kebab-case 格式（小写字母、数字、中文，用连字符分隔）",
    };
  }

  return { valid: true };
}
