// Shared by the database schema, the browser and the server, so it must not import "server-only"

// In palette order: a new group takes the least used color, the earliest one on a tie
export const groupColors = ["green", "yellow", "peach", "pink", "lilac", "blue", "teal", "gray"] as const;

export type GroupColor = (typeof groupColors)[number];

// Read by screen readers and shown in hints
export const groupColorLabels: Record<GroupColor, string> = {
  green: "Зелёный",
  yellow: "Жёлтый",
  peach: "Персиковый",
  pink: "Розовый",
  lilac: "Сиреневый",
  blue: "Голубой",
  teal: "Бирюзовый",
  gray: "Серый",
};

// Full class names, so Tailwind finds them in the source and keeps them in the build
export const groupColorClasses: Record<GroupColor, string> = {
  green: "bg-group-green",
  yellow: "bg-group-yellow",
  peach: "bg-group-peach",
  pink: "bg-group-pink",
  lilac: "bg-group-lilac",
  blue: "bg-group-blue",
  teal: "bg-group-teal",
  gray: "bg-group-gray",
};

export function pickNewGroupColor(usedColors: readonly GroupColor[]): GroupColor {
  const uses = (color: GroupColor) => usedColors.filter((used) => used === color).length;
  // reduce keeps the earlier color on a tie, which is the palette order
  return groupColors.reduce((best, color) => (uses(color) < uses(best) ? color : best));
}
