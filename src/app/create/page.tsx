"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORIES } from "@/config/categories";
import CategoryPicker, {
  CategorySuggestion,
} from "@/components/create/CategoryPicker";
import GeneratedSkillModal from "@/components/create/GeneratedSkillModal";
import ModeSwitch, { CreateMode } from "@/components/create/ModeSwitch";
import SkillConfig from "@/components/create/SkillConfig";
import UrlExtractor, {
  type UrlExtractorResult,
} from "@/components/create/UrlExtractor";
import VideoForm, {
  VideoFormErrors,
  VideoFormValue,
} from "@/components/create/VideoForm";
import {
  MIN_TRANSCRIPT_LENGTH,
  videoClassificationSchema,
  videoInputSchema,
} from "@/lib/validators/videoInput";
import type { CategoryId, GenerateSkillResponse } from "@/types/index";

type CreateCategory = {
  id: CategoryId;
  name: string;
  description: string;
  color: string;
  colorDark?: string;
  icon?: string;
};

const categories = CATEGORIES as readonly CreateCategory[];

const initialVideoForm: VideoFormValue = {
  title: "",
  author: "",
  description: "",
  transcript: "",
  tags: [],
  url: "",
};

function suggestSkillName(title: string, category?: CategoryId) {
  const normalizedTitle = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (normalizedTitle) {
    return normalizedTitle.endsWith("-skill")
      ? normalizedTitle
      : `${normalizedTitle}-skill`;
  }

  return category ? `${category}-skill` : "";
}

function mapVideoErrors(value: unknown): VideoFormErrors {
  const parsed = videoInputSchema.safeParse(value);
  if (parsed.success) {
    return {};
  }

  return parsed.error.issues.reduce<VideoFormErrors>((errors, issue) => {
    const key = issue.path[0] as keyof VideoFormValue | undefined;
    if (key && !errors[key]) {
      errors[key] = issue.message;
    }
    return errors;
  }, {});
}

export default function CreatePage() {
  const [mode, setMode] = useState<CreateMode>("text");
  const [videoForm, setVideoForm] = useState<VideoFormValue>(initialVideoForm);
  const [extractedDuration, setExtractedDuration] = useState<number>();
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>();
  const [videoErrors, setVideoErrors] = useState<VideoFormErrors>({});
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [skillName, setSkillName] = useState("");
  const [skillNameDirty, setSkillNameDirty] = useState(false);
  const [skillNameError, setSkillNameError] = useState<string>();
  const [skillDescription, setSkillDescription] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [generatedSkill, setGeneratedSkill] =
    useState<GenerateSkillResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [subtitleMeta, setSubtitleMeta] = useState<{
    source: "manual" | "auto";
    language: string;
    isAuto: boolean;
    charCount: number;
  } | null>(null);

  const transcriptLength = videoForm.transcript.trim().length;
  const canAskAI = useMemo(
    () =>
      videoForm.title.trim().length > 0 &&
      transcriptLength >= MIN_TRANSCRIPT_LENGTH,
    [transcriptLength, videoForm.title]
  );

  const suggestDisabledReason = useMemo(() => {
    if (canAskAI) return null;
    if (videoForm.title.trim().length === 0) {
      return "先填视频标题";
    }
    const remaining = MIN_TRANSCRIPT_LENGTH - transcriptLength;
    return `字幕再补 ${remaining} 字（至少 ${MIN_TRANSCRIPT_LENGTH} 字）`;
  }, [canAskAI, transcriptLength, videoForm.title]);

  const clearFieldError = (field: keyof VideoFormValue) => {
    if (!videoErrors[field]) {
      return;
    }

    setVideoErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleModeChange = (nextMode: CreateMode) => {
    setMode(nextMode);

    if (nextMode === "text") {
      setExtractedDuration(undefined);
      setSubtitleMeta(null);
    }
  };

  const handleVideoChange = (nextValue: VideoFormValue) => {
    setVideoForm(nextValue);
    if (!skillNameDirty) {
      setSkillName(suggestSkillName(nextValue.title, selectedCategory));
    }
    setSubmitError(null);
    setSuggestion(null);
    clearFieldError("title");
    clearFieldError("author");
    clearFieldError("description");
    clearFieldError("transcript");
    clearFieldError("tags");
    clearFieldError("url");
  };

  const handleExtracted = (result: UrlExtractorResult) => {
    setVideoForm({
      title: result.video.title,
      author: result.video.author ?? "",
      description: result.video.description ?? "",
      transcript: result.video.transcript,
      tags: result.video.tags ?? [],
      url: result.video.url,
    });
    if (!skillNameDirty) {
      setSkillName(suggestSkillName(result.video.title, selectedCategory));
    }
    setExtractedDuration(result.video.duration);
    setSubtitleMeta({
      source: result.meta.subtitleSource,
      language: result.meta.language,
      isAuto: result.meta.isAuto,
      charCount: result.meta.charCount,
    });
    setSubmitError(null);
    setCategoryError(null);
    setSkillNameError(undefined);
    setSuggestion(null);
    setVideoErrors({});
  };

  const handleSuggestCategory = async () => {
    setSubmitError(null);
    setCategoryError(null);

    const parsed = videoClassificationSchema.safeParse({
      title: videoForm.title,
      description: videoForm.description,
      transcript: videoForm.transcript,
    });

    if (!parsed.success) {
      const nextErrors = mapVideoErrors(videoForm);
      setVideoErrors(nextErrors);
      return;
    }

    setIsSuggesting(true);

    try {
      const response = await fetch("/api/skills/classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "分类失败，请稍后再试");
      }

      setSelectedCategory(data.category);
      if (!skillNameDirty) {
        setSkillName(suggestSkillName(videoForm.title, data.category));
      }
      setSuggestion(data as CategorySuggestion);
      setCategoryError(null);
    } catch (error) {
      setCategoryError(
        error instanceof Error ? error.message : "分类失败，请稍后再试"
      );
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleGenerate = async () => {
    setSubmitError(null);
    setCategoryError(null);
    setSkillNameError(undefined);

    const parsedVideo = videoInputSchema.safeParse({
      ...videoForm,
      duration: extractedDuration,
    });

    if (!parsedVideo.success) {
      setVideoErrors(mapVideoErrors(videoForm));
      return;
    }

    setVideoErrors({});

    if (!selectedCategory) {
      setCategoryError("请先选择一个分类，或者点「AI 帮我选」。");
      return;
    }

    const nextSkillName = skillName.trim();
    if (nextSkillName) {
      const { validateSkillName } = await import("@/lib/skillTemplate");
      const validation = validateSkillName(nextSkillName);
      if (!validation.valid) {
        setSkillNameError(validation.error);
        return;
      }
    }

    setIsGenerating(true);

    try {
      const response = await fetch("/api/skills/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: selectedCategory,
          videos: [parsedVideo.data],
          skillName: nextSkillName || undefined,
          skillDescription: skillDescription.trim() || undefined,
          mode: "default",
        }),
      });
      const data = (await response.json()) as GenerateSkillResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || "生成 Skill 失败，请稍后再试");
      }

      setGeneratedSkill(data);
      setSuggestion(null);
      if (!skillNameDirty && data.skillName) {
        setSkillName(data.skillName);
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "生成 Skill 失败，请稍后再试"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="min-h-screen px-4 py-6 md:px-6 md:py-8"
      style={{
        background:
          "linear-gradient(180deg, #C8E6F5 0%, #D5EDF7 52%, #E8F5FA 100%)",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-sm font-medium text-[#2C2C2C] shadow-[0_12px_24px_rgba(113,151,167,0.12)] backdrop-blur"
            >
              <span>←</span>
              <span>返回</span>
            </Link>
            <h1 className="mt-4 text-[30px] font-semibold text-[#1A1A1A] md:text-[36px]">
              创建你的 Skill
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[#50636F]">
              把标题、简介和字幕整理成一份可直接下载的 SKILL.md。未配置
              AI Key 时，会自动切换到 Mock 模式生成。
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.82fr)]">
          <div className="space-y-6">
            <ModeSwitch value={mode} onChange={handleModeChange} />
            {mode === "url" ? (
              <UrlExtractor onExtracted={handleExtracted} />
            ) : null}
            {subtitleMeta?.source === "auto" ? (
              <div className="rounded-[20px] border border-[#F1D48A] bg-[#FFF7D8] px-4 py-3 text-sm text-[#8A6420]">
                当前为 AI 生成字幕，可能有错字。建议在生成 Skill 前先人工检查一遍。
              </div>
            ) : null}
            <VideoForm
              value={videoForm}
              errors={videoErrors}
              onChange={handleVideoChange}
            />
            <CategoryPicker
              categories={categories}
              value={selectedCategory}
              onChange={(value) => {
                setSelectedCategory(value);
                if (!skillNameDirty) {
                  setSkillName(suggestSkillName(videoForm.title, value));
                }
                setCategoryError(null);
                setSuggestion(null);
              }}
              onSuggest={handleSuggestCategory}
              isSuggesting={isSuggesting}
              suggestDisabled={!canAskAI || isGenerating}
              suggestDisabledReason={
                isGenerating ? "生成中..." : suggestDisabledReason
              }
              suggestion={suggestion}
              error={categoryError}
            />
          </div>

          <div className="space-y-6">
            <SkillConfig
              skillName={skillName}
              skillDescription={skillDescription}
              skillNameError={skillNameError}
              onSkillNameChange={(value) => {
                setSkillNameDirty(true);
                setSkillName(value);
                setSkillNameError(undefined);
                setSubmitError(null);
              }}
              onSkillDescriptionChange={(value) => {
                setSkillDescription(value);
                setSubmitError(null);
              }}
            />

            <section className="rounded-[24px] bg-white/80 p-5 shadow-[0_20px_50px_rgba(113,151,167,0.16)] backdrop-blur md:p-6">
              <h2 className="text-lg font-semibold text-[#1A1A1A]">
                生成前检查
              </h2>
              <ul className="mt-4 space-y-2 text-sm leading-7 text-[#50636F]">
                <li>• 字幕建议至少 {MIN_TRANSCRIPT_LENGTH} 字</li>
                <li>
                  • 分类必须选择 1 个，AI 帮我选会返回置信度和判断理由
                </li>
                <li>• 下载后可直接得到本地可用的 SKILL.md</li>
              </ul>

              {submitError ? (
                <div className="mt-4 rounded-2xl bg-[#FFF1F1] px-4 py-3 text-sm text-[#B65252]">
                  {submitError}
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="mt-5 w-full rounded-full bg-[#2C2C2C] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(44,44,44,0.2)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? "生成中..." : "生成 Skill"}
              </button>
            </section>
          </div>
        </div>
      </div>

      <GeneratedSkillModal
        isOpen={!!generatedSkill}
        result={generatedSkill}
        onClose={() => setGeneratedSkill(null)}
      />
    </div>
  );
}
