"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORIES } from "@/config/categories";
import CategoryPicker from "@/components/create/CategoryPicker";
import GeneratedSkillModal from "@/components/create/GeneratedSkillModal";
import SkillConfig from "@/components/create/SkillConfig";
import BatchUrlList from "@/components/batch/BatchUrlList";
import BatchExtractionProgress from "@/components/batch/BatchExtractionProgress";
import BatchVideoPreview from "@/components/batch/BatchVideoPreview";
import IntentField from "@/components/batch/IntentField";
import { validateSkillName } from "@/lib/skillName";
import type { BatchItem, BatchResult } from "@/lib/batch/types";
import type { CategoryId, GenerateSkillResponse } from "@/types/index";

type Phase = "idle" | "extracting" | "ready" | "generating" | "done";

function suggestSkillName(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!base) return "";
  return base.endsWith("-skill") ? base : `${base}-skill`;
}

export default function BatchPage() {
  const [urls, setUrls] = useState<string[]>([""]);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [intent, setIntent] = useState("");
  const [category, setCategory] = useState<CategoryId>();
  const [skillName, setSkillName] = useState("");
  const [skillNameError, setSkillNameError] = useState<string>();
  const [skillDescription, setSkillDescription] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateSkillResponse | null>(null);

  const successItems = useMemo(
    () => items.filter((i) => i.status === "done" && i.result),
    [items]
  );

  const runExtract = async () => {
    const cleaned = urls.map((u) => u.trim()).filter((u) => u.length > 0);
    if (cleaned.length === 0) {
      setError("至少填一个视频链接");
      return;
    }
    setError(null);
    setResult(null);
    setPhase("extracting");
    setItems(cleaned.map((url) => ({ url, status: "pending" })));
    try {
      const res = await fetch("/api/videos/batch-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "批量抽取失败");
      }
      const batch = data as BatchResult;
      setItems(batch.items);
      if (batch.successCount === 0) {
        setError("所有视频都抽取失败，检查链接或代理配置");
        setPhase("idle");
        return;
      }
      const firstTitle = batch.items.find((i) => i.result)?.result?.title ?? "";
      if (!skillName) setSkillName(suggestSkillName(firstTitle));
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
      setPhase("idle");
    }
  };

  const runGenerate = async () => {
    if (!category) {
      setError("请选择一个分类");
      return;
    }
    const nameCheck = validateSkillName(skillName);
    if (!nameCheck.valid) {
      setSkillNameError(nameCheck.error);
      return;
    }
    setSkillNameError(undefined);
    setError(null);
    setPhase("generating");
    try {
      const payload = {
        videos: successItems.map((it, i) => ({
          id: `v${i + 1}`,
          title: it.result!.title,
          author: it.result!.author ?? "",
          description: it.result!.description ?? "",
          transcript: it.result!.transcript,
          tags: it.result!.tags ?? [],
          url: it.result!.url,
        })),
        intent,
        category,
        skillName,
        skillDescription,
      };
      const res = await fetch("/api/skills/batch-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "生成失败");
      }
      setResult(data as GenerateSkillResponse);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
      setPhase("ready");
    }
  };

  const interacting = phase === "extracting" || phase === "generating";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-10 md:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1A1A] md:text-3xl">
            批量生成 Skill
          </h1>
          <p className="mt-1 text-sm text-[#5F6F7A]">
            多视频 → 按你的学习意图跨视频检索 → 一份 SKILL.md。
          </p>
        </div>
        <Link
          href="/create"
          className="shrink-0 self-start rounded-full border border-[#D6E5EC] bg-white px-3 py-2 text-xs text-[#5F6F7A] hover:border-[#9FBAC7]"
        >
          单视频模式
        </Link>
      </header>

      <BatchUrlList urls={urls} onChange={setUrls} disabled={interacting} />

      {phase === "idle" || phase === "extracting" ? (
        <button
          type="button"
          onClick={runExtract}
          disabled={phase === "extracting"}
          className="self-start rounded-full bg-[#2C2C2C] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(44,44,44,0.2)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase === "extracting" ? "抓取中..." : "抓取所有视频"}
        </button>
      ) : null}

      {items.length > 0 ? <BatchExtractionProgress items={items} /> : null}
      {successItems.length > 0 ? <BatchVideoPreview items={items} /> : null}

      {phase === "ready" || phase === "generating" || phase === "done" ? (
        <>
          <IntentField value={intent} onChange={setIntent} disabled={interacting} />
          <CategoryPicker
            categories={CATEGORIES}
            value={category}
            onChange={(c) => setCategory(c)}
            onSuggest={() => {
              setError("批量场景暂不支持 AI 自动分类，请手动选择。");
            }}
            suggestDisabled
            suggestDisabledReason="批量场景下 AI 自动分类暂未支持"
          />
          <SkillConfig
            skillName={skillName}
            skillDescription={skillDescription}
            skillNameError={skillNameError}
            onSkillNameChange={(v) => {
              setSkillName(v);
              if (skillNameError) setSkillNameError(undefined);
            }}
            onSkillDescriptionChange={setSkillDescription}
          />
          <button
            type="button"
            onClick={runGenerate}
            disabled={interacting || !category}
            className="self-start rounded-full bg-[#2C2C2C] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(44,44,44,0.2)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === "generating" ? "生成中..." : "生成 Skill"}
          </button>
        </>
      ) : null}

      {error ? (
        <div className="rounded-2xl bg-[#FFF1F1] px-4 py-3 text-sm text-[#B65252]">
          {error}
        </div>
      ) : null}

      <GeneratedSkillModal
        isOpen={phase === "done" && result !== null}
        result={result}
        onClose={() => {
          setResult(null);
          setPhase("ready");
        }}
      />
    </main>
  );
}
