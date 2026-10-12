import type { Furniture, RoomTemplate } from "./types";
import { aabb } from "./geometry";

/** Offline PNG export: a readable measured diagram with a furniture legend. */
export function exportPlan(template: RoomTemplate, items: Furniture[]) {
  const scale = 1.8,
    padding = 90;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(template.room.w * scale + padding * 2);
  canvas.height = Math.ceil(
    template.room.h * scale + padding * 2 + 50 + items.length * 26,
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("В браузере недоступен экспорт изображений");
  ctx.fillStyle = "#f8f7f4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1e1e22";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(`RoomFit · ${template.name}`, padding, 38);
  ctx.font = "16px sans-serif";
  ctx.fillText(`${template.room.w} × ${template.room.h} см`, padding, 66);
  ctx.save();
  ctx.translate(padding, padding);
  ctx.fillStyle = "#dcc6a2";
  ctx.fillRect(0, 0, template.room.w * scale, template.room.h * scale);
  ctx.strokeStyle = "#2e2e33";
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, template.room.w * scale, template.room.h * scale);
  template.windows.forEach((w) => {
    ctx.fillStyle = "#b8d5e0";
    const hor = w.wall === "top" || w.wall === "bottom";
    ctx.fillRect(
      hor ? w.at * scale : w.wall === "left" ? -4 : template.room.w * scale - 4,
      hor
        ? w.wall === "top"
          ? -4
          : template.room.h * scale - 4
        : w.at * scale,
      hor ? w.w * scale : 8,
      hor ? 8 : w.w * scale,
    );
  });
  template.doors.forEach((d) => {
    const s = d.w * scale;
    const x =
      d.wall === "left"
        ? 0
        : d.wall === "right"
          ? template.room.w * scale
          : d.at * scale;
    const y =
      d.wall === "top"
        ? 0
        : d.wall === "bottom"
          ? template.room.h * scale
          : d.at * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(
      ({ bottom: 0, left: 90, top: 180, right: 270 }[d.wall] * Math.PI) / 180,
    );
    ctx.fillStyle = "#dcc6a2";
    ctx.fillRect(0, -4, s, 8);
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, s, -Math.PI / 2, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -s);
    ctx.stroke();
    ctx.restore();
  });
  const colors: Record<string, string> = {
    bed: "#e3d8c6",
    sofa: "#6a8670",
    plant: "#5fa768",
    rug: "#ebe3d5",
    wardrobe: "#b99463",
  };
  [...items]
    .sort((a, b) => Number(b.type === "rug") - Number(a.type === "rug"))
    .forEach((item) => {
      const b = aabb(item);
      ctx.fillStyle = item.tone || colors[item.type] || "#c79c6a";
      ctx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
      ctx.strokeStyle = "#6b6255";
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
      ctx.fillStyle = "#1e1e22";
      ctx.font = "14px sans-serif";
      ctx.fillText(
        item.name,
        b.x * scale + 6,
        b.y * scale + 20,
        Math.max(1, b.w * scale - 12),
      );
    });
  ctx.restore();
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#1e1e22";
  const legendY = padding + template.room.h * scale + 45;
  items.forEach((item, index) =>
    ctx.fillText(
      `${item.name} — ${item.w} × ${item.h} см`,
      padding,
      legendY + index * 26,
    ),
  );
  const link = document.createElement("a");
  link.download = "roomfit-plan.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}
