"use client";

import { useState } from "react";

export interface UrlExtractorResult {
  success: true;
  video: {
    title: string;
    author?: string;
    description?: string;
    transcript: string;
    tags: string[];
    duration?: number;
    platform: string;
    url: string;
    thumbnailUrl?: string;
  };
  meta: {
    subtitleSource: "manual" | "auto";
    language: string;
    isAuto: boolean;
    charCount: number;
  };
}

interface UrlExtractorError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

interface UrlExtractorProps {
  onExtracted: (result: UrlExtractorResult) => void;
}

const inputClassName =
  "w-full rounded-2xl border border-[#D6E5EC] bg-white px-4 py-3 text-sm text-[#1A1A1A] outline-none transition placeholder:text-[#94A7B2] focus:border-[#8CB7CA] focus:ring-2 focus:ring-[#C8E6F5]";

export default function UrlExtractor({ onExtracted }: UrlExtractorProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExtract = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("请先粘贴一个 Bilibili 或 YouTube 视频链接。");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/videos/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: trimmedUrl,
        }),
      });

      const data = (await response.json()) as UrlExtractorResult | UrlExtractorError;
      if (!response.ok || !data.success) {
        throw new Error(
          data.success ? "抓取失败，请稍后再试。" : data.error.message
        );
      }

      onExtracted(data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "抓取失败，请稍后再试。"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-[24px] bg-white/80 p-5 shadow-[0_20px_50px_rgba(113,151,167,0.16)] backdrop-blur md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-[#1A1A1A]">视频链接抓取</h2>
        <p className="mt-1 text-sm text-[#5F6F7A]">
          当前支持 Bilibili 和 YouTube。系统会自动抓标题、简介、标签和字幕，不下载视频本体。
        </p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <input
          type="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !loading) {
              event.preventDefault();
              void handleExtract();
            }
          }}
          className={inputClassName}
          placeholder="https://www.bilibili.com/video/BVxxx 或 https://www.youtube.com/watch?v=xxx"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => void handleExtract()}
          disabled={loading}
          className="shrink-0 rounded-full bg-[#2C2C2C] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(44,44,44,0.2)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "抓取中..." : "抓取视频信息"}
        </button>
      </div>

      <div className="mt-3 text-xs leading-6 text-[#738792]">
        常见耗时 5 到 30 秒。受限内容可在 .env.local 配置
        `BILIBILI_COOKIES` 或 `YOUTUBE_COOKIES`。
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl bg-[#FFF1F1] px-4 py-3 text-sm text-[#B65252]">
          {error}
        </div>
      ) : null}
    </section>
  );
}
