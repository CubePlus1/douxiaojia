import { z } from "zod";
import { CATEGORIES } from "@/config/categories";
import type { CategoryId } from "@/types/index";

export const MIN_TRANSCRIPT_LENGTH = 200;
export const MAX_TRANSCRIPT_LENGTH = 10_000;
// 以下上限主要是防御恶意/意外巨大输入，不是内容策略——YouTube 抓取
// 常有 2k+ 字 description、30+ tags、单 tag 30+ 字（搬运视频尤其明显）。
// 后端对超限内容自动截断而不是报错（见 /api/skills/generate）。
export const MAX_DESCRIPTION_LENGTH = 8_000;
export const MAX_TITLE_LENGTH = 300;
export const MAX_AUTHOR_LENGTH = 200;
export const MAX_TAG_COUNT = 50;
export const MAX_TAG_LENGTH = 80;

const EMPTY_TO_UNDEFINED = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }

  return value;
};

export const categoryIds = CATEGORIES.map((category) => category.id) as [
  CategoryId,
  ...CategoryId[],
];

export const categoryIdSchema = z.enum(categoryIds);

export const videoInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "请输入视频标题")
    .max(MAX_TITLE_LENGTH, `标题最多 ${MAX_TITLE_LENGTH} 个字`),
  transcript: z
    .string()
    .trim()
    .min(MIN_TRANSCRIPT_LENGTH, `字幕/文字稿至少 ${MIN_TRANSCRIPT_LENGTH} 字`),
  description: z.preprocess(
    EMPTY_TO_UNDEFINED,
    z
      .string()
      .max(MAX_DESCRIPTION_LENGTH, `简介最多 ${MAX_DESCRIPTION_LENGTH} 个字`)
      .optional()
  ),
  author: z.preprocess(
    EMPTY_TO_UNDEFINED,
    z
      .string()
      .max(MAX_AUTHOR_LENGTH, `作者最多 ${MAX_AUTHOR_LENGTH} 个字`)
      .optional()
  ),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1, "标签不能为空")
        .max(MAX_TAG_LENGTH, `每个标签最多 ${MAX_TAG_LENGTH} 个字`)
    )
    .max(MAX_TAG_COUNT, `标签最多 ${MAX_TAG_COUNT} 个`)
    .optional()
    .default([]),
  url: z.preprocess(
    EMPTY_TO_UNDEFINED,
    z.string().url("来源链接格式不正确").optional()
  ),
  duration: z.number().int().positive("时长必须大于 0").optional(),
});

export const inlineVideosSchema = z
  .array(videoInputSchema)
  .min(1, "至少提供 1 个视频");

export const videoClassificationSchema = videoInputSchema.pick({
  title: true,
  description: true,
  transcript: true,
});

export const MAX_INTENT_LENGTH = 300;
export const MAX_BATCH_URLS = 10;

export const intentSchema = z.preprocess(
  EMPTY_TO_UNDEFINED,
  z
    .string()
    .max(MAX_INTENT_LENGTH, `学习意图最多 ${MAX_INTENT_LENGTH} 字`)
    .optional()
);

export const videoInputWithIntentSchema = videoInputSchema.extend({
  intent: intentSchema,
});

export const batchExtractInputSchema = z.object({
  urls: z
    .array(z.string().trim().url("URL 格式不正确"))
    .min(1, "至少提供 1 个 URL")
    .max(MAX_BATCH_URLS, `最多支持 ${MAX_BATCH_URLS} 个视频`),
});

export const batchGenerateInputSchema = z.object({
  videos: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z
          .string()
          .trim()
          .min(1, "视频标题不能为空")
          .max(MAX_TITLE_LENGTH),
        author: z
          .string()
          .max(MAX_AUTHOR_LENGTH)
          .optional()
          .default(""),
        description: z
          .string()
          .max(MAX_DESCRIPTION_LENGTH)
          .optional()
          .default(""),
        transcript: z
          .string()
          .min(1, "视频字幕不能为空")
          .max(MAX_TRANSCRIPT_LENGTH, `单个视频字幕最多 ${MAX_TRANSCRIPT_LENGTH} 字`),
        tags: z.array(z.string().max(MAX_TAG_LENGTH)).max(MAX_TAG_COUNT).default([]),
        url: z.string().url(),
      })
    )
    .min(1, "至少 1 个视频")
    .max(MAX_BATCH_URLS, `最多 ${MAX_BATCH_URLS} 个视频`),
  intent: intentSchema,
  category: categoryIdSchema,
  skillName: z.string().trim().min(1, "请填写 Skill 名"),
  skillDescription: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
});
