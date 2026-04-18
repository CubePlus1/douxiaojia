# FavToSkill - Skill 生成功能设计

> 版本：1.0.0 | 日期：2026-04-18

---

## 一、功能概述

将用户收藏的短视频内容**自动提炼为 Claude Code Skill**，使用户能够通过 `/xxx-skill` 命令直接调用这些知识。

### 核心价值

- **知识资产化**：收藏不再是"看过就忘"，而是转化为可复用的 AI 技能
- **个性化学习**：基于用户实际收藏内容生成的 Skill，比通用 Skill 更贴合用户需求
- **无缝集成**：生成的 Skill 符合 Claude Code 规范，可直接在 `.claude/skills/` 目录下使用

---

## 二、用户交互流程

### 2.1 主页 → 领域详情页

用户在主页点击某个领域卡片（如"美食"），路由跳转至：

```
/category/美食
```

### 2.2 领域详情页布局

```
┌──────────────────────────────────────────────────────────┐
│  [← 返回]  美食  (12 个视频)             [💬 打开对话]    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────┐  ┌─────────────────┐               │
│  │ 视频卡片 1       │  │ 视频卡片 2       │               │
│  │ □ 选中          │  │ ☑ 选中          │               │
│  └─────────────────┘  └─────────────────┘               │
│                                                          │
│  ┌─────────────────┐  ┌─────────────────┐               │
│  │ 视频卡片 3       │  │ 视频卡片 4       │               │
│  └─────────────────┘  └─────────────────┘               │
│                                                          │
│  [🧠 AI 总结本领域]  [✨ 生成 Skill]                      │
└──────────────────────────────────────────────────────────┘
```

### 2.3 Skill 生成流程

```
用户点击「生成 Skill」
  ↓
弹出配置面板
  ├─ Skill 名称（自动建议：基于领域名）
  ├─ Skill 描述
  ├─ 选择视频范围（全部 / 手动勾选）
  └─ 生成方式（默认 / 高级定制）
  ↓
后台调用 AI 提炼 Skill
  ├─ 读取选中视频的 title + description + tags
  ├─ LLM 提炼核心知识点
  ├─ 生成符合 Claude Code 规范的 SKILL.md
  └─ 可选：生成示例对话、约束条件
  ↓
Skill 文件生成
  ├─ 保存至 .claude/skills/[skill-name]/SKILL.md
  ├─ 自动注册（修改配置文件）
  └─ 展示成功通知 + 使用示例
```

---

## 三、技术实现

### 3.1 API 端点设计

#### 3.1.1 生成 Skill

**POST** `/api/skills/generate`

**请求体：**
```typescript
interface GenerateSkillRequest {
  category: string;          // 领域名称，如"美食"
  videoIds: string[];        // 选中的视频 ID 列表
  skillName?: string;        // Skill 名称（可选，自动生成）
  skillDescription?: string; // Skill 描述（可选）
  mode: 'default' | 'advanced'; // 生成模式
}
```

**响应：**
```typescript
interface GenerateSkillResponse {
  success: boolean;
  skillPath: string;         // 生成的 Skill 文件路径
  skillName: string;         // 最终 Skill 名称
  previewContent: string;    // SKILL.md 预览内容
  usageExample: string;      // 使用示例，如 "/美食写作"
}
```

#### 3.1.2 Skill 预览

**POST** `/api/skills/preview`

在用户最终确认前，先生成预览版本，让用户确认内容。

---

### 3.2 Skill 生成 Prompt

使用 Vercel AI SDK 的 `generateObject` 确保输出结构化：

```typescript
import { generateObject } from 'ai';
import { z } from 'zod';

const SkillSchema = z.object({
  name: z.string().describe('Skill 名称，使用 kebab-case，如 cooking-style-writing'),
  displayName: z.string().describe('展示名称，如"美食写作技巧"'),
  description: z.string().describe('一句话描述 Skill 的功能'),
  trigger: z.string().describe('触发词，如"教你写美食文案"'),
  instructions: z.string().describe('Skill 的核心指令，告诉 AI 应该如何表现'),
  examples: z.array(z.string()).describe('3 个使用示例'),
  constraints: z.array(z.string()).describe('约束条件，如"不使用过度夸张的形容词"'),
});

export async function generateSkillContent(videos: Video[], category: string) {
  const videoSummaries = videos.map(v =>
    `标题：${v.title}\n描述：${v.description}\n标签：${v.tags.join(', ')}`
  ).join('\n\n---\n\n');

  const result = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: SkillSchema,
    prompt: `
你是一个 Claude Code Skill 生成专家。用户收藏了以下 ${category} 领域的视频内容：

${videoSummaries}

请基于这些内容，生成一个可用的 Claude Code Skill。

要求：
1. Skill 名称使用 kebab-case（如 cooking-style-writing）
2. 提炼出这些视频的**核心共性知识点**
3. instructions 部分要具体可执行，告诉 AI 应该如何帮助用户
4. examples 应该是真实可用的对话场景
5. 保持轻松友好的语气

生成一个高质量的 Skill 定义。
    `.trim(),
  });

  return result.object;
}
```

---

### 3.3 SKILL.md 文件模板

生成的 Skill 文件应符合 Claude Code 规范：

```markdown
# [Skill Display Name]

[Skill Description]

## 使用场景

- 场景 1
- 场景 2
- 场景 3

## 核心能力

基于用户收藏的 [Category] 领域视频，本 Skill 能够：

1. [能力 1]
2. [能力 2]
3. [能力 3]

## 使用示例

### 示例 1
\`\`\`
用户：[example input 1]
助手：[example output 1]
\`\`\`

### 示例 2
\`\`\`
用户：[example input 2]
助手：[example output 2]
\`\`\`

### 示例 3
\`\`\`
用户：[example input 3]
助手：[example output 3]
\`\`\`

## 约束条件

- [Constraint 1]
- [Constraint 2]
- [Constraint 3]

---

## 核心指令

[Instructions - 这里是告诉 AI 如何表现的核心 prompt]

## 知识来源

本 Skill 基于以下收藏视频生成：

- [Video 1 Title]
- [Video 2 Title]
- [Video 3 Title]
- ...

> 生成时间：[Timestamp]
> 领域：[Category]
> 视频数量：[Count]
```

---

## 四、前端交互设计

### 4.1 领域详情页组件结构

```typescript
// app/category/[category]/page.tsx

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import VideoCard from '@/components/VideoCard';
import SkillGeneratorModal from '@/components/SkillGeneratorModal';
import ChatPanel from '@/components/ChatPanel';

export default function CategoryPage({ params }: { params: { category: string } }) {
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const { data: videos } = useQuery({
    queryKey: ['favorites', params.category],
    queryFn: () => fetch(`/api/favorites?category=${params.category}`).then(r => r.json()),
  });

  const handleToggleVideo = (id: string) => {
    setSelectedVideoIds(prev =>
      prev.includes(id) ? prev.filter(vid => vid !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen p-4">
      {/* 头部 */}
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => window.history.back()}>← 返回</button>
          <h1 className="text-2xl font-bold">{params.category}</h1>
          <span className="text-gray-500">({videos?.length || 0} 个视频)</span>
        </div>
        <button onClick={() => setShowChat(true)}>💬 打开对话</button>
      </header>

      {/* 视频网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {videos?.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            isSelected={selectedVideoIds.includes(video.id)}
            onToggle={() => handleToggleVideo(video.id)}
          />
        ))}
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t flex gap-4 justify-center">
        <button className="btn-secondary">🧠 AI 总结本领域</button>
        <button
          className="btn-primary"
          onClick={() => setShowSkillModal(true)}
        >
          ✨ 生成 Skill ({selectedVideoIds.length || '全部'})
        </button>
      </div>

      {/* Skill 生成弹窗 */}
      {showSkillModal && (
        <SkillGeneratorModal
          category={params.category}
          videoIds={selectedVideoIds.length > 0 ? selectedVideoIds : videos?.map(v => v.id)}
          onClose={() => setShowSkillModal(false)}
        />
      )}

      {/* 对话侧边栏 */}
      {showChat && (
        <ChatPanel
          category={params.category}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
}
```

---

### 4.2 Skill 生成弹窗组件

```typescript
// components/SkillGeneratorModal.tsx

'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

interface Props {
  category: string;
  videoIds: string[];
  onClose: () => void;
}

export default function SkillGeneratorModal({ category, videoIds, onClose }: Props) {
  const [skillName, setSkillName] = useState(`${category}-skill`);
  const [skillDescription, setSkillDescription] = useState('');
  const [mode, setMode] = useState<'default' | 'advanced'>('default');

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/skills/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          videoIds,
          skillName,
          skillDescription,
          mode,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      alert(`✅ Skill 生成成功！\n\n使用方法：/${data.skillName}`);
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full">
        <h2 className="text-xl font-bold mb-4">生成 Skill</h2>

        {/* Skill 名称 */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Skill 名称</label>
          <input
            type="text"
            value={skillName}
            onChange={(e) => setSkillName(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="例如：cooking-style-writing"
          />
          <p className="text-xs text-gray-500 mt-1">使用 kebab-case 格式</p>
        </div>

        {/* Skill 描述 */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Skill 描述（可选）</label>
          <textarea
            value={skillDescription}
            onChange={(e) => setSkillDescription(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
            rows={3}
            placeholder="描述这个 Skill 的用途..."
          />
        </div>

        {/* 生成模式 */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">生成模式</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="default"
                checked={mode === 'default'}
                onChange={() => setMode('default')}
              />
              <span>默认模式</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="advanced"
                checked={mode === 'advanced'}
                onChange={() => setMode('advanced')}
              />
              <span>高级定制</span>
            </label>
          </div>
        </div>

        {/* 视频数量提示 */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm">
            将基于 <strong>{videoIds.length}</strong> 个视频生成 Skill
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded-lg"
          >
            取消
          </button>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
          >
            {generateMutation.isPending ? '生成中...' : '✨ 生成 Skill'}
          </button>
        </div>

        {/* 错误提示 */}
        {generateMutation.isError && (
          <p className="mt-4 text-sm text-red-500">
            生成失败，请重试
          </p>
        )}
      </div>
    </div>
  );
}
```

---

## 五、Skill 文件存储

### 5.1 文件系统结构

```
.claude/skills/
├── cooking-style-writing/
│   └── SKILL.md
├── fitness-tutorial/
│   └── SKILL.md
└── travel-photography/
    └── SKILL.md
```

### 5.2 Skill 注册（可选）

如果需要自动注册 Skill，可以修改 Claude Code 的配置文件（如果有的话）。

或者，用户手动运行：

```bash
claude skills refresh
```

---

## 六、高级功能（Phase 3+）

### 6.1 Skill 版本管理

- 用户可以重新生成 Skill（覆盖旧版本）
- 保存生成历史，支持回滚

### 6.2 Skill 分享

- 导出 Skill 文件（`.zip` 包含 SKILL.md 和元数据）
- 分享给其他用户导入

### 6.3 Skill 市场

- 用户可以将自己生成的 Skill 上传到社区
- 其他用户可以下载和导入

---

## 七、使用示例

### 示例 1：生成"美食写作"Skill

1. 用户收藏了 12 个美食相关的视频
2. 进入"美食"领域详情页
3. 点击"生成 Skill"
4. 系统提炼视频中的写作技巧，生成 `cooking-style-writing` Skill
5. 用户在 Claude Code 中输入 `/cooking-style-writing 写一篇麻辣烫的文案`
6. AI 基于收藏视频的风格，生成相应的文案

### 示例 2：生成"健身教程"Skill

1. 用户收藏了 20 个健身视频
2. 生成 `fitness-tutorial` Skill
3. 用户在 Claude Code 中输入 `/fitness-tutorial 给我制定一个减脂计划`
4. AI 基于收藏视频的内容，生成个性化健身计划

---

## 八、成本估算

假设每个 Skill 生成需要处理 10 个视频，每个视频平均 200 tokens：

- **Input tokens**：10 videos × 200 tokens = 2,000 tokens
- **Output tokens**：生成 SKILL.md 约 1,500 tokens
- **Cost per Skill**：~$0.0006（使用 gpt-4o-mini）

即使生成 100 个 Skill，成本也仅约 $0.06。

---

## 九、待办事项

### Phase 2（PoC）
- [ ] 实现 `/api/skills/generate` 端点
- [ ] 实现 `SkillGeneratorModal` 组件
- [ ] 集成 Vercel AI SDK `generateObject`
- [ ] 生成符合规范的 SKILL.md 文件
- [ ] 测试 Skill 在 Claude Code 中的可用性

### Phase 3（完整产品）
- [ ] Skill 版本管理
- [ ] Skill 预览功能
- [ ] Skill 分享与导出
- [ ] Skill 市场

---

*本文档基于 FavToSkill 技术架构文档 v1.0.0 编写。*
