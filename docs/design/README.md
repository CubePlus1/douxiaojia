# 设计文档索引

> 本目录存放 FavToSkill 的功能级设计文档。高层架构见 [`../ARCHITECTURE.md`](../ARCHITECTURE.md)。

## 文档清单

| 编号 | 文档 | 阶段 | 状态 |
|---|---|---|---|
| 01 | [核心：Video → Skill](./01-video-to-skill.md) | Phase A | ✅ 已实现 |
| 02 | [视频抽取子系统（Bilibili + YouTube + yt-dlp）](./02-video-extraction.md) | Phase B | ✅ 已实现 |
| 03 | [意图驱动的切片 RAG](./03-intent-driven-rag.md) | Phase C | 🟡 规划中 |

## 设计原则（贯穿所有阶段）

**保留既有产品视觉语言**：
- **7 个固定分类**：`tech` / `jieshuo` / `food` / `trip` / `renwen` / `game` / `knowledge`（科技 / 解说 / 美食 / 旅行 / 人文 / 游戏 / 知识）
- 分类元数据单一数据源：`src/config/categories.ts`（颜色、bot 头像、topTags 等）
- **柔和温暖极简**配色：浅蓝绿渐变背景 `#D8EEF0 → #C5E8EA`，主色 `#6DBF9E`
- **中文优先**的 UX 文案，AI 助手语气友好

**保留既有代码能力**：
- 复用 `generateSkillWithAI()`（`src/lib/skillTemplate.ts`）— Skill 生成管线已跑通
- 复用 `getAIModel()`（`src/lib/ai-client.ts`）— OpenAI 兼容客户端已封装
- 复用 `Video` / `VideoInput` 接口（`src/types/index.ts`）
- 7 个分类元数据从 `src/config/categories.ts` 单一来源加载——**永远不硬编码**

**工程原则**：
- 本地运行优先（不做 Cloudflare Workers 兼容）
- 所有 LLM 调用走 OpenAI 兼容协议（DashScope / OpenAI / Ollama 零切换成本）
- 渐进式增强：每个 Phase 都是对上一个的附加，不 regression 既有场景

## 实施顺序（当前）

```
✅ Phase A (Video → Skill 核心)      已合入 main
         │
         ▼
✅ Phase B (yt-dlp 抽取 Bilibili + YouTube)   已合入 main
         │
         ▼
🟡 Phase C (意图驱动切片 RAG)           规划完成，待实施
         │
         ▼
⏳ Phase D (Whisper ASR 兜底？)         视 Phase C 效果而定
⏳ Phase E (向量 embedding 替换 BM25？)  同上
```

## 每个 Phase 的一句话价值

- **Phase A**：把"贴一段视频文字"变成"一份可直接用的 Claude Code Skill"
- **Phase B**：把"手动贴文字"升级为"贴 URL 自动填表"
- **Phase C**：把"整个视频 → 一份平均 Skill"升级为"你想学什么 → 一份聚焦 Skill"
