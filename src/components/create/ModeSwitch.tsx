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
          Phase A 先支持手动整理标题、简介和字幕。
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
          disabled
          title="Phase B 功能，即将上线"
          className="cursor-not-allowed rounded-2xl border border-dashed border-[#D4E4EC] bg-[#F5FAFD] px-4 py-4 text-left text-[#90A4AE]"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>贴视频链接</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-[#7E93A0]">
              即将上线
            </span>
          </div>
          <div className="mt-1 text-xs text-[#8AA0AD]">
            Phase B 功能，即将上线
          </div>
        </button>
      </div>
    </section>
  );
}
