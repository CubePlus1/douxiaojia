# FavToSkill 技术架构文档

> 版本：1.0.0 | 日期：2026-04-18 | 阶段：Demo 优先 → PoC

---

## 一、产品概述

FavToSkill 将用户的抖音收藏视频自动整理为可对话、可交互的**知识地图**。

核心用户价值：
- 收藏了大量视频但从未回看？→ 自动分类，秒速召回
- 想深入某个领域？→ AI 对话，即刻获取相关内容摘要
- 不同设备随时访问，手机/PC 完全自适应

---

## 二、功能清单

| 编号 | 功能 | 阶段 |
|---|---|---|
| F1 | Mock 抖音收藏视频（50 条，6 个领域） | Phase 1 |
| F2 | 主页知识地图 — 瀑布流领域卡片 | Phase 1 |
| F3 | 领域详情页 — 视频列表 | Phase 1 |
| F4 | 响应式布局（手机 1 列 / PC 1 列，底图适配） | Phase 1 |
| F5 | 对话侧边栏 — RAG 问答（流式） | Phase 2 |
| F6 | 知识点 AI 自动总结 | Phase 2 |
| F7 | 真实数据接入（TikTok 分享链接解析） | Phase 3 |
| F8 | 用户系统 + 数据持久化 | Phase 3 |

---

## 三、技术栈

### 3.1 前端

| 职责 | 技术 | 说明 |
|---|---|---|
| 框架 | **Next.js 14+ (App Router)** | SSR + API Routes 一体，Vercel 部署友好 |
| 样式 | **Tailwind CSS v3** | 与 constitution 约定一致 |
| 瀑布流布局 | **react-masonry-css** | 3 kB，纯 CSS 列方案，零 JS 运行时开销 |
| 流式聊天 UI | **Vercel AI SDK `useChat`** | 内置 streaming、消息历史、loading 状态 |
| 服务端状态 | **TanStack Query v5** | 收藏列表、分类数据缓存与同步 |
| 客户端状态 | **Zustand v4** | 选中领域、对话面板、筛选条件 |
| 数据验证 | **Zod v3** | 前后端共用 schema，TypeScript 类型推断 |

### 3.2 后端（Next.js API Routes）

| 职责 | 技术 | 说明 |
|---|---|---|
| 流式 LLM 响应 | **Vercel AI SDK `streamText`** | 与前端 `useChat` 自动配对，SSE 协议 |
| RAG 检索链 | **LangChain.js v0.2** | RetrievalChain、TextSplitter、向量检索 |
| 结构化分类 | **Vercel AI SDK `generateObject`** | Zod schema 约束 LLM 输出，防幻觉 |
| Embedding 生成 | **OpenAI text-embedding-3-small** | $0.02/1M tokens，性价比最优 |

### 3.3 数据层（分阶段演进）

| 阶段 | 向量库 | 关系库 | 特点 |
|---|---|---|---|
| **Phase 1 Demo** | 无（mock JSON） | `public/mock/*.json` | 零基础设施，秒速启动 |
| **Phase 2 PoC** | **Chroma（本地嵌入模式）** | JSON → SQLite | 本地运行，无需云服务 |
| **Phase 3 生产** | **Supabase pgvector** | **Supabase Postgres** | 一体化管理：向量 + 关系 + Auth |
| **Phase 4 规模** | **Qdrant Cloud** | Supabase | 百万级向量，22ms P95，Rust 引擎 |

### 3.4 AI 模型配置

| 用途 | 模型 | 估算成本 |
|---|---|---|
| 聊天问答（RAG） | `gpt-4o-mini` | ~$0.15/1M input tokens |
| 知识点总结 | `gpt-4o-mini` | ~$0.15/1M input tokens |
| 自动分类 | `gpt-4o-mini` via generateObject | 一次性摄入成本 |
| Embedding | `text-embedding-3-small` | $0.02/1M tokens |

> Phase 1 Demo 全部使用 **mock 回复**，无需真实 API key。

---

## 四、系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    用户（手机 / PC）                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                  Next.js 前端                                │
│                                                             │
│  ┌─────────────────────┐   ┌────────────────────────────┐  │
│  │ 主页「知识地图」      │   │ 对话侧边栏 ChatPanel        │  │
│  │ react-masonry-css   │   │ Vercel AI SDK useChat      │  │
│  │ 瀑布流领域卡片        │   │ 流式 token 增量渲染         │  │
│  └────────┬────────────┘   └────────────┬───────────────┘  │
│           │                             │                   │
│  ┌────────▼────────────┐               │                   │
│  │ 领域详情页            │               │                   │
│  │ TanStack Query      │               │                   │
│  │ 视频卡片列表          │               │                   │
│  └────────┬────────────┘               │                   │
└───────────┼─────────────────────────────┼───────────────────┘
            │ fetch                       │ POST + SSE
┌───────────▼─────────────────────────────▼───────────────────┐
│                  Next.js API Routes                          │
│                                                             │
│  GET /api/categories   GET /api/favorites                   │
│  POST /api/summarize   POST /api/chat (streaming)           │
│                             │                               │
│                    ┌────────▼────────┐                      │
│                    │ LangChain.js    │                      │
│                    │ RetrievalChain  │                      │
│                    └────────┬────────┘                      │
└─────────────────────────────┼───────────────────────────────┘
                              │
          ┌───────────────────▼────────────────────┐
          │         数据层                          │
          │  Chroma（Phase 2）/ pgvector（Phase 3） │
          │  + JSON mock（Phase 1）                 │
          └────────────────────────────────────────┘
```

---

## 五、RAG 数据流

### 5.1 数据摄入（ingest pipeline）

```
mock/favorites.json
  │
  ├── 读取视频元数据（title + description + tags）
  │
  ├── LangChain RecursiveCharacterTextSplitter
  │     chunkSize: 500, chunkOverlap: 50
  │
  ├── OpenAI text-embedding-3-small
  │     → 1536 维向量
  │
  └── Chroma upsert
        metadata: { videoId, category, title, savedAt }
```

运行命令：`npm run ingest`

### 5.2 查询流程（RAG chat）

```
用户输入问题
  │
  ├── embed query（text-embedding-3-small）
  │
  ├── Chroma similarity search (top 5，可按 category 过滤)
  │
  ├── 拼装 system prompt + 检索到的视频摘要
  │
  ├── Vercel AI SDK streamText (gpt-4o-mini)
  │
  └── SSE → useChat → UI 增量渲染
```

### 5.3 知识点总结流程

```
用户点击「AI 总结」(指定 category)
  │
  ├── 取该领域所有视频的 title + description
  │
  ├── Vercel AI SDK generateText (gpt-4o-mini)
  │     prompt: "请总结以下{category}领域的收藏视频知识点..."
  │
  └── 返回结构化 Markdown 摘要
```

---

## 六、响应式布局方案

### 6.1 瀑布流卡片即文件夹

**每张领域卡片本身就是一个文件夹形态的 UI 组件**，没有独立的「背景装饰文件夹」层。
文件夹卡片由 SVG 图形 + 内容区叠加构成，6 个领域对应 6 种颜色变体。

```
┌──────────────────────────┐
│  Layer 2: 内容层 (z-10)   │  ← 瀑布流文件夹卡片（卡片 = 文件夹）
├──────────────────────────┤
│  Layer 1: 丝带层 (z-0)    │  ← 波浪丝带，跟随滚动 + scroll 驱动变化
└──────────────────────────┘
背景：固定渐变 position: fixed
```

### 6.2 瀑布流断点

手机/PC 同等优先，使用 react-masonry-css 响应式断点：

```typescript
// components/KnowledgeMap/index.tsx
const breakpointCols = {
  default: 3,   // ≥1024px: PC 3 列
  1024: 2,      // 768–1024px: 平板 2 列
  768: 1,       // <768px: 手机 1 列（满屏）
};

<Masonry
  breakpointCols={breakpointCols}
  className="flex gap-4 px-4"
  columnClassName="flex flex-col gap-4"
>
  {domains.map(domain => (
    <FolderCard key={domain.id} domain={domain} />  // 卡片即文件夹
  ))}
</Masonry>
```

手机端：单列全屏上滑瀑布流
PC 端：3 列网格，点击文件夹卡片弹出右侧对话面板

### 6.3 Scroll 驱动的波浪丝带

丝带跟随页面滚动动态变化（路径形态 / 偏移），使用原生 scroll 事件 +
CSS 自定义属性驱动，无需第三方动画库：

```typescript
// components/RibbonScroll/index.tsx
useEffect(() => {
  const onScroll = () => {
    const progress = window.scrollY /
      (document.body.scrollHeight - window.innerHeight); // 0 → 1
    document.documentElement.style.setProperty(
      '--scroll-progress', String(progress)
    );
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}, []);
// JS 按 progress 对 SVG path 控制点做 LERP 插值，实现路径形变
```

**与设计师约定的交付物：**

| 交付项 | 格式 | 说明 |
|--------|------|------|
| 丝带初始态路径 | SVG path `d` 字符串 | 对应 `scrollProgress = 0`（页面顶部） |
| 丝带结束态路径 | SVG path `d` 字符串 | 对应 `scrollProgress = 1`（页面底部） |
| 两态控制点数量 | 须完全一致 | 开发用 LERP 在两态间插值 |
| 丝带颜色 / 描边宽度 | Hex + px | 参考 constitution 色值 |

---

## 七、Mock 数据结构

### 7.1 favorites.json（50 条视频）

```typescript
interface MockVideo {
  id: string;          // "video_001"
  title: string;       // "React 18 并发特性详解"
  description: string; // 100-300 字，用于 embedding
  author: string;      // 抖音作者名
  thumbnail: string;   // "https://picsum.photos/seed/video_001/400/300"
  category: VideoCategory;
  tags: string[];      // ["React", "前端", "并发"]
  duration: number;    // 视频时长（秒），如 183
  savedAt: string;     // ISO 8601，"2026-01-15T10:30:00Z"
  url: string;         // "https://www.douyin.com/video/video_001"
  viewCount: number;   // 收藏时的播放量（mock）
}

type VideoCategory =
  | '编程开发'
  | '设计创意'
  | '职场成长'
  | '生活方式'
  | '财经知识'
  | '健身运动';
```

### 7.2 categories.json（6 个领域）

```typescript
interface CategoryMeta {
  id: string;          // "programming"
  name: VideoCategory; // "编程开发"
  description: string; // 领域一句话描述
  videoCount: number;
  coverImage: string;
  color: string;       // 领域主题色，符合 constitution 配色
  topTags: string[];   // top 5 标签
}
```

---

## 八、API 接口设计

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/categories` | 所有领域分类，含视频数量 |
| GET | `/api/favorites` | 分页视频列表，支持 `?category=&page=&limit=` |
| POST | `/api/chat` | RAG 流式对话，body: `{ messages: Message[] }` |
| POST | `/api/summarize` | 知识点总结，body: `{ category: VideoCategory }` |

`/api/chat` 响应为 `text/event-stream`，与 Vercel AI SDK `useChat` 协议兼容。

---

## 九、目录结构

```
FavToSkill/
├── app/
│   ├── page.tsx                    # 主页：知识地图
│   ├── layout.tsx                  # 全局布局（字体、背景渐变）
│   ├── [category]/page.tsx         # 领域详情页
│   └── api/
│       ├── chat/route.ts           # RAG 对话（SSE streaming）
│       ├── summarize/route.ts      # AI 知识点总结
│       ├── categories/route.ts     # 领域列表
│       └── favorites/route.ts      # 视频列表
├── components/
│   ├── KnowledgeMap/index.tsx      # 主页瀑布流容器（react-masonry-css）
│   ├── FolderCard/index.tsx        # 领域卡片 = 文件夹形态 UI（SVG + 内容叠加）
│   ├── VideoCard/index.tsx         # 视频卡片（文件夹内展开的视频列表项）
│   ├── RibbonScroll/index.tsx      # Scroll 驱动的波浪丝带（LERP 路径插值）
│   ├── ChatPanel/index.tsx         # 对话侧边栏
│   └── ui/                         # Button, Tag, Skeleton, FolderIcon 等基础组件
├── lib/
│   ├── rag/
│   │   ├── chain.ts                # LangChain RAG 检索链配置
│   │   ├── vectorstore.ts          # Chroma 初始化
│   │   └── ingest.ts               # 数据摄入 pipeline
│   ├── mock/data.ts                # Mock 数据加载工具函数
│   ├── store/useAppStore.ts        # Zustand 全局状态
│   └── utils.ts
├── public/mock/
│   ├── favorites.json              # 50 条视频 mock 数据
│   └── categories.json             # 6 个领域 meta
├── scripts/ingest.ts               # 数据摄入脚本（npm run ingest）
├── styles/globals.css              # Tailwind base + CSS 变量（配色）
├── docs/ARCHITECTURE.md            # 本文档
├── .env.example
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## 十、环境变量

```bash
# .env.local（Phase 1 Demo 不需要真实值，留空即可）
OPENAI_API_KEY=sk-...                 # Phase 2+ 开启 RAG 时填写
CHROMA_DB_PATH=./chroma_db            # 本地 Chroma 存储路径

# Phase 3+ Supabase（按需添加）
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## 十一、关键依赖

```json
{
  "dependencies": {
    "next": "^14.2",
    "react": "^18.3",
    "react-dom": "^18.3",
    "ai": "^3.4",
    "langchain": "^0.2",
    "@langchain/openai": "^0.2",
    "chromadb": "^1.8",
    "@tanstack/react-query": "^5.51",
    "zustand": "^4.5",
    "react-masonry-css": "^1.0.16",
    "zod": "^3.23",
    "tailwindcss": "^3.4",
    "clsx": "^2.1",
    "tailwind-merge": "^2.4"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/react": "^18",
    "tsx": "^4"
  }
}
```

---

## 十二、快速启动

```bash
# 1. 初始化项目
npx create-next-app@latest . \
  --typescript --tailwind --app --src-dir=false --import-alias "@/*"

# 2. 安装依赖
npm install ai langchain @langchain/openai chromadb \
  @tanstack/react-query zustand react-masonry-css \
  zod clsx tailwind-merge

# 3. 开发启动（Phase 1 无需任何 API key）
npm run dev

# 4. Phase 2+ 数据摄入（需要 OPENAI_API_KEY）
npm run ingest
```

---

## 十三、阶段演进路线图

### Phase 1 — 视觉 Demo
目标：跑通视觉效果，验证知识地图形态

- [ ] Next.js + Tailwind 项目初始化
- [ ] 生成 50 条 mock 视频数据（JSON）
- [ ] 主页瀑布流知识地图（react-masonry-css）
- [ ] 领域卡片、视频卡片组件（符合 constitution 设计规范）
- [ ] 响应式布局：手机 1 列 / 平板 2 列 / PC 3 列
- [ ] 领域详情页

### Phase 2 — RAG 对话
目标：跑通 AI 对话与知识点总结

- [ ] 配置 Vercel AI SDK + LangChain.js + Chroma
- [ ] 数据摄入脚本（`npm run ingest`）
- [ ] `/api/chat` streaming 接口
- [ ] 对话侧边栏 ChatPanel（useChat）
- [ ] 知识点 AI 总结功能

### Phase 3 — 完整 PoC
目标：接近真实产品体验

- [ ] 真实抖音数据接入（分享链接解析 / 文件导入）
- [ ] 迁移向量库至 Supabase pgvector
- [ ] LLM 自动分类（generateObject）
- [ ] 用户系统（Supabase Auth）

---

## 十四、设计规范参考

所有 UI 组件须符合 [`.specify/memory/constitution.md`](.specify/memory/constitution.md) 定义的**柔和温暖极简主义**设计语言：

| 元素 | 规范值 |
|---|---|
| 主背景 | 浅蓝绿渐变 `#D8EEF0` → `#C5E8EA` |
| 主色调 | 柔绿 `#6DBF9E` |
| 卡片背景 | 纯白 `#FFFFFF` |
| 文字主色 | 深炭黑 `#1A1A1A` |
| 强调色 | 湖蓝 `#4BBFD4` |
| 卡片圆角 | 16–24px |
| 动效原则 | 轻柔平滑，避免突兀跳转 |

---

*本文档基于项目 constitution.md v1.0.0 和技术调研报告（2026-04-18）生成。*
