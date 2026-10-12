import { createElement } from "react";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { type ProjectDocument, formatLength } from "@roomfit/core";
import { PlanContent, planBounds } from "./Plan";
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function downloadJSON(doc: ProjectDocument) {
  download(
    new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
    `${doc.name}.roomfit.json`,
  );
}
interface ExportOptions {
  format: "png" | "svg" | "pdf";
  floorId: string;
  roomId?: string;
  variantId: string;
  resolution: number;
  paper: "a4" | "a3";
  orientation: "portrait" | "landscape";
  scale: number;
  mono: boolean;
  names: boolean;
  dimensions: boolean;
  furniture: boolean;
  area: boolean;
}
export async function exportPlan(doc: ProjectDocument, options: ExportOptions) {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const floor = doc.floors.find((f) => f.id === options.floorId)!,
    variant = doc.variants.find((v) => v.id === options.variantId)!,
    items = variant.items.filter((i) => i.floorId === floor.id);
  const exportFloor = options.roomId
    ? { ...floor, rooms: floor.rooms.filter((r) => r.id === options.roomId) }
    : floor;
  let b = planBounds(exportFloor, options.roomId ? [] : items);
  // A room selection scopes the drawing viewport; the default whole-floor export includes all objects.
  const scope = {
    ...doc,
    settings: {
      ...doc.settings,
      layers: {
        ...doc.settings.layers,
        grid: false,
        names: options.names,
        dimensions: options.dimensions,
        furniture: options.furniture,
      },
    },
  };
  const drawing = renderToStaticMarkup(
    createElement(PlanContent, { floor: exportFloor, items, doc: scope }),
  );
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
  const legend = items
    .map(
      (i) =>
        `${i.name} · ${formatLength(i.width, doc.units)} × ${formatLength(i.depth, doc.units)} × ${formatLength(i.height, doc.units)} · ${i.shopping.owned ? "уже есть" : "купить"} · ${i.shopping.price.toLocaleString("ru-RU")}`,
    )
    .join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.resolution}" height="${Math.round((options.resolution * b.height) / b.width)}" viewBox="${b.x} ${b.y} ${b.width} ${b.height}"><style>text{font-family:Arial,sans-serif}${options.mono ? "g{filter:grayscale(1)}" : ""}</style><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="white"/>${drawing}</svg>`;
  if (options.format === "svg") {
    download(new Blob([svg], { type: "image/svg+xml" }), `${doc.name}.svg`);
    return;
  }
  const image = await rasterize(
    svg,
    options.resolution,
    Math.round((options.resolution * b.height) / b.width),
  );
  if (options.format === "png") {
    download(await canvasBlob(image), `${doc.name}.png`);
    return;
  }
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
      orientation: options.orientation,
      format: options.paper,
      unit: "mm",
    }),
    pw = pdf.internal.pageSize.getWidth(),
    ph = pdf.internal.pageSize.getHeight();
  const realW = b.width / options.scale,
    realH = b.height / options.scale,
    maxW = pw - 24,
    maxH = ph - 46;
  if (realW > maxW || realH > maxH)
    throw new Error(
      `При масштабе 1:${options.scale} план занимает ${Math.ceil(realW)} × ${Math.ceil(realH)} мм. Выбери больший знаменатель масштаба или лист A3.`,
    );
  const header = await textImage(
    [
      doc.name,
      `${floor.name} · ${variant.name} · масштаб 1:${options.scale} · ${new Date().toLocaleDateString("ru-RU")}`,
    ],
    1500,
  );
  pdf.addImage(
    header.toDataURL("image/png"),
    "PNG",
    12,
    8,
    pw - 24,
    Math.min(22, ((pw - 24) * header.height) / header.width),
  );
  pdf.addImage(
    image.toDataURL("image/png"),
    "PNG",
    (pw - realW) / 2,
    34,
    realW,
    realH,
  );
  const lines = [
    `Мебель: ${items.length} предметов. Стоимость к покупке: ${items
      .filter((i) => !i.shopping.owned)
      .reduce((s, i) => s + i.shopping.price, 0)
      .toLocaleString("ru-RU")}`,
    ...legend.split("\n"),
    "Размеры зависят от точности исходных замеров. Проверяй габариты перед покупкой.",
  ];
  for (let start = 0; start < lines.length; start += 28) {
    pdf.addPage();
    const page = await textImage(
      lines
        .slice(start, start + 28)
        .map(escape)
        .map((s) => s.replace(/&amp;/g, "&")),
      1600,
    );
    pdf.addImage(
      page.toDataURL("image/png"),
      "PNG",
      12,
      12,
      pw - 24,
      Math.min(ph - 24, ((pw - 24) * page.height) / page.width),
    );
  }
  pdf.save(`${doc.name}.pdf`);
}
async function rasterize(svg: string, width: number, height: number) {
  if (width * height > 32e6)
    throw Error("Экспорт больше 32 мегапикселей. Уменьши разрешение.");
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
const canvasBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error("Не удалось создать изображение"))),
      "image/png",
    ),
  );
async function textImage(lines: string[], width: number) {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 35 + lines.length * 48;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, canvas.height);
  ctx.font = "28px Manrope Variable, Arial";
  ctx.fillStyle = "#343a36";
  lines.forEach((s, i) => ctx.fillText(s, 18, 38 + i * 48, width - 36));
  return canvas;
}
export async function readUnderlay(file: File) {
  if (file.size > 15e6) throw Error("Файл больше 15 МБ");
  let source: HTMLImageElement | HTMLCanvasElement;
  if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  ) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const pdf = await task.promise;
    try {
      const page = await pdf.getPage(1),
        viewport = page.getViewport({
          scale: Math.min(2, 1800 / page.getViewport({ scale: 1 }).width),
        }),
        canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      source = canvas;
    } finally {
      await task.destroy();
    }
  } else {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
      throw Error("Выбери PNG, JPG, WebP или PDF");
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      source = img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const width =
      source instanceof HTMLImageElement ? source.naturalWidth : source.width,
    height =
      source instanceof HTMLImageElement ? source.naturalHeight : source.height,
    ratio = Math.min(1, 1800 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { src: canvas.toDataURL("image/jpeg", 0.8), ratio: height / width };
}
