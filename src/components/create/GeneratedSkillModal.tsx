"use client";

import { useEffect, useState } from "react";
import type { GenerateSkillResponse } from "@/types/index";

interface GeneratedSkillModalProps {
  isOpen: boolean;
  result: GenerateSkillResponse | null;
  onClose: () => void;
}

function downloadSkillFile(result: GenerateSkillResponse) {
  if (!result.skillContent) {
    return;
  }

  const blob = new Blob([result.skillContent], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "SKILL.md";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function GeneratedSkillModal({
  isOpen,
  result,
  onClose,
}: GeneratedSkillModalProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle"
  );

  useEffect(() => {
    if (!isOpen) {
      setCopyState("idle");
    }
  }, [isOpen]);

  if (!isOpen || !result) {
    return null;
  }

  const handleCopy = async () => {
    if (!result.skillContent) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.skillContent);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  const skill = result.skill;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] bg-[#F8FCFE] shadow-[0_30px_80px_rgba(29,52,63,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#DDEAF0] px-5 py-4 md:px-6">
          <div>
            <div className="text-lg font-semibold text-[#1A1A1A]">
              ✨ Skill 已生成
            </div>
            <div className="mt-1 text-sm text-[#61727C]">
              {skill?.displayName ?? result.skillName}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white px-3 py-1.5 text-sm text-[#50636E]"
          >
            关闭
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 md:px-6">
          <div className="flex flex-wrap gap-2">
            {result.mockMode ? (
              <span className="rounded-full bg-[#FFF3DF] px-3 py-1 text-xs text-[#A26A21]">
                当前为 Mock 模式
              </span>
            ) : null}
            {result.truncated ? (
              <span className="rounded-full bg-[#EEF7FF] px-3 py-1 text-xs text-[#4A7A9A]">
                字幕已按 10k 字截断
              </span>
            ) : null}
          </div>

          {skill ? (
            <div className="mt-5 space-y-5">
              <section className="rounded-[20px] bg-white px-4 py-4 shadow-[0_12px_24px_rgba(113,151,167,0.12)]">
                <div className="text-sm font-semibold text-[#2E434F]">
                  展示名称
                </div>
                <div className="mt-2 text-2xl font-semibold text-[#1A1A1A]">
                  {skill.displayName}
                </div>
                <div className="mt-2 text-sm leading-7 text-[#566C78]">
                  {skill.description}
                </div>
              </section>

              <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-[20px] bg-white px-4 py-4 shadow-[0_12px_24px_rgba(113,151,167,0.12)]">
                  <div className="text-sm font-semibold text-[#2E434F]">
                    使用场景
                  </div>
                  <ul className="mt-3 space-y-2 text-sm leading-7 text-[#50636F]">
                    {skill.useCases.map((useCase) => (
                      <li key={useCase}>• {useCase}</li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-[20px] bg-white px-4 py-4 shadow-[0_12px_24px_rgba(113,151,167,0.12)]">
                  <div className="text-sm font-semibold text-[#2E434F]">
                    核心能力
                  </div>
                  <ul className="mt-3 space-y-2 text-sm leading-7 text-[#50636F]">
                    {skill.capabilities.map((capability) => (
                      <li key={capability}>• {capability}</li>
                    ))}
                  </ul>
                </section>
              </div>

              <section className="rounded-[20px] bg-white px-4 py-4 shadow-[0_12px_24px_rgba(113,151,167,0.12)]">
                <div className="text-sm font-semibold text-[#2E434F]">
                  使用示例
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  {skill.examples.map((example, index) => (
                    <article
                      key={`${example.userInput}-${index}`}
                      className="rounded-2xl bg-[#F6FBFD] px-4 py-4"
                    >
                      <div className="text-xs font-medium text-[#7A919D]">
                        示例 {index + 1}
                      </div>
                      <div className="mt-3 text-sm font-medium text-[#28414E]">
                        用户
                      </div>
                      <div className="mt-1 text-sm leading-7 text-[#4D646F]">
                        {example.userInput}
                      </div>
                      <div className="mt-3 text-sm font-medium text-[#28414E]">
                        助手
                      </div>
                      <div className="mt-1 text-sm leading-7 text-[#4D646F]">
                        {example.assistantOutput}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-[20px] bg-white px-4 py-4 shadow-[0_12px_24px_rgba(113,151,167,0.12)]">
                <div className="text-sm font-semibold text-[#2E434F]">
                  约束条件
                </div>
                <ul className="mt-3 space-y-2 text-sm leading-7 text-[#50636F]">
                  {skill.constraints.map((constraint) => (
                    <li key={constraint}>• {constraint}</li>
                  ))}
                </ul>
              </section>

              <section className="rounded-[20px] bg-white px-4 py-4 shadow-[0_12px_24px_rgba(113,151,167,0.12)]">
                <div className="text-sm font-semibold text-[#2E434F]">
                  核心指令
                </div>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#50636F]">
                  {skill.instructions}
                </div>
              </section>
            </div>
          ) : null}

          <section className="mt-5 rounded-[20px] bg-[#1E2A31] px-4 py-4 text-white shadow-[0_12px_24px_rgba(19,31,38,0.2)]">
            <div className="text-sm font-semibold">SKILL.md 预览</div>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-white/90">
              {result.skillContent}
            </pre>
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t border-[#DDEAF0] bg-white px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="text-xs text-[#738792]">
            {copyState === "copied"
              ? "已复制到剪贴板"
              : copyState === "error"
                ? "复制失败，请手动复制预览内容"
                : result.skillPath}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-full border border-[#CCDDE6] px-4 py-2.5 text-sm font-medium text-[#2C2C2C]"
            >
              复制 Markdown
            </button>
            <button
              type="button"
              onClick={() => downloadSkillFile(result)}
              className="rounded-full bg-[#2C2C2C] px-5 py-2.5 text-sm font-medium text-white"
            >
              下载 SKILL.md
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
