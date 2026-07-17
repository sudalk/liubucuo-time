// 事件颜色：与原型 eventColor 一致的 5 色柔光方案
// 颜色变量来自 DESIGN.md 的 Soft Spectrum

const PALETTE = [
  "var(--mist-blue)",
  "var(--lilac)",
  "var(--mint)",
  "var(--apricot)",
  "var(--blush)"
];

// 熟悉事件固定颜色，与原型对齐
const FAMILIAR: Record<string, number> = {
  慢跑: 0,
  英语听力: 1,
  整理网站首页: 3,
  吃饭: 4,
  工作: 3,
  睡眠: 1,
  通勤: 0,
  洗漱: 2,
  阅读: 0,
  上厕所: 2,
  游戏: 4
};

function hashIndex(name: string): number {
  let n = 2166136261;
  for (const c of String(name)) {
    n = (n * 31 + c.charCodeAt(0)) >>> 0;
  }
  return n % PALETTE.length;
}

export function eventColor(name: string): string {
  if (Object.prototype.hasOwnProperty.call(FAMILIAR, name)) {
    return PALETTE[FAMILIAR[name]!];
  }
  return PALETTE[hashIndex(name)]!;
}
