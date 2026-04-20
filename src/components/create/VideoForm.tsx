"use client";

import { useState } from "react";
import {
  MAX_TAG_COUNT,
  MAX_TAG_LENGTH,
  MIN_TRANSCRIPT_LENGTH,
} from "@/lib/validators/videoInput";

export interface VideoFormValue {
  title: string;
  author: string;
  description: string;
  transcript: string;
  tags: string[];
  url: string;
}

export type VideoFormErrors = Partial<Record<keyof VideoFormValue, string>>;

interface VideoFormProps {
  value: VideoFormValue;
  errors?: VideoFormErrors;
  onChange: (value: VideoFormValue) => void;
}

const inputClassName =
  "w-full rounded-2xl border border-[#D6E5EC] bg-white px-4 py-3 text-sm text-[#1A1A1A] outline-none transition placeholder:text-[#94A7B2] focus:border-[#8CB7CA] focus:ring-2 focus:ring-[#C8E6F5]";

export default function VideoForm({
  value,
  errors,
  onChange,
}: VideoFormProps) {
  const [pendingTag, setPendingTag] = useState("");
  const transcriptLength = value.transcript.trim().length;

  const setField = <T extends keyof VideoFormValue>(
    field: T,
    fieldValue: VideoFormValue[T]
  ) => {
    onChange({
      ...value,
      [field]: fieldValue,
    });
  };

  const addTag = () => {
    const nextTag = pendingTag.trim();
    if (!nextTag || value.tags.includes(nextTag)) {
      setPendingTag("");
      return;
    }

    if (value.tags.length >= MAX_TAG_COUNT) {
      return;
    }

    setField("tags", [...value.tags, nextTag]);
    setPendingTag("");
  };

  const removeTag = (tag: string) => {
    setField(
      "tags",
      value.tags.filter((item) => item !== tag)
    );
  };

  return (
    <section className="rounded-[24px] bg-white/80 p-5 shadow-[0_20px_50px_rgba(113,151,167,0.16)] backdrop-blur md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-[#1A1A1A]">视频信息</h2>
        <p className="mt-1 text-sm text-[#5F6F7A]">
          填写得越完整，生成出来的 Skill 越稳定。
        </p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#31444F]">
            标题 <span className="text-[#E86A6A]">*</span>
          </span>
          <input
            type="text"
            value={value.title}
            onChange={(event) => setField("title", event.target.value)}
            className={inputClassName}
            placeholder="例如：AI Agent 工作流实战"
          />
          {errors?.title ? (
            <span className="mt-2 block text-xs text-[#D35B5B]">
              {errors.title}
            </span>
          ) : null}
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#31444F]">
              作者
            </span>
            <input
              type="text"
              value={value.author}
              onChange={(event) => setField("author", event.target.value)}
              className={inputClassName}
              placeholder="例如：某某 UP 主"
            />
            {errors?.author ? (
              <span className="mt-2 block text-xs text-[#D35B5B]">
                {errors.author}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#31444F]">
              来源链接
            </span>
            <input
              type="url"
              value={value.url}
              onChange={(event) => setField("url", event.target.value)}
              className={inputClassName}
              placeholder="https://..."
            />
            {errors?.url ? (
              <span className="mt-2 block text-xs text-[#D35B5B]">
                {errors.url}
              </span>
            ) : null}
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#31444F]">
            简介
          </span>
          <textarea
            value={value.description}
            onChange={(event) => setField("description", event.target.value)}
            className={`${inputClassName} min-h-[112px] resize-y`}
            placeholder="贴视频简介、内容提要，或者你觉得有帮助的上下文。"
          />
          {errors?.description ? (
            <span className="mt-2 block text-xs text-[#D35B5B]">
              {errors.description}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#31444F]">
            字幕 / 文字稿 <span className="text-[#E86A6A]">*</span>
          </span>
          <textarea
            value={value.transcript}
            onChange={(event) => setField("transcript", event.target.value)}
            className={`${inputClassName} min-h-[240px] resize-y`}
            placeholder="请粘贴完整字幕、逐字稿，或你整理过的长文本材料。"
          />
          <div className="mt-2 flex items-center justify-between gap-3 text-xs">
            <span
              className={
                transcriptLength >= MIN_TRANSCRIPT_LENGTH
                  ? "text-[#4F7A67]"
                  : "text-[#A7793C]"
              }
            >
              {transcriptLength >= MIN_TRANSCRIPT_LENGTH
                ? "内容长度足够，可以稳定生成。"
                : `至少需要 ${MIN_TRANSCRIPT_LENGTH} 字，太短会影响生成质量。`}
            </span>
            <span className="text-[#738792]">{transcriptLength} 字</span>
          </div>
          {errors?.transcript ? (
            <span className="mt-2 block text-xs text-[#D35B5B]">
              {errors.transcript}
            </span>
          ) : null}
        </label>

        <div>
          <span className="mb-2 block text-sm font-medium text-[#31444F]">
            标签
          </span>
          <div className="flex flex-wrap gap-2">
            {value.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => removeTag(tag)}
                className="inline-flex items-center gap-2 rounded-full bg-[#EAF6FB] px-3 py-1.5 text-xs font-medium text-[#315262]"
              >
                <span>{tag}</span>
                <span className="text-[#6B8796]">×</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={pendingTag}
              onChange={(event) => setPendingTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addTag();
                }
              }}
              onBlur={() => {
                if (pendingTag.trim()) {
                  addTag();
                }
              }}
              className={inputClassName}
              placeholder={`输入标签后按回车，最多 ${MAX_TAG_COUNT} 个`}
              maxLength={MAX_TAG_LENGTH}
            />
            <button
              type="button"
              onClick={addTag}
              className="shrink-0 rounded-2xl bg-[#2C2C2C] px-4 text-sm font-medium text-white"
            >
              添加
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-[#738792]">
            <span>单个标签最多 {MAX_TAG_LENGTH} 个字。</span>
            <span>
              {value.tags.length}/{MAX_TAG_COUNT}
            </span>
          </div>

          {errors?.tags ? (
            <span className="mt-2 block text-xs text-[#D35B5B]">
              {errors.tags}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
