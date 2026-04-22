# FavToSkill

> 粘贴 YouTube 链接，AI 提炼成可执行的 Claude Code Skill。

**FavToSkill** 是一个本地运行的 Next.js 应用。核心能力：把视频字幕（或你手动粘贴的任意文本）扔给 LLM，输出一份符合 Claude Code 规范的 `SKILL.md` 文件，下载即用。

本项目 fork 自黑客松原型，后续经过深度 pivot：剥离"抖音收藏整理"的品牌与 demo 流程，聚焦到"**视频 → Claude Code Skill**"这一个单一动作。历史沿革见 [`docs/design/`](docs/design/)。

---

## 两条路径：单视频 vs 批量

```
                    ┌──────────┐
                    │  /  首页  │
                    └────┬─────┘
                  ┌──────┴──────┐
                  ▼             ▼
           ┌──────────┐   ┌──────────┐
           │ /create  │   │  /batch  │
           │ 单视频   │   │ 1-10 个  │
           └────┬─────┘   └────┬─────┘
                │              │
                │              ▼
                │    ┌───────────────────────────┐
                │    │ POST /api/videos/          │
                │    │      batch-extract         │
                │    │ yt-dlp 串行抓取            │
                │    │ 单 URL 失败不阻塞          │
                │    │ 全失败返 422 + items       │
                │    └────────────┬──────────────┘
                │                 │
                ▼                 ▼
     ┌──────────────────────────────────────┐
     │ transcript + 用户学习意图（可选）    │
     └──────────────────┬───────────────────┘
                        ▼
     ┌──────────────────────────────────────┐
     │  src/lib/retrieval/ 自建 RAG 管线    │
     │                                      │
     │  1. 判断是否触发（总字数 ≥ 3000）    │
     │  2. 意图 → LLM 关键词扩展（带 5min  │
     │     缓存，失败回退到原词）           │
     │  3. 所有视频 transcript 切片         │
     │     （段落→句子，500-1000 字/片）    │
     │  4. BM25-lite 打分（头部加权）       │
     │  5. Jaccard 去重 → top-K=8           │
     │                                      │
     │  降级：命中为 0 时退回全量模式       │
     └──────────────────┬───────────────────┘
                        ▼
     ┌──────────────────────────────────────┐
     │ POST /api/skills/generate  (单视频) │
     │ POST /api/skills/batch-generate (批) │
     │                                      │
     │ Vercel AI SDK generateObject         │
     │   mode: "json" · 3 次重试            │
     │ Zod schema（preprocess 容错）        │
     │ 批量模式在 instructions 里标注       │
     │   来源 [视频 N]                      │
     └──────────────────┬───────────────────┘
                        ▼
              📄  下载 SKILL.md
                        ↓
         ~/.claude/skills/<skill-name>/SKILL.md
         → Claude Code 启动自动加载
```

### 当前实现到哪一步

| 模块 | 状态 |
|---|---|
| ✅ **Phase A**：`/create` 页面 + 文本模式 + 分类 + 生成 + 下载 | 已实现，稳定 |
| ✅ **Phase B**：URL 模式 + yt-dlp 抽取 Bilibili + YouTube | 已实现 |
| ✅ **Phase C**：用户意图 + 切片 + 关键词 RAG（意图扩展 + BM25 + top-K） | **已实施**（与批量共享 `src/lib/retrieval/`） |
| ✅ **批量导入**：`/batch` 多视频 → 跨视频 RAG → 单 Skill | 已实施 |
| ⏳ **Phase D**：Whisper ASR 兜底无字幕视频 | 未规划 |

设计文档：[`docs/design/`](docs/design/)

---

## 首选 YouTube（为什么）

| 平台 | 字幕覆盖 | 抓取成功率（经验值） |
|---|---|---|
| **YouTube** | 绝大多数视频有 CC 或 AI 自动字幕 | ~95% |
| Bilibili | 多数 UP 主用"硬字幕"（烧进画面像素） | ~10% |

**Bilibili 支持保留**——遇到真正带 CC 的 B 站视频（官方账号、部分头部 UP）能正常工作；无字幕时返 422 + 友好提示。

国内访问 YouTube 需要本机代理（见环境变量 `YOUTUBE_PROXY`）。

---

## 快速开始

### 1. 安装依赖
```bash
cd src
npm install
```

要求：
- **Node.js 20+**
- **Python 3.9+**（yt-dlp 的运行时；`youtube-dl-exec` 的 postinstall 会自动拉取 yt-dlp 二进制到 `node_modules/youtube-dl-exec/bin/`，不需要你另外装 yt-dlp）

### 2. 配置环境变量
```bash
cp .env.example .env
```

然后编辑 `.env`——`.env.example` 里每个变量都有详细说明、三套推荐 AI 预设（DashScope / OpenAI / 本地 Ollama）和常见坑提示。最少需要填：
- `AI_API_KEY` + `AI_BASE_URL` + `AI_MODEL`（生成 Skill 必需）
- `YOUTUBE_PROXY`（国内用 YouTube URL 模式必需）

### 3. 启动
```bash
npm run dev
```
访问 <http://localhost:3000>。

---

## 使用流程

### 单视频（`/create`）

1. 打开 `/` → 点「单视频 → Skill」
2. 选模式：**贴 YouTube 链接**（推荐，自动抓表单）或 **手动填写**
3. 按需编辑表单字段（title / author / description / transcript / tags）
4. 点「AI 帮我选」让模型推荐分类，或手动从 7 个领域选一个
5. 给 Skill 起 kebab-case 名字（会自动按标题生成建议）
6. 点「生成 Skill」→ 预览 → 下载 `SKILL.md`
7. 放到 `~/.claude/skills/<skill-name>/SKILL.md`，Claude Code 启动自动加载

### 批量多视频（`/batch`）

1. 打开 `/` → 点「批量 → 跨视频凝练」
2. 粘 1–10 个视频链接（可混 YouTube + Bilibili），点「抓取所有视频」
3. 等待串行抓取结束（单个失败不阻塞其他）
4. 填写**学习意图**（强烈推荐）——例：「搞懂 attention 的具体计算步骤」
5. 选分类 + Skill 名 → 点「生成 Skill」
6. 系统自动：意图关键词扩展 → 跨视频切片 BM25 检索 top-8 片段 → LLM 凝练 → 输出一份 `SKILL.md`（每条 instructions 标注来源视频）
7. 下载并安装到 `~/.claude/skills/`

批量场景 AI 自动分类暂不支持（单视频场景才有），请手动选。

---

## 意图驱动的切片 RAG（Phase C · 已实施）

**解决的问题**：长视频 transcript（>10k 字）被硬截断后半段丢失；模型不知道用户真正想学什么，生成的 Skill 往往是"视频主题的平均描述"。

**做法**：用户填写「我想学什么」字段，系统只把**与意图相关的片段**喂给 LLM。

**实际管线**（见 `src/lib/retrieval/`）：
- **C-1 切片 + BM25**：transcript 按段落 + 句子切成 500-1000 字的切片；用 BM25-lite（头部 100 字加权 +2）按意图 + 标题 + 标签打分；Jaccard ≥ 0.7 去重；取 **top-8**。
- **C-2 意图扩展**：小模型把用户意图扩展成 5-15 个同义词/变体（中英双语），加入关键词集。缓存 (intent, titles, tags) → keywords，5 分钟 TTL，100 条上限。LLM 调用失败时回退到原词。
- **C-3 向量 embedding**：**没做**——BM25 + 意图扩展跑下来效果够用，没触发瓶颈。接口预留了 `strategy` 字段方便以后加。

**批量和单视频共享同一套 retrieval**——区别只是批量会把多个视频的切片合成同一个 chunk pool，生成的 instructions 末尾标 `[视频 N]`。

**为什么不直接上向量 RAG**：成本（多一次 embedding 调用 + 存储决策）换来的边际收益小；短视频 + 同质化字幕场景下，BM25 + 意图扩展已经够用。

---

## 技术栈

| 层级 | 选型 |
|---|---|
| 框架 | Next.js 16 (App Router, Turbopack) + React 19 |
| 语言 | TypeScript 5 |
| 样式 | Tailwind CSS v4 |
| AI SDK | Vercel AI SDK — `generateObject` with `mode: "json"` |
| LLM | 任意 OpenAI 兼容 API（默认 DashScope / 通义千问） |
| 校验 | Zod v4（schema 里用 `preprocess` 容错 LLM 的格式偏差） |
| 视频抽取 | [yt-dlp](https://github.com/yt-dlp/yt-dlp) + [youtube-dl-exec](https://github.com/microlinkhq/youtube-dl-exec) |
| 运行 | 本地 Node.js + 本地 Python（仅 yt-dlp 运行时） |

**刻意不用**：
- Cloudflare Workers / Serverless——本项目是本地优先，要 child_process + fs
- LangChain / ChromaDB——Phase C 用 BM25 足矣，真需要向量再加
- 数据库——0 持久化，skill 生成是无状态 API

---

## 测试

```bash
cd src
npm test              # 跑一次（vitest）
npm run test:watch    # 开发模式
npm run test:coverage # 生成覆盖率报告
```

- **61 个单元 / 集成测试**，全绿
- `src/lib/retrieval/` 覆盖率 **93%**（切片 / 分词 / BM25 / 意图扩展 / 编排器）
- 批量 runner 覆盖：串行、失败隔离、onProgress 回调
- 所有新增 API 路由都有 happy path + 503 / 400 / 422 / 500 分支测试
- UI 组件无测试——本地跑一下 `npm run dev` 肉眼验就完了，e2e 不值得上

---

## 已知边界

- **硬字幕视频抓不到**——字幕烧进画面像素需要 OCR 管线，本项目不做
- **YouTube 新视频 JS 运行时**——yt-dlp 2025.12+ 对部分 YouTube 视频需要外挂 Deno/Node JS 运行时；极少数情况才触发
- **小模型 JSON 输出不稳定**——Qwen2.5-7b 一类更小模型偶发 schema mismatch。代码已内置 3 次重试 + JSON mode + schema preprocess 三层容错；换更大模型彻底规避
- **批量上限 10 个视频**——再多会被 yt-dlp 代理端口抢占 + 超时。真要更多请分批跑
- **批量场景不支持 AI 自动分类**——意图跨多视频打分歧义太大，手动选分类即可

---

## 架构重点文件

```
src/
├── app/
│   ├── page.tsx                         # Landing（双 CTA：/create + /batch）
│   ├── create/page.tsx                  # 单视频创建流程
│   ├── batch/page.tsx                   # 批量创建流程（状态机）
│   └── api/
│       ├── videos/extract/route.ts      # POST 单个视频抽取
│       ├── videos/batch-extract/route.ts # POST 批量抽取（全失败返 422）
│       ├── skills/classify/route.ts     # POST 分类推荐（仅单视频）
│       ├── skills/generate/route.ts     # POST 单视频生成（已接入 retrieval）
│       └── skills/batch-generate/route.ts # POST 批量生成（跨视频 RAG）
│
├── components/
│   ├── create/                          # 单视频 UI 组件
│   │   ├── ModeSwitch.tsx               # 文本 / URL 模式切换
│   │   ├── UrlExtractor.tsx
│   │   ├── VideoForm.tsx
│   │   ├── CategoryPicker.tsx
│   │   ├── SkillConfig.tsx
│   │   └── GeneratedSkillModal.tsx
│   └── batch/                           # 批量 UI 组件
│       ├── BatchUrlList.tsx             # 多 URL 可增删行
│       ├── BatchExtractionProgress.tsx  # 每 URL 状态 chip
│       ├── BatchVideoPreview.tsx        # 已抓视频卡片
│       └── IntentField.tsx              # 学习意图 textarea
│
├── lib/
│   ├── ai-client.ts                     # OpenAI 兼容客户端 + 两种 prompt 模板
│   ├── skillTemplate.ts                 # generateSkillWithAI（接受 retrievalContext）
│   ├── skillName.ts                     # kebab-case 生成 + 校验
│   ├── validators/videoInput.ts         # Zod schemas（含批量 + 意图）
│   ├── retrieval/                       # Phase C 自建 RAG 管线
│   │   ├── types.ts                     # Chunk / ScoredChunk / RetrievalContext
│   │   ├── tokenizer.ts                 # 中英双语分词（CN 2-4 gram）
│   │   ├── chunker.ts                   # transcript → Chunk[]
│   │   ├── bm25.ts                      # 打分 + Jaccard 去重 + top-K
│   │   ├── intent.ts                    # LLM 意图扩展 + TTL 缓存
│   │   └── index.ts                     # retrieveForSkill 编排器
│   ├── batch/                           # 批量抽取子系统
│   │   ├── types.ts                     # BatchItem / BatchResult
│   │   └── runner.ts                    # 串行 + 失败隔离 + onProgress
│   └── extractor/                       # yt-dlp 子系统（Phase B）
│       ├── _runner.ts
│       ├── bilibili.ts
│       ├── youtube.ts
│       ├── subtitle.ts                  # SRT / VTT / Bilibili-JSON 解析
│       ├── registry.ts                  # URL → extractor 路由
│       ├── errors.ts                    # 6 种错误码 + HTTP 状态映射
│       └── types.ts
│
└── config/
    └── categories.ts                    # 7 分类 single source of truth
```

---

## 设计文档

`docs/design/` 下（早期设计记录）：
- [`README.md`](docs/design/README.md) — 索引 + 设计原则
- [`01-video-to-skill.md`](docs/design/01-video-to-skill.md) — Phase A（已实施）
- [`02-video-extraction.md`](docs/design/02-video-extraction.md) — Phase B（已实施）
- [`03-intent-driven-rag.md`](docs/design/03-intent-driven-rag.md) — Phase C（已实施）

`docs/superpowers/` 下（批量 + RAG 落地记录）：
- `specs/2026-04-22-batch-import-rag-design.md` — 批量 + 跨视频 RAG 设计
- `plans/2026-04-22-batch-import-rag.md` — 21 步 TDD 实施计划

---

## 许可

MIT
