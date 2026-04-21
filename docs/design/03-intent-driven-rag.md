# Phase C · 意图驱动的切片 RAG

> 版本：1.0 · 2026-04-20 · 状态：规划中，待实施

## 背景与动机

### 现状管线（Phase A + B）

```
transcript (全量；超 10k 字直接截断)
   ↓
   单次 LLM prompt → generateObject → SKILL.md
```

**能跑通，但两个实际问题**：

1. **长视频内容丢失**
   - YouTube 30 分钟视频 transcript 常 8k-15k 字
   - 超过 `MAX_TRANSCRIPT_LENGTH = 10000` 直接截断，后半段完全丢
   - 模型看到的是"前半段 + 突然结束"，生成的 Skill 往往偏题
2. **缺少意图信号**
   - 同一个视频，不同人想学的不一样：
     - "TED 演讲：平凡生活也能有趣" 可以提炼成"如何让生活有趣" / "演讲技巧" / "心理学概念"
     - 但 LLM 自己猜，多次生成结果不稳定
   - 用户无法把自己的学习目的传达给 LLM

### 真实用户故事

> 我收藏了 3Blue1Brown 那个 20 分钟讲 Transformer 的视频。
> 我**已经懂神经网络**，只想让 Skill 帮我搞懂 **attention 机制具体怎么算**。
> 但当前生成的 Skill 把整个 GPT 流水线都讲一遍，80% 是我已经会的，真正想学的 attention 只有两句话。

这个用户需要的是：**用意图聚焦 transcript 里的相关段落，生成专一的 Skill**。

---

## 设计原则

- **渐进式**：不破坏 Phase A+B 的短视频路径（<3000 字 transcript 保持当前行为）
- **轻量优先**：关键词检索优先于向量 embedding；能不加外部服务就不加
- **透明降级**：检索失败 → 退回全量 transcript；永远能出一份 Skill
- **意图可选**：不填意图也能跑（退化成"按主题关键词"打分）

---

## 方案选型

调研了三条路线，决定**主走 C-1（BM25 关键词）+ C-2（LLM 意图扩展）**。

| 方案 | 检索质量 | 依赖 | 额外调用 | 决定 |
|---|---|---|---|---|
| **C-1 BM25 / TF-IDF** | 中（字面匹配） | 无 | 0 | ✅ 先做 |
| **C-2 LLM 扩展意图关键词** | 高（覆盖同义词） | 现有 LLM | +1 次短 prompt | ✅ 紧跟 C-1 |
| C-3 真向量 RAG | 高（语义匹配） | embedding API | +1 次 embedding + 存储 | 暂缓（视效果而定） |
| C-4 Map-Reduce（对每片 LLM 判相关性） | 最高 | 现有 LLM | +N 次（N = 切片数，成本 ×10） | 不做 |

**为什么不选向量 RAG（C-3）**：
- 字幕材料同质性强（一个视频 ≈ 一个主题），同义词问题被 LLM 关键词扩展（C-2）基本覆盖
- 引入 embedding API 需要额外 key + 网络调用 + 存储决策（内存 / 持久化 / Chroma）
- 对 <30 分钟视频收益边际，对 >1 小时视频 C-1/C-2 也够用
- **真遇到瓶颈再升级**——接口预留好（见"未来扩展"）

---

## 功能定义

### 新增表单字段：学习意图

位置：`/create` 页面 Video 表单下方，分类选择器上方。

```
┌─ 学习意图（可选，但强烈推荐） ─────────────────┐
│  你想从这个视频学到什么？                      │
│  ┌────────────────────────────────────────┐  │
│  │ 例：我已经懂神经网络，想学 attention    │  │
│  │ 机制的具体计算步骤                      │  │
│  └────────────────────────────────────────┘  │
│  ↑ 填得越具体，生成的 Skill 越贴合你的学习目标 │
└────────────────────────────────────────────────┘
```

- 可选字段，空也能生成（退化到当前行为，但会加一个"没意图"的温馨提示）
- 最长 300 字

### 切片触发条件

- `transcript.length >= 3000` 触发切片管线
- 否则走**现有全量 prompt**（不改行为）

### 切片策略

1. **段落边界优先**：按 `\n\n` 拆，保留原段落结构
2. **长段落再拆**：单段 >1200 字 → 按句号再拆
3. **极短段合并**：<200 字的段合并进相邻段
4. **最终产出**：~500-1000 字的段，每段自带 id（顺序编号）

### 检索打分（C-1，BM25-lite）

**权重设计**：

```
每个切片得分 = Σ (匹配词 × 词权重)

词来源：
  - 用户意图里的关键词（权重 ×5）
  - 视频标题里的关键词（权重 ×3）
  - Top 3 tag（权重 ×2）

分词：
  - 英文按空格 + punctuation
  - 中文用 2-4 字 n-gram（与现有 segmentChinese 一致）
  - 去停用词（的、了、是、and、the 等）

匹配：
  - 普通出现：+1
  - 切片开头 100 字内出现：+2（段落核心更可能在开头）
```

取前 N 片（默认 N=5），按原顺序拼回 prompt 喂给 LLM。

### 意图扩展（C-2）

用户输入意图 + 视频标题/标签 → 小规模 LLM 调用生成同义词：

```
输入：
  意图："attention 机制的具体计算步骤"
  标题："Transformers, the tech behind LLMs"

输出 JSON：
  { "keywords": ["attention", "自注意力", "self-attention", "注意力", "Q K V", "查询", "键", "值", "softmax", "dot product"] }
```

这些扩展词加入切片检索词表（权重 ×3）。

**调用时机**：点"生成 Skill"时，如果意图非空 → 先做这次扩展调用（~1 秒，缓存）→ 再做切片检索。

### Prompt 调整

新 system prompt 在原来基础上追加：

```
# 用户学习意图
{intent 或 "用户未填写，按视频主题生成通用 Skill"}

# 检索到的相关片段
以下是从完整字幕中挑出的 {N} 段最相关内容（按原顺序排列）：

---
【片段 1】（原 transcript 0.0%-12.3% 位置）
...
---
【片段 2】（原 transcript 23.1%-35.7% 位置）
...

# 特别要求
- instructions / examples 必须**贴合用户意图**
- 不要超出以上片段的信息范围胡编
- 如果意图和视频内容不完全匹配（例如用户问 A 但视频讲 B），在 description 里**诚实说明**
```

---

## 架构变更

### 新模块

```
src/lib/retrieval/
├── types.ts          # Chunk, RetrievalResult, IntentContext
├── chunker.ts        # transcript → Chunk[]
├── tokenizer.ts      # 中英文分词 + 停用词
├── bm25.ts           # 打分 + top-K 选片
├── intent.ts         # 用 LLM 扩展意图关键词（C-2）
└── index.ts          # retrieveForSkill(transcript, title, tags, intent) → 选中的片段 + 元数据
```

### 修改点

| 文件 | 改动 |
|---|---|
| `src/lib/validators/videoInput.ts` | `videoInputSchema` 加 `intent?: string`（≤ 300 字） |
| `src/types/index.ts` | `VideoInput` / `GenerateSkillRequest` 加 `intent?` |
| `src/app/api/skills/generate/route.ts` | transcript > 3000 字时调 `retrieveForSkill` |
| `src/lib/skillTemplate.ts` | `generateSkillWithAI` 接受可选的 `retrievalContext`，拼 prompt 时替换 `videoSummaries` 片段 |
| `src/lib/ai-client.ts` | `buildSkillGenerationPrompt` 适配两种模式（全量 / 片段） |
| `src/app/create/page.tsx` | 表单加 intent 字段、传给生成 API |
| `src/components/create/VideoForm.tsx` | 新 intent textarea 子组件 |

### 不改动

- 抽取子系统（yt-dlp / extractor/）不动——它们只提供原始 transcript
- 分类 API `/api/skills/classify` 不动——只看 title + description + 前 5000 字 transcript
- 短视频路径（<3000 字）不变

---

## 实施阶段

### Phase C-1：切片 + 关键词检索（主线，约 1 天）

- [ ] 新建 `src/lib/retrieval/` 模块（chunker / tokenizer / bm25）
- [ ] 单元测试：给定 transcript 能切出合理切片；意图 + 关键词能打分排序
- [ ] `/create` 表单加 intent textarea（可选字段）
- [ ] `/api/skills/generate` 在 transcript > 3000 字时自动启用
- [ ] Prompt 调整：片段模式下 prompt 注入意图 + 片段位置元信息
- [ ] 端到端验证：长视频 transcript 不再被硬截断，生成 Skill 更聚焦

### Phase C-2：LLM 意图扩展（增强，约半天）

- [ ] 新 endpoint / lib 函数：`expandIntent(intent, title, tags) → keywords[]`
- [ ] 调用 cache：同一 (intent, title) 5 分钟内命中缓存
- [ ] 把扩展词接入 BM25 检索词表
- [ ] A/B 对比：扩展关键词 vs 纯字面关键词，量化"与意图匹配度"（人工打分即可）

### Phase C-3（待定）：真向量 RAG

仅在以下情况启动：
- C-1 + C-2 实际使用时，**3 小时以上超长视频**检索质量明显下降
- 出现多语言混杂视频（中英混讲），n-gram 分词不够用

方案留口：`retrieval/` 里加 `strategy: "bm25" | "embedding"`，`embedding.ts` 独立文件做懒加载。不影响 BM25 路径。

---

## 接受标准

### Phase C-1

- [ ] 20 分钟 Transformer 视频（~8000 字 transcript），带意图"attention 机制的具体计算步骤"：
  - 生成的 Skill 的 instructions 必须**主要描述 Q/K/V 计算过程**，不是"GPT 全流水线"
- [ ] 空意图场景：同一视频生成结果与 Phase B 基本一致（不 regression）
- [ ] 短视频（<3000 字）：切片模块未被调用，性能无影响
- [ ] 前端表单禁用态、字数计数、占位符文案就位

### Phase C-2

- [ ] 意图"attention 机制" → 扩展出 self-attention、注意力、Q K V、softmax 至少 3 个
- [ ] 扩展缓存命中率 >80%（同一视频重复生成场景）
- [ ] 单次扩展调用耗时 < 2 秒（使用小模型即可）

---

## 风险与缓解

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 切片打分选错片段，关键信息没选进来 | 中 | 多选几片（top-5 而非 top-3）；降级策略：BM25 总分 0 时退回全量前 10k 字 |
| 中文分词简陋导致误匹 | 中 | 先用现有 `segmentChinese`；真出问题再引入结巴/`nodejieba` |
| 用户写废话意图（"介绍下这个视频"）导致检索退化 | 低 | 意图太短 (<5 字) 或含"介绍/总结/讲解"等通用词时，自动降级到"按视频主题" |
| LLM 在片段模式下幻觉（补自己的知识） | 中 | Prompt 明确禁止；生成后可加"来源引用"字段，每条 instructions 关联到片段 id |
| 切片边界切坏（把一句话切成两半） | 低 | 句子级边界 + 10% 重叠（chunker 实现细节） |

---

## 开放问题（实施时决定）

1. **intent 要不要也参与分类推荐**？当前 `/api/skills/classify` 只看 title+description+transcript。intent 可以让"同一视频 → 不同意图 → 不同分类"。
   - 建议：第一版不改，C-1 上线后看反馈
2. **片段是否给用户预览**？"AI 选了视频的这 5 段，你想加/减吗？"
   - 建议：第一版不做，直接自动用；实施后看用户是不是想控制
3. **缓存意图扩展结果放哪**：
   - 内存 Map（重启丢）→ MVP 用这个
   - localStorage（前端持久化）
   - 文件系统（多用户场景必要时）

---

## 未来延伸（范围外，仅记录）

- 按 YouTube chapters 自动章节切片（yt-dlp 元数据已经能拿）
- Whisper ASR 兜底无字幕视频
- Multi-video skill（同一意图，多个视频聚合）
- 用户生成 skill 的"知识来源"字段（切片 quote + timecode）
