"use client";

interface SkillConfigProps {
  skillName: string;
  skillDescription: string;
  skillNameError?: string;
  onSkillNameChange: (value: string) => void;
  onSkillDescriptionChange: (value: string) => void;
}

const inputClassName =
  "w-full rounded-2xl border border-[#D6E5EC] bg-white px-4 py-3 text-sm text-[#1A1A1A] outline-none transition placeholder:text-[#94A7B2] focus:border-[#8CB7CA] focus:ring-2 focus:ring-[#C8E6F5]";

export default function SkillConfig({
  skillName,
  skillDescription,
  skillNameError,
  onSkillNameChange,
  onSkillDescriptionChange,
}: SkillConfigProps) {
  return (
    <section className="rounded-[24px] bg-white/80 p-5 shadow-[0_20px_50px_rgba(113,151,167,0.16)] backdrop-blur md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-[#1A1A1A]">Skill 配置</h2>
        <p className="mt-1 text-sm text-[#5F6F7A]">
          名称会用于文件夹路径，描述会写进生成的 SKILL.md。
        </p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#31444F]">
            Skill 名称
          </span>
          <input
            type="text"
            value={skillName}
            onChange={(event) => onSkillNameChange(event.target.value)}
            className={inputClassName}
            placeholder="例如：ai-agent-workflow-skill"
          />
          <div className="mt-2 text-xs text-[#738792]">
            使用 kebab-case，可包含中文。
            {skillName ? (
              <span className="block truncate text-[#58707D]">
                生成路径：.claude/skills/{skillName}/SKILL.md
              </span>
            ) : null}
          </div>
          {skillNameError ? (
            <span className="mt-2 block text-xs text-[#D35B5B]">
              {skillNameError}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#31444F]">
            Skill 描述
          </span>
          <textarea
            value={skillDescription}
            onChange={(event) => onSkillDescriptionChange(event.target.value)}
            className={`${inputClassName} min-h-[120px] resize-y`}
            placeholder="补一句你希望这个 Skill 更侧重什么，例如偏实操、偏知识梳理、偏模板化输出。"
          />
        </label>
      </div>
    </section>
  );
}
