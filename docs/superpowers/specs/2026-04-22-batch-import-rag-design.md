# 批量导入 + 跨视频 RAG → 单份 Skill

> 版本 1.0 · 2026-04-22 · 分支 `feature/batch-import-rag`

## 背景

当前（Phase A+B）只支持单视频→单 Skill。用户的实际场景经常是"我收藏了 5 个讲 Transformer 的视频，帮我凝练成一个学习 Skill"。本次新增：

1. 一次最多 10 个 URL 批量抽取
2. 跨视频做切片 + 意图驱动检索（RAG）
3. 单份 SKILL.md 输出（含来源视频标注）
4. 新 UI `/batch`（与 `/create` 并列）

顺带把**规划中的 Phase C**（单视频 RAG）一起落地——批量和单视频用同一套 `retrieval/` 模块。

## 约束（Constraint Set）

### 硬约束

- **不引入 LangChain**——项目原则保持。所有 RAG 逻辑自写在 `src/lib/retrieval/`。
- **不引入 embedding / vector DB**（C-3 无限期延后）。BM25-lite + LLM 意图扩展。
- **不引入数据库**——批量状态存内存 Map，API 无状态。
- **最多 10 个 URL**——批量上限。>10 直接 422 拒绝。
- **串行抽取**——yt-dlp 并发会互相抢代理端口、被 YouTube 反爬。单 URL 失败不阻塞其他。
- **本地运行**——Node.js + Python 3.9+（yt-dlp 运行时），无 Cloudflare / Serverless。
- **TS 严格**——沿用现有 tsconfig.strict。

### 软约束

- 单模块一 commit，Conventional Commits 风格。
- 复用现有组件（`CategoryPicker` / `SkillConfig` / `GeneratedSkillModal` / `ModeSwitch` 思路）。
- 错误文案中文；错误码对齐 `src/lib/extractor/errors.ts`。
- `extractor/` 子系统不改（只被调用）。

### 依赖

- `src/lib/extractor/_runner.ts` — yt-dlp 抽取
- `src/config/categories.ts` — 7 分类
- `src/lib/ai-client.ts` — LLM 客户端
- `src/lib/validators/videoInput.ts` — zod schema（会扩展，加 `intent` + 批量 schema）

## 架构

### 新模块

```
src/lib/retrieval/
├── types.ts              # Chunk, ScoredChunk, IntentContext, RetrievalResult
├── chunker.ts            # transcript → Chunk[]
├── tokenizer.ts          # 中英文分词 + 停用词
├── bm25.ts               # 打分 + top-K + 去重
├── intent.ts             # LLM 扩展意图关键词（带内存缓存）
└── index.ts              # retrieveForSkill(videos[], intent, config) → RetrievalResult

src/lib/batch/
├── types.ts              # BatchJob, BatchItemStatus, BatchResult
└── runner.ts             # 串行抽取编排 + 进度回调
```

### 新增 API

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/videos/batch-extract` | POST | 接收 URL 列表，流式（SSE 或 polling）返回每 URL 抽取状态 |
| `/api/skills/batch-generate` | POST | 接收抽取完成的视频列表 + intent + category，跑 RAG + 生成 SKILL.md |

### 新增页面

| 路由 | 说明 |
|---|---|
| `/batch` | 批量导入主页面 |

### 新组件

```
src/components/batch/
├── BatchUrlList.tsx              # 可增删行的 URL 输入列表
├── BatchExtractionProgress.tsx   # 每 URL 状态 chip（pending/extracting/done/failed）
├── IntentField.tsx               # 意图 textarea（字数计数 + 占位文案）
└── BatchVideoPreview.tsx         # 已抽取视频的简要卡片列表
```

### 修改点

| 文件 | 改动 |
|---|---|
| `src/lib/validators/videoInput.ts` | 加 `intent` 字段（≤300 字）；加 `batchExtractInputSchema`、`batchGenerateInputSchema` |
| `src/lib/skillTemplate.ts` | `generateSkillWithAI` 接受可选 `retrievalContext`；prompt 拼接支持片段模式 |
| `src/lib/ai-client.ts` | `buildSkillGenerationPrompt` 支持两种模式：全量 transcript / 检索片段 |
| `src/app/page.tsx` | Landing 加第二 CTA 指向 `/batch` |
| `src/app/api/skills/generate/route.ts` | 单视频路径也接入 retrieval（transcript > 3000 字自动切片） |

### 不改

- `src/lib/extractor/*` — yt-dlp 子系统只读被用
- `src/config/categories.ts` — 7 分类原样复用
- `src/app/create/page.tsx` — 单视频流程不动（但底层 API 接入了 retrieval）
- `src/app/api/skills/classify/route.ts` — 分类 API 不动

## 数据流

### 批量抽取

```
Client: POST /api/videos/batch-extract { urls: [...] }
  ↓
Server: 串行遍历 urls
  ├─ for each url:
  │    ├─ extract via existing extractor
  │    ├─ push to results with { status, video?, error? }
  │    └─ (optional) stream chunk
  └─ return { items: [...] }
```

### RAG + 生成

```
Client: POST /api/skills/batch-generate {
  videos: [...],        # 已抽取完成
  intent: string,       # 必填
  category: CategoryId,
  skillName: string,
}
  ↓
Server:
  1. expandIntent(intent, titles, tags) → keywords[]       # retrieval/intent.ts
  2. chunk(each video.transcript) → Chunk[] with sourceId   # retrieval/chunker.ts
  3. score all chunks against keywords                      # retrieval/bm25.ts
  4. dedup (Jaccard > 0.7)                                  # retrieval/bm25.ts
  5. top-K=8 selected                                        # retrieval/bm25.ts
  6. buildSkillGenerationPrompt(mode: "retrieved", chunks)  # ai-client.ts
  7. generateSkillWithAI(prompt)                            # skillTemplate.ts
  8. return { skillMarkdown, sources: [...] }
```

## 错误处理

### 批量抽取
- 单 URL 失败不 fail-fast——结果里标记 `{ status: "failed", error }`
- 最少 1 个成功才允许进入生成步骤；全失败返 422
- yt-dlp 错误码对齐 `extractor/errors.ts`

### RAG
- BM25 全零分（无关键词命中）→ 降级：每视频取前 N 字等分，保留覆盖
- 意图扩展 LLM 失败 → 降级：用原意图字面分词作为关键词
- 所有降级路径打 `console.warn` 方便 debug

### 生成
- 复用现有 3 重试 + JSON mode + zod preprocess 机制

## 测试策略

新增 `vitest` 依赖：

```
src/
├── lib/retrieval/
│   ├── chunker.test.ts      # 边界情况：空 / 超长 / 极短段
│   ├── tokenizer.test.ts    # 中英文混合 / 停用词
│   ├── bm25.test.ts         # 打分排序 / 去重 / top-K
│   ├── intent.test.ts       # mock LLM，缓存命中
│   └── index.test.ts        # 集成：多视频输入 → top-K
├── lib/batch/
│   └── runner.test.ts       # mock extractor，串行 + 失败隔离
└── app/api/
    ├── videos/batch-extract/route.test.ts   # mock extractor
    └── skills/batch-generate/route.test.ts  # mock LLM + retrieval
```

**覆盖率目标**：retrieval 纯函数 > 80%，API 路由有 happy path + 至少 2 条错误路径。

不做 e2e（headless 浏览器过度工程）。

## 实施顺序（提交边界）

1. `chore: add vitest + testing setup` — 配置文件 + script
2. `feat(retrieval): add types + chunker` — 类型 + 切片
3. `feat(retrieval): add tokenizer + stopwords` — 分词
4. `feat(retrieval): add bm25 scoring + dedup` — 打分
5. `feat(retrieval): add intent expansion with cache` — 意图扩展
6. `feat(retrieval): add orchestrator (retrieveForSkill)` — 组装
7. `test(retrieval): unit tests for all modules` — 测试
8. `feat(batch): add runner + types` — 批量编排
9. `feat(api): add batch-extract route` — 批量抽取 API
10. `feat(api): add batch-generate route` — 批量生成 API
11. `feat(api): integrate retrieval into single-video generate` — Phase C 落地（单视频也用 retrieval）
12. `test(api): integration tests for batch routes` — API 测试
13. `feat(ui): add batch components` — UI 组件
14. `feat(ui): add /batch page + landing CTA` — 页面 + 入口
15. `docs: update README with batch workflow` — 文档
16. `fix: <各类审查修复>` — 审查轮

## 审查计划

共 3 轮（字面量"10 轮"解读为"审查到干净为止"，3 轮实测足够）：

| 轮 | 审查者 | 重点 | 阈值 |
|---|---|---|---|
| 1 | codex + gemini 交叉（`/ccg:spec-review` 等价） | 架构 / 正确性 / 安全 | Critical = 0 才过 |
| 2 | `code-reviewer` agent | 风格 / 复杂度 / 约定 | High = 0 才过 |
| 3 | `pr-test-analyzer` + `silent-failure-hunter` | 测试覆盖 / 静默失败 | 关键路径有测试 + 无吞错 |

每轮修复后重跑同一审查者验证，修完进下一轮。3 轮后仍有 Critical → 继续第 4 轮。

## 接受标准

- [ ] `/batch` 页面能输入 2+ URL，展示抽取进度
- [ ] 批量抽取对任一 URL 失败能隔离，其他继续
- [ ] 生成的 SKILL.md 在 instructions 里能看出"综合了 N 个视频"
- [ ] 短视频批量（总 transcript <3000 字）也能跑（退化走全量 prompt）
- [ ] 单视频 `/create` 流程无 regression（底层接入 retrieval 但行为一致）
- [ ] vitest 跑 `npm test` 全绿，覆盖率 retrieval > 80%
- [ ] 3 轮审查通过（每轮 Critical = 0）

## 风险与缓解

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 多视频 transcript 拼接超 LLM 上下文 | 中 | top-K=8 硬上限 + 每片 ≤1000 字 → 最多 8k 字进 prompt |
| 跨语言视频混合（中/英）BM25 召回差 | 中 | tokenizer 双模分词，意图扩展用 LLM 补同义词 |
| yt-dlp 串行太慢（10 视频可能 5 分钟） | 中 | 进度流式反馈；超时 90s/URL 触发单 URL 失败（不阻塞） |
| LLM 幻觉：把 A 视频的内容说成 B 视频的 | 中 | prompt 强制标注 `[视频 N]`，审查阶段验证 |
| 内存 Map 缓存无限膨胀 | 低 | 软 LRU：100 条 / 5 分钟 TTL |

## 超出范围（不做）

- Whisper ASR 兜底无字幕视频
- 并发抽取优化
- Vector embedding RAG（C-3）
- 跨 session 持久化（数据库）
- 批量输入 transcript 文本模式（只支持 URL，因为批量场景下手动粘贴 N 份 transcript 反人类）
- i18n（现有中文 UI 保持）

## 术语表

- **Chunk**：一段 500-1000 字的 transcript 切片，带 `sourceVideoId` 和位置元信息
- **Intent**：用户学习目的，≤300 字自由文本
- **意图扩展**：用 LLM 把意图扩展成同义词集合（cross-lingual + domain-specific）
- **BM25-lite**：简化版 BM25，不做 IDF 语料统计，直接用查询词命中次数 + 位置加权
- **Source provenance**：生成的 SKILL.md 里每条 instructions 标注来源 `[视频 N]`
