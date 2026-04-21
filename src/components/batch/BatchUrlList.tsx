"use client";

import { MAX_BATCH_URLS } from "@/lib/validators/videoInput";

interface BatchUrlListProps {
  urls: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
}

export default function BatchUrlList({ urls, onChange, disabled }: BatchUrlListProps) {
  const updateAt = (i: number, val: string) => {
    const next = [...urls];
    next[i] = val;
    onChange(next);
  };
  const removeAt = (i: number) => {
    const next = urls.filter((_, idx) => idx !== i);
    onChange(next.length > 0 ? next : [""]);
  };
  const addRow = () => {
    if (urls.length >= MAX_BATCH_URLS) return;
    onChange([...urls, ""]);
  };

  return (
    <section className="rounded-[24px] bg-white/80 p-5 shadow-[0_20px_50px_rgba(113,151,167,0.16)] backdrop-blur md:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[#1A1A1A]">
          视频链接（1 - {MAX_BATCH_URLS} 个）
        </h2>
        <p className="mt-1 text-sm text-[#5F6F7A]">
          推荐 YouTube；Bilibili 仅部分支持（硬字幕无法抓取）。
        </p>
      </div>
      <div className="space-y-3">
        {urls.map((url, i) => (
          <div key={i} className="flex gap-2">
            <span className="shrink-0 self-center text-xs text-[#94A7B2] w-6">
              {i + 1}
            </span>
            <input
              type="url"
              value={url}
              onChange={(e) => updateAt(i, e.target.value)}
              disabled={disabled}
              className="w-full rounded-2xl border border-[#D6E5EC] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8CB7CA] focus:ring-2 focus:ring-[#C8E6F5] disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="https://www.youtube.com/watch?v=..."
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => removeAt(i)}
              disabled={disabled || urls.length <= 1}
              className="shrink-0 rounded-full border border-[#D6E5EC] px-3 py-2 text-xs text-[#5F6F7A] transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              删除
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        disabled={disabled || urls.length >= MAX_BATCH_URLS}
        className="mt-4 rounded-full border border-dashed border-[#B3CEDB] px-4 py-2 text-xs text-[#2C2C2C] transition disabled:cursor-not-allowed disabled:opacity-40"
      >
        + 添加一行（当前 {urls.length}/{MAX_BATCH_URLS}）
      </button>
    </section>
  );
}
