"use client";

export type CreateMode = "text" | "url";

interface ModeSwitchProps {
  value: CreateMode;
  onChange: (value: CreateMode) => void;
}

export default function ModeSwitch({ value, onChange }: ModeSwitchProps) {
  return (
    <section className="rounded-[24px] bg-white/80 p-5 shadow-[0_20px_50px_rgba(113,151,167,0.16)] backdrop-blur md:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[#1A1A1A]">输入模式</h2>
        <p className="mt-1 text-sm text-[#5F6F7A]">
          支持手动整理，也支持直接贴 Bilibili 链接自动抓取。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange("text")}
          className={`rounded-2xl border px-4 py-4 text-left transition ${
            value === "text"
              ? "border-[#2C2C2C] bg-[#2C2C2C] text-white"
              : "border-[#D4E4EC] bg-white text-[#1A1A1A] hover:border-[#B7CCD7]"
          }`}
        >
          <div className="text-sm font-semibold">手动填写</div>
          <div
            className={`mt-1 text-xs ${
              value === "text" ? "text-white/80" : "text-[#6B7C86]"
            }`}
          >
            当前可用，直接粘贴视频资料生成 Skill。
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChange("url")}
          className={`rounded-2xl border px-4 py-4 text-left transition ${
            value === "url"
              ? "border-[#2C2C2C] bg-[#2C2C2C] text-white"
              : "border-[#D4E4EC] bg-white text-[#1A1A1A] hover:border-[#B7CCD7]"
          }`}
        >
          <div className="text-sm font-semibold">贴视频链接</div>
          <div
            className={`mt-1 text-xs ${
              value === "url" ? "text-white/80" : "text-[#6B7C86]"
            }`}
          >
            自动抓取标题、简介、标签和字幕，再继续编辑。
          </div>
        </button>
      </div>
    </section>
  );
}
