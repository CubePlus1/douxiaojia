# FavToSkill

> 粘贴 YouTube 链接，AI 提炼成可执行的 Claude Code Skill。

**FavToSkill** 是一个本地运行的 Next.js 应用。核心能力：把视频字幕（或你手动粘贴的任意文本）扔给 LLM，输出一份符合 Claude Code 规范的 `SKILL.md` 文件，下载即用。

本项目 fork 自黑客松原型，后续经过深度 pivot：剥离"抖音收藏整理"的品牌与 demo 流程，聚焦到"**视频 → Claude Code Skill**"这一个单一动作。历史沿革见 [`docs/design/`](docs/design/)。

---

## 视频 → Skill 模块：它到底做了什么

```
 ┌──────────────────────────────────────────────────────────────┐
 │                        用户输入                                │
 │   ① 贴视频 URL（YouTube / Bilibili）                          │
 │   ② 或手动粘贴 title + transcript + tags（文本模式）          │
 └──────────────────────────────┬───────────────────────────────┘
                                ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  Stage 1 · 视频抽取（Phase B，仅 URL 模式）                   │
 │                                                                │
 │   yt-dlp via youtube-dl-exec 子进程调用                       │
 │   ├─ Phase 1：--dump-single-json 拿元数据 + 字幕清单          │
 │   ├─ 挑最佳字幕：手工 CC 优先 > AI 自动字幕 > 排除弹幕轨       │
 │   └─ Phase 2：把选中的那一种语言字幕下载到临时目录             │
 │                                                                │
 │   字幕解析：SRT / VTT / Bilibili-JSON → 纯文本（剥时间戳）    │
 │                                                                │
 │   产出：title / author / description / transcript / tags /    │
 │         duration / thumbnailUrl + subtitleMeta                 │
 └──────────────────────────────┬───────────────────────────────┘
                                ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  Stage 2 · 分类（Phase A，可选）                              │
 │                                                                │
 │   POST /api/skills/classify                                    │
 │   └─ LLM + Zod z.enum 约束 → 7 个固定分类之一                  │
 │      （科技 / 解说 / 美食 / 旅行 / 人文 / 游戏 / 知识）         │
 │                                                                │
 │   fallback：无 AI_API_KEY 时返 503（不降级到关键词）          │
 └──────────────────────────────┬───────────────────────────────┘
                                ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  Stage 3 · Skill 生成（Phase A）                              │
 │                                                                │
 │   POST /api/skills/generate                                    │
 │   └─ Vercel AI SDK generateObject，mode: "json"                │
 │      │                                                         │
 │      ▼                                                         │
 │   Zod Schema（带容错 preprocess）：                            │
 │      displayName / description / trigger / instructions /      │
 │      examples[] / constraints[] / capabilities[] / useCases[]  │
 │      │                                                         │
 │      ▼                                                         │
 │   模板拼接 → SKILL.md（Markdown）                              │
 │                                                                │
 │   3 次自动重试；失败时给用户可操作的错误信息。                 │
 └──────────────────────────────┬───────────────────────────────┘
                                ▼
                   📄  下载 SKILL.md
        ↓
    放到 ~/.claude/skills/<skill-name>/SKILL.md
    → Claude Code 启动自动加载，可按触发语激活
```

### 当前实现到哪一步

| 模块 | 状态 |
|---|---|
| ✅ **Phase A**：`/create` 页面 + 文本模式 + 分类 + 生成 + 下载 | 已实现，稳定 |
| ✅ **Phase B**：URL 模式 + yt-dlp 抽取 Bilibili + YouTube | 已实现 |
| 🟡 **Phase C**：用户意图 + 切片 + 关键词 RAG（见下文） | **规划完成，待实施** |
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

1. 打开 `/` → 点「贴字幕生成 Skill」
2. 在 `/create` 选模式：
   - **贴 YouTube 链接**（推荐）——自动抓表单
   - **手动填写**——直接粘 transcript
3. 按需编辑表单字段（title / author / description / transcript / tags）
4. 点「AI 帮我选」让模型推荐分类，或手动从 7 个领域选一个
5. 给 Skill 起 kebab-case 名字（会自动按标题生成建议）
6. 点「生成 Skill」→ 预览 → 下载 `SKILL.md`
7. 放到 `~/.claude/skills/<skill-name>/SKILL.md`，Claude Code 启动自动加载

---

## 规划中：Phase C · 意图驱动的切片 RAG

**问题**：当前生成管线把整段 transcript 直接塞 prompt。长视频（>10k 字）被硬截断，后半段完全丢；且模型不知道用户真正想学什么，生成的 Skill 往往是"视频主题的平均描述"。

**目标**：让用户填一个「我想从这个视频学什么」字段，系统只把**与意图相关的片段**喂给 LLM，生成**针对性更强的 Skill**。

**方案**（详见 [`docs/design/03-intent-driven-rag.md`](docs/design/03-intent-driven-rag.md)）：
- **C-1**：transcript 按段落 + 句子切成 500-1000 字的切片；用 BM25-lite 按意图 + 标题 + 标签打分，取 top-5；喂给 LLM。
- **C-2**：用小模型把用户意图扩展成关键词列表（覆盖同义词），提升检索召回率。
- **C-3**（暂缓）：真向量 embedding RAG——如果 C-1/C-2 不够好再上。

**为什么不直接上向量 RAG**：成本（多一次 embedding 调用 + 存储决策）换来的边际收益小；短视频 + 同质化字幕场景下，BM25 + 意图扩展的效果已经足够好。

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

## 已知边界

- **硬字幕视频抓不到**——字幕烧进画面像素需要 OCR 管线，本项目不做
- **YouTube 新视频 JS 运行时**——yt-dlp 2025.12+ 开始对部分 YouTube 视频需要外挂 Deno/Node JS 运行时；极少数情况才触发
- **小模型 JSON 输出不稳定**——Qwen2.5-7b 一类更小的模型偶发 schema mismatch。代码已内置 3 次重试 + JSON mode + schema preprocess 三层容错；换更大模型彻底规避
- **长视频内容丢失**——transcript 超 10k 字硬截断。Phase C 落地后此问题消失（切片 + 检索替代截断）

---

## 架构重点文件

```
src/
├── app/
│   ├── page.tsx                         # Landing（单 CTA → /create）
│   ├── create/page.tsx                  # 创建 Skill 主页面
│   └── api/
│       ├── videos/extract/route.ts      # POST 抽取视频 metadata + 字幕
│       ├── skills/classify/route.ts     # POST 分类推荐（LLM z.enum）
│       └── skills/generate/route.ts     # POST 生成 SKILL.md
│
├── components/create/
│   ├── ModeSwitch.tsx                   # 文本模式 / URL 模式切换
│   ├── UrlExtractor.tsx                 # URL 输入 + 抽取触发
│   ├── VideoForm.tsx                    # 视频信息表单
│   ├── CategoryPicker.tsx               # 7 分类 chip grid
│   ├── SkillConfig.tsx                  # Skill name + description
│   └── GeneratedSkillModal.tsx          # 预览 + 下载
│
├── lib/
│   ├── ai-client.ts                     # OpenAI 兼容客户端 + prompt 模板
│   ├── skillTemplate.ts                 # generateSkillWithAI（核心管线）
│   ├── skillName.ts                     # 纯函数：name 校验 + 生成
│   ├── validators/videoInput.ts         # Zod schemas
│   └── extractor/                       # yt-dlp 子系统（Phase B）
│       ├── _runner.ts                   # 共享 yt-dlp 调用 + 字幕挑选
│       ├── bilibili.ts                  # Bilibili extractor
│       ├── youtube.ts                   # YouTube extractor
│       ├── subtitle.ts                  # SRT / VTT / Bilibili-JSON 解析
│       ├── registry.ts                  # URL → extractor 路由
│       ├── errors.ts                    # 6 种错误码 + HTTP 状态映射
│       └── types.ts                     # VideoExtractor 接口
│
└── config/
    └── categories.ts                    # 7 分类 single source of truth
```

---

## 设计文档

`docs/design/` 下：
- [`README.md`](docs/design/README.md) — 索引 + 设计原则
- [`01-video-to-skill.md`](docs/design/01-video-to-skill.md) — Phase A
- [`02-video-extraction.md`](docs/design/02-video-extraction.md) — Phase B
- [`03-intent-driven-rag.md`](docs/design/03-intent-driven-rag.md) — Phase C（规划中）

---

## 许可

MIT
