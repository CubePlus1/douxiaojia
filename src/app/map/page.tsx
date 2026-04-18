"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import ChatPanel from "@/components/ChatPanel";

// ── 分类数据 ──────────────────────────────────────────────────────────────
type Category = {
  id: string;
  name: string;
  botImage: string;
  bgColor: string;
  rotate: number;
  offsetY: number;
};

const CATEGORIES: Category[] = [
  { id: "tech",    name: "科技", botImage: "/bot/bot_tech.png",    bgColor: "#E8F3FF", rotate: -6,  offsetY: 0   },
  { id: "jieshuo", name: "解说", botImage: "/bot/bot_film.png",    bgColor: "#FFF8E8", rotate:  5,  offsetY: 40  },
  { id: "food",    name: "美食", botImage: "/bot/bot_food.png",    bgColor: "#FFF1E8", rotate: -8,  offsetY: -10 },
  { id: "trip",    name: "旅行", botImage: "/bot/bot_trip.png",    bgColor: "#E8F5FF", rotate:  4,  offsetY: 32  },
  { id: "renwen", name: "人文", botImage: "/bot/bot_renwen.png", bgColor: "#F5E8FF", rotate: -4,  offsetY: 0   },
  { id: "game",    name: "游戏", botImage: "/bot/bot_game.png",    bgColor: "#EDFFF0", rotate:  7,  offsetY: 24  },
];

// ── Mock 提醒 ──────────────────────────────────────────────────────────────
type Reminder = {
  categoryId: string;
  message: string;
};

// 定时触发序列：[延迟ms, 分类id, 消息]（气泡类）
const REMINDER_SCHEDULE: [number, string, string][] = [
  [2000,  "trip",    "五一旅游，记得复习一下收藏攻略哦🇨🇳"],
];

// 抖动提醒：[延迟ms, 分类id]
const SHAKE_SCHEDULE: [number, string][] = [
  [1000, "tech"],
];

// ── 分类文件夹卡片 ─────────────────────────────────────────────────────────
function CategoryCard({
  category,
  reminder,
  onDismiss,
  index,
  shaking,
  onShakeDismiss,
}: {
  category: Category;
  reminder: Reminder | null;
  onDismiss: () => void;
  index: number;
  shaking?: boolean;
  onShakeDismiss?: () => void;
}) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);

  const isLeftCol = index % 2 === 0;
  const bubbleSide = isLeftCol ? "right" : "left";

  return (
    <div
      className="relative select-none cursor-pointer"
      style={{
        ["--card-rotate" as string]: `${category.rotate}deg`,
        ["--card-offsetY" as string]: `${category.offsetY}px`,
        transform: `rotate(${category.rotate}deg) translateY(${category.offsetY}px)`,
        animation: shaking ? "cardShake 0.5s ease-in-out infinite" : "none",
      }}
      onClick={() => {
        if (shaking && onShakeDismiss) {
          onShakeDismiss();
        }
        router.push(`/category/${category.id}`);
      }}
    >
      {/* 提醒气泡 —— 从图片左/右侧弹出，垂直居中，卡通风格 */}
      {reminder && (
        <div
          className="absolute z-20 rounded-3xl px-3.5 py-2.5 text-xs leading-snug font-medium"
          style={{
            top: "50%",
            transform: "translateY(-50%)",
            ...(bubbleSide === "right"
              ? { left: "calc(100% + 14px)" }
              : { right: "calc(100% + 14px)" }),
            background: "linear-gradient(135deg, #FFF6E0 0%, #FFE8F0 100%)",
            border: "2px solid rgba(255,255,255,0.9)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.08), 0 2px 6px rgba(255,180,100,0.15)",
            color: "#5A4230",
            animation: `slideBubble${bubbleSide === "right" ? "Right" : "Left"} 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both`,
            backdropFilter: "blur(8px)",
            width: 156,
            borderRadius: 18,
          }}
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        >
          {reminder.message}
          {/* 小三角箭头 */}
          <span
            className="absolute top-1/2 -translate-y-1/2"
            style={{
              display: "block",
              width: 0,
              height: 0,
              ...(bubbleSide === "right"
                ? {
                    left: -8,
                    borderTop: "7px solid transparent",
                    borderBottom: "7px solid transparent",
                    borderRight: "8px solid #FFF6E0",
                  }
                : {
                    right: -8,
                    borderTop: "7px solid transparent",
                    borderBottom: "7px solid transparent",
                    borderLeft: "8px solid #FFE8F0",
                  }),
            }}
          />
        </div>
      )}

      {/* 直接展示图片 */}
      {imgError ? (
        <div
          className="w-[148px] h-[140px] rounded-2xl flex items-center justify-center text-3xl font-bold"
          style={{ background: category.bgColor, color: "#666" }}
        >
          {category.name[0]}
        </div>
      ) : (
        <Image
          src={category.botImage}
          alt={category.name}
          width={148}
          height={140}
          className="object-contain drop-shadow-lg"
          onError={() => setImgError(true)}
        />
      )}

      {/* 小红点：抖动时显示，提示有新内容 */}
      {shaking && (
        <span
          className="absolute z-10"
          style={{
            top: 2,
            right: 6,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#FF3B30",
            boxShadow: "0 0 0 2px rgba(255,255,255,0.9), 0 2px 6px rgba(255,59,48,0.4)",
          }}
        />
      )}
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────────────────────
export default function MapPage() {
  const [reminders, setReminders] = useState<Map<string, Reminder>>(new Map());
  const [shaking, setShaking] = useState<Set<string>>(new Set());
  const [chatOpen, setChatOpen] = useState(false);

  // 定时触发 mock 提醒（气泡 + 抖动）
  useEffect(() => {
    const bubbleTimers = REMINDER_SCHEDULE.map(([delay, catId, message]) =>
      setTimeout(() => {
        setReminders((prev) =>
          new Map(prev).set(catId, { categoryId: catId, message })
        );
      }, delay)
    );
    const shakeTimers = SHAKE_SCHEDULE.map(([delay, catId]) =>
      setTimeout(() => {
        setShaking((prev) => new Set(prev).add(catId));
      }, delay)
    );
    return () => {
      bubbleTimers.forEach(clearTimeout);
      shakeTimers.forEach(clearTimeout);
    };
  }, []);

  const dismissReminder = (categoryId: string) => {
    setReminders((prev) => {
      const next = new Map(prev);
      next.delete(categoryId);
      return next;
    });
  };

  const dismissShake = (categoryId: string) => {
    setShaking((prev) => {
      const next = new Set(prev);
      next.delete(categoryId);
      return next;
    });
  };

  return (
    <div
      className="relative min-h-screen overflow-x-hidden"
      style={{ background: "linear-gradient(180deg, #C8E6F5 0%, #D5EDF7 50%, #E8F5FA 100%)" }}
    >
      {/* ── 顶部标题 ── */}
      <header className="pt-8 pb-4 px-6">
        <h1 className="text-2xl font-bold" style={{ color: "#1A1A1A" }}>
          抖小夹
        </h1>
        <p className="text-sm mt-1" style={{ color: "#888" }}>
          共 {CATEGORIES.length * 9} 个收藏视频，{CATEGORIES.length} 个文件夹
        </p>
      </header>

      {/* ── 散落卡片区 ── */}
      <main className="px-6 pb-32">
        {/* 两列网格，列间距大，行间距适中 */}
        <div
          className="grid grid-cols-2"
          style={{ columnGap: 20, rowGap: 40 }}
        >
          {CATEGORIES.map((cat, idx) => {
            const hasReminder = reminders.has(cat.id);
            return (
              <div
                key={cat.id}
                className="flex flex-col items-center"
                style={idx % 2 === 1 ? { paddingTop: 48 } : undefined}
              >
                {/* 占位 spacer：气泡出现时撑开高度，推动卡片下移 */}
                <div
                  style={{
                    height: hasReminder ? 60 : 0,
                    transition: "height 0.35s ease",
                    overflow: "hidden",
                  }}
                />
                <CategoryCard
                  category={cat}
                  reminder={reminders.get(cat.id) ?? null}
                  onDismiss={() => dismissReminder(cat.id)}
                  index={idx}
                  shaking={shaking.has(cat.id)}
                  onShakeDismiss={() => dismissShake(cat.id)}
                />
              </div>
            );
          })}
        </div>
      </main>

      {/* ── 半屏聊天面板（遮罩 + 滑入） ── */}
      {chatOpen && (
        <div className="fixed inset-0 z-[60]" onClick={() => setChatOpen(false)}>
          {/* 半透明遮罩 */}
          <div className="absolute inset-0 bg-black/30" />

          {/* 面板：click_bot.png 作为整体背景 */}
          <div
            className="absolute bottom-0 left-0 right-0 overflow-hidden"
            style={{
              height: "62vh",
              animation: "slideUp 0.35s ease both",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 背景图铺满整个面板 */}
            <Image
              src="/bot/click_bot.png"
              alt="chat-bg"
              fill
              className="object-fill pointer-events-none"
              style={{ zIndex: 0 }}
            />

            {/* 聊天组件 */}
            <ChatPanel
              onClose={() => setChatOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── 底部固定 Tab 栏：bot_tab.png 作为背景 ── */}
      <footer
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          backgroundImage: "url(/bot/bot_tab.png)",
          backgroundSize: "100% 100%",  // 强制图片铺满宽高，无留白
          backgroundRepeat: "no-repeat",
          height: "150px",
          margin: 0,  // 清除所有外边距
          padding: 0, // 清除所有内边距
          width: "100%",
        }}
      >
        <div className="absolute bottom-3 left-4 right-4">
          <div className="flex items-center gap-2 max-w-lg mx-auto">
            <input
              type="text"
              value=""
              readOnly
              onClick={() => setChatOpen(true)}
              placeholder="想找收藏过的某家餐厅？快来问我"
              className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none cursor-pointer"
              style={{
                background: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(200,230,245,0.8)",
                color: "#1A1A1A",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
            />
            <button
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: "#2C2C2C",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}
              onClick={() => setChatOpen(true)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </footer>

      {/* ── 动画 keyframes ── */}
      <style jsx global>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes slideBubbleRight {
          0%   { opacity: 0; transform: translateY(-50%) translateX(-12px) scale(0.85); }
          60%  { opacity: 1; transform: translateY(-50%) translateX(4px) scale(1.03); }
          100% { opacity: 1; transform: translateY(-50%) translateX(0) scale(1); }
        }
        @keyframes slideBubbleLeft {
          0%   { opacity: 0; transform: translateY(-50%) translateX(12px) scale(0.85); }
          60%  { opacity: 1; transform: translateY(-50%) translateX(-4px) scale(1.03); }
          100% { opacity: 1; transform: translateY(-50%) translateX(0) scale(1); }
        }
        @keyframes cardShake {
          0%, 100% { transform: rotate(var(--card-rotate)) translateY(var(--card-offsetY)); }
          15%      { transform: rotate(calc(var(--card-rotate) + 3deg)) translateY(var(--card-offsetY)) translateX(2px); }
          30%      { transform: rotate(calc(var(--card-rotate) - 3deg)) translateY(var(--card-offsetY)) translateX(-2px); }
          45%      { transform: rotate(calc(var(--card-rotate) + 2deg)) translateY(var(--card-offsetY)) translateX(1px); }
          60%      { transform: rotate(calc(var(--card-rotate) - 2deg)) translateY(var(--card-offsetY)) translateX(-1px); }
          75%      { transform: rotate(calc(var(--card-rotate) + 1deg)) translateY(var(--card-offsetY)); }
        }
      `}</style>
    </div>
  );
}
