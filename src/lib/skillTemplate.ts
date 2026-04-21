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
import { generateSkillName, validateSkillName } from "@/lib/skillName";

// 重新导出，让既有调用方（API route）不必改 import 路径
export { generateSkillName, validateSkillName };

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
    // 小模型常把 instructions 理解成数组（每条一个 bullet）。用 preprocess
    // 容忍 string / string[] 两种输出，数组自动合并为换行分隔的 markdown
    // bullet list，保持最终 SKILL.md 可读。
    instructions: z.preprocess(
      (v) => {
        if (Array.isArray(v)) {
          return v
            .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            .map((x) => `- ${x.trim()}`)
            .join("\n");
        }
        return v;
      },
      z
        .string()
        .min(1)
        .describe(
          "Skill 的核心指令，告诉 AI 应该如何表现，要具体可执行。可以是一段 markdown 文本。"
        )
    ),
    // 约束放到 description 里而不是 zod 硬限制——gpt-5.4-mini 级别的模型
    // 对 .length/.min/.max 这种硬约束命中率较差（经常返回 2 条或 4 条）。
    // 模型不严格遵守也能生成有效 Skill；总比报"schema mismatch"整个失败强。
    examples: z
      .array(
        z.object({
          userInput: z.string().describe("用户输入示例"),
          assistantOutput: z.string().describe("助手回复示例"),
        })
      )
      .min(1)
      .describe("2-3 个使用示例；每个要真实可用、不空泛"),
    constraints: z
      .array(z.string())
      .min(1)
      .describe("2-5 条约束条件，如「不使用过度夸张的形容词」"),
    capabilities: z
      .array(z.string())
      .min(1)
      .describe("3-6 条核心能力列表；每条具体可衡量"),
    useCases: z
      .array(z.string())
      .min(1)
      .describe("3-5 条使用场景列表；每条具体到用户行为"),
  });

  const prompt = buildSkillGenerationPrompt(
    catDisplayName,
    videos.length,
    videoSummaries
  );

  // 重试机制：用 mode: "json" 让小模型走 JSON 模式而不是 tool-calling
  // （gpt-5.4-mini 级别的模型对 function/tool-calling 支持较差）。
  let result;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (generateObject as any)({
        model,
        schema: SkillSchema,
        mode: "json",
        prompt,
      });
      break;
    } catch (err) {
      lastError = err;
      // 打印模型真实返回以便诊断 schema mismatch
      const cause = err as {
        text?: string;
        response?: { text?: string };
        message?: string;
      };
      console.warn(
        `[generateSkillWithAI] attempt ${attempt + 1} failed:`,
        cause.message?.slice(0, 200),
        "| raw response (truncated):",
        (cause.text ?? cause.response?.text ?? "").slice(0, 500)
      );
    }
  }

  if (!result) {
    throw new Error(
      `AI 模型未能生成符合结构的 Skill（已重试 3 次）。可能原因：模型输出不是合法 JSON、缺必需字段、或者字幕太短信息不足。底层错误：${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
  }

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

// generateSkillName / validateSkillName 已迁移到 src/lib/skillName.ts
// （纯函数、无服务端依赖，client 和 server 都能直接 import）。
// 本文件顶部 re-export 保持向后兼容。
