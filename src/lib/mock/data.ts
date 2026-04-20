// ─────────────────────────────────────────────
// 静态 JSON 导入（兼容 Cloudflare Workers，无需 fs）
// ─────────────────────────────────────────────

import categoriesData from "../../public/mock/categories.json";
import techFavorites from "../../public/mock/tech_favorites.json";
import foodFavorites from "../../public/mock/food_favorites.json";
import knowledgeFavorites from "../../public/mock/knowledge_favorites.json";
import jieshuo from "../../public/mock/jieshuo.json";
import lvyou from "../../public/mock/lvyou.json";
import youxi from "../../public/mock/youxi.json";
import knowledge from "../../public/mock/knowledge.json";

// ─────────────────────────────────────────────
// 分类 ID — 与 categories.json 中的 id 对齐
// ─────────────────────────────────────────────

export type CategoryId =
  | "tech"
  | "jieshuo"
  | "food"
  | "trip"
  | "renwen"
  | "game"
  | "knowledge";

// ─────────────────────────────────────────────
// 视频数据类型
// ─────────────────────────────────────────────

export interface MockVideo {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category: CategoryId;
  savedAt: string; // ISO 8601
  transcript?: string; // 视频文字稿（用于 RAG）
  // 以下字段源自视频元数据，mock 数据中可能缺失
  author?: string;
  thumbnail?: string;
  url?: string;
  duration?: number; // seconds
  viewCount?: number;
}

export interface CategoryMeta {
  id: CategoryId;
  name: string; // 展示名称，如"科技"、"美食"
  description: string;
  videoCount: number;
  color: string;
  colorDark?: string;
  emoji?: string;
  icon?: string;
  topTags: string[];
}

// ─────────────────────────────────────────────
// 中文分类名 → CategoryId
// ─────────────────────────────────────────────

const CATEGORY_NAME_MAP: Record<string, CategoryId> = {
  科技: "tech",
  美食: "food",
  解说: "jieshuo",
  旅行: "trip",
  人文: "renwen",
  游戏: "game",
  知识: "knowledge",
  商业财经: "knowledge",
};

// ─────────────────────────────────────────────
// 数据加载（静态导入，构建时打包）
// ─────────────────────────────────────────────

interface RawFavorite {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category: string;
  savedAt: string;
  transcript?: string;
}

/**
 * 将原始 JSON 数据映射为 MockVideo[]
 */
function mapRawToVideos(
  raw: RawFavorite | RawFavorite[],
  fallbackCategory: CategoryId
): MockVideo[] {
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    tags: item.tags,
    category: CATEGORY_NAME_MAP[item.category] ?? fallbackCategory,
    savedAt: item.savedAt,
    transcript: item.transcript,
  }));
}

let _favorites: MockVideo[] | null = null;
let _categories: CategoryMeta[] | null = null;

/**
 * 加载所有收藏视频（从静态导入的 JSON 合并）。
 */
export function getFavorites(): MockVideo[] {
  if (!_favorites) {
    _favorites = [
      ...mapRawToVideos(techFavorites as RawFavorite[], "tech"),
      ...mapRawToVideos(foodFavorites as RawFavorite[], "food"),
      ...mapRawToVideos(knowledgeFavorites as RawFavorite[], "knowledge"),
      ...mapRawToVideos(jieshuo as RawFavorite[], "jieshuo"),
      ...mapRawToVideos(lvyou as RawFavorite[], "trip"),
      ...mapRawToVideos(youxi as RawFavorite[], "game"),
      ...mapRawToVideos(knowledge as RawFavorite[], "knowledge"),
    ];
  }
  return _favorites;
}

export function getCategories(): CategoryMeta[] {
  if (!_categories) _categories = categoriesData as CategoryMeta[];
  return _categories;
}

// ─────────────────────────────────────────────
// 查询辅助函数
// ─────────────────────────────────────────────

export function getFavoritesByCategory(category: CategoryId): MockVideo[] {
  return getFavorites().filter((v) => v.category === category);
}

export function getFavoritesPage(
  category?: CategoryId,
  page = 1,
  limit = 10
): { data: MockVideo[]; total: number; page: number; limit: number } {
  let list = getFavorites();
  if (category) list = list.filter((v) => v.category === category);
  const total = list.length;
  const data = list.slice((page - 1) * limit, page * limit);
  return { data, total, page, limit };
}

/**
 * 根据分类名称（中文）或 ID 查找 CategoryId。
 * 例如 "科技" → "tech"，"tech" → "tech"
 */
export function findCategoryId(nameOrId: string): CategoryId | undefined {
  if (nameOrId in CATEGORY_NAME_MAP) {
    return CATEGORY_NAME_MAP[nameOrId];
  }
  const categories = getCategories();
  const cat = categories.find((c) => c.id === nameOrId || c.name === nameOrId);
  return cat?.id;
}

/**
 * 构建 RAG 上下文字符串。
 * 如果视频有 transcript 则使用 transcript，否则使用 description。
 */
export function buildRagContext(category?: CategoryId): string {
  let list = getFavorites();
  if (category) list = list.filter((v) => v.category === category);

  return list
    .map((v) => {
      const content = v.transcript
        ? v.transcript.slice(0, 600)
        : v.description;
      return `【${v.title}】\n标签：${v.tags.join("、")}\n内容：${content}`;
    })
    .join("\n\n---\n\n");
}
