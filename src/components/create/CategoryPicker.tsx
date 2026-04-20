"use client";

import Image from "next/image";
import type { CategoryId } from "@/types/index";

interface CategoryItem {
  id: CategoryId;
  name: string;
  description: string;
  color: string;
  colorDark?: string;
  icon?: string;
}

export interface CategorySuggestion {
  category: CategoryId;
  confidence: number;
  reason: string;
}

interface CategoryPickerProps {
  categories: CategoryItem[];
  value?: CategoryId;
  onChange: (value: CategoryId) => void;
  onSuggest: () => void;
  isSuggesting?: boolean;
  suggestDisabled?: boolean;
  suggestDisabledReason?: string | null;
  suggestion?: CategorySuggestion | null;
  error?: string | null;
}

export default function CategoryPicker({
  categories,
  value,
  onChange,
  onSuggest,
  isSuggesting = false,
  suggestDisabled = false,
  suggestDisabledReason,
  suggestion,
  error,
}: CategoryPickerProps) {
  return (
    <section className="rounded-[24px] bg-white/80 p-5 shadow-[0_20px_50px_rgba(113,151,167,0.16)] backdrop-blur md:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#1A1A1A]">分类</h2>
          <p className="mt-1 text-sm text-[#5F6F7A]">
            先选一个主领域，生成时会沿着这个方向提炼 Skill。
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={onSuggest}
            disabled={suggestDisabled || isSuggesting}
            title={
              suggestDisabled && suggestDisabledReason
                ? suggestDisabledReason
                : undefined
            }
            className="rounded-full border border-[#C7DDE6] bg-white px-4 py-2 text-sm font-medium text-[#2C2C2C] transition hover:border-[#9FBAC7] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSuggesting ? "AI 识别中..." : "AI 帮我选"}
          </button>
          {suggestDisabled && suggestDisabledReason ? (
            <p className="max-w-[180px] text-right text-[11px] leading-4 text-[#8196A3]">
              {suggestDisabledReason}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {categories.map((category) => {
          const selected = category.id === value;

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onChange(category.id)}
              className="rounded-[22px] border p-3 text-left transition"
              style={{
                background: selected
                  ? category.colorDark ?? category.color
                  : category.color,
                borderColor: selected
                  ? "#2C2C2C"
                  : "rgba(255,255,255,0.7)",
                boxShadow: selected
                  ? "0 12px 24px rgba(44,44,44,0.12)"
                  : "0 8px 18px rgba(113,151,167,0.10)",
              }}
            >
              <div className="flex items-center gap-3">
                {category.icon ? (
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-white/70">
                    <Image
                      src={category.icon}
                      alt={category.name}
                      fill
                      className="object-contain p-1"
                    />
                  </div>
                ) : null}

                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#1A1A1A]">
                    {category.name}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-[#415660]">
                    {category.description}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {suggestion ? (
        <div className="mt-4 rounded-2xl bg-[#F3FAFD] px-4 py-3 text-sm text-[#29414C]">
          <div className="font-medium">
            AI 建议选择「
            {categories.find((category) => category.id === suggestion.category)
              ?.name ?? suggestion.category}
            」
            <span className="ml-2 text-xs text-[#6B7E89]">
              置信度 {Math.round(suggestion.confidence * 100)}%
            </span>
          </div>
          <div className="mt-1 text-xs leading-6 text-[#56707E]">
            {suggestion.reason}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl bg-[#FFF1F1] px-4 py-3 text-sm text-[#B65252]">
          {error}
        </div>
      ) : null}
    </section>
  );
}
