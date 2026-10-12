import { z } from "zod";
export const uid = () => crypto.randomUUID();
const id = z.string().uuid(),
  number = z.number().finite();
export const pointSchema = z.object({
  x: number.min(-1e6).max(1e6),
  y: number.min(-1e6).max(1e6),
});
const polygon = z.array(pointSchema).min(3).max(200);
export const furnitureSchema = z.object({
  id,
  catalogId: z.string().max(100).optional(),
  floorId: id,
  name: z.string().min(1).max(120),
  type: z.string().max(40),
  category: z.string().max(80),
  x: number.min(-1e6).max(1e6),
  y: number.min(-1e6).max(1e6),
  width: number.min(10).max(20000),
  depth: number.min(10).max(20000),
  height: number.min(0).max(20000),
  angle: number.min(-3600).max(3600),
  contour: z
    .array(z.object({ x: number.min(0).max(1), y: number.min(0).max(1) }))
    .min(3)
    .max(200)
    .optional(),
  locked: z.boolean().default(false),
  groupId: id.optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#cbb99e"),
  clearance: number.min(0).max(3000).default(0),
  shopping: z
    .object({
      owned: z.boolean(),
      price: number.min(0).max(1e10),
      store: z.string().max(200),
      url: z
        .string()
        .max(2000)
        .refine((v) => !v || /^https?:\/\//i.test(v), "Только http/https"),
      note: z.string().max(2000),
    })
    .default({ owned: false, price: 0, store: "", url: "", note: "" }),
});
export const wallSchema = z.object({
  id,
  roomId: id.optional(),
  start: pointSchema,
  end: pointSchema,
  thickness: number.min(20).max(1000),
  height: number.min(500).max(20000),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#34383c"),
});
export const openingSchema = z.object({
  id,
  wallId: id,
  kind: z.enum(["door", "double", "sliding", "window"]),
  offset: number.min(0),
  width: number.min(100).max(10000),
  height: number.min(100).max(10000),
  sill: number.min(0).max(10000),
  flip: z.boolean(),
  inward: z.boolean(),
});
export const floorSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  rooms: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(120),
        type: z.string().max(60),
        points: polygon,
        height: number.min(500).max(20000),
        floor: z.enum(["oak", "light", "walnut", "tile"]),
      }),
    )
    .max(50),
  walls: z.array(wallSchema).max(500),
  openings: z.array(openingSchema).max(200),
  measurements: z
    .array(z.object({ id, start: pointSchema, end: pointSchema }))
    .max(200),
  zones: z
    .array(
      z.object({
        id,
        name: z.string().max(120),
        points: polygon,
        forbidden: z.boolean(),
      }),
    )
    .max(100),
  annotations: z
    .array(z.object({ id, point: pointSchema, text: z.string().max(500) }))
    .max(200),
  underlay: z
    .object({
      src: z
        .string()
        .max(6e6)
        .refine((v) => /^data:image\/(png|jpeg|webp);base64,/.test(v)),
      x: number,
      y: number,
      width: number.min(1).max(1e6),
      height: number.min(1).max(1e6),
      opacity: number.min(0).max(1),
    })
    .optional(),
});
export const documentSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(120),
  units: z.enum(["cm", "m", "ft"]),
  floors: z.array(floorSchema).min(1).max(20),
  variants: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(120),
        items: z.array(furnitureSchema).max(500),
      }),
    )
    .min(1)
    .max(30),
  activeVariantId: id,
  settings: z.object({
    clearance: number.min(0).max(3000),
    gridSize: number.min(1).max(1000),
    snap: z.boolean(),
    layers: z.object({
      walls: z.boolean(),
      openings: z.boolean(),
      furniture: z.boolean(),
      dimensions: z.boolean(),
      names: z.boolean(),
      zones: z.boolean(),
      underlay: z.boolean(),
      grid: z.boolean(),
    }),
  }),
});
export type Point = z.infer<typeof pointSchema>;
export type Furniture = z.infer<typeof furnitureSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Opening = z.infer<typeof openingSchema>;
export type Floor = z.infer<typeof floorSchema>;
export type ProjectDocument = z.infer<typeof documentSchema>;
export type Variant = ProjectDocument["variants"][number];
export type Room = Floor["rooms"][number];
export type CatalogItem = Pick<
  Furniture,
  | "name"
  | "type"
  | "category"
  | "width"
  | "depth"
  | "height"
  | "color"
  | "clearance"
  | "contour"
> & { id: string; tags: string[] };
export const unitFactor = (unit: ProjectDocument["units"]) =>
  unit === "m" ? 1000 : unit === "ft" ? 304.8 : 10;
export const toDisplay = (mm: number, unit: ProjectDocument["units"]) =>
  Number((mm / unitFactor(unit)).toFixed(3));
export const fromDisplay = (
  value: string | number,
  unit: ProjectDocument["units"],
) => Math.round(Number(String(value).replace(",", ".")) * unitFactor(unit));
export const formatLength = (
  mm: number,
  unit: ProjectDocument["units"] = "cm",
) =>
  `${toDisplay(mm, unit).toLocaleString("ru-RU")} ${unit === "ft" ? "ft" : unit === "m" ? "м" : "см"}`;
export function rectangle(width: number, depth: number, x = 0, y = 0): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}
export function makeRoom(
  name: string,
  points: Point[],
  floor: Room["floor"] = "oak",
): { room: Room; walls: Wall[] } {
  if (
    points.reduce(
      (s, p, i) =>
        s +
        p.x * points[(i + 1) % points.length].y -
        p.y * points[(i + 1) % points.length].x,
      0,
    ) < 0
  )
    points = [...points].reverse();
  const room: Room = {
    id: uid(),
    name,
    type: "room",
    points,
    height: 2800,
    floor,
  };
  return {
    room,
    walls: points.map((start, i) => ({
      id: uid(),
      roomId: room.id,
      start: { ...start },
      end: { ...points[(i + 1) % points.length] },
      thickness: 100,
      height: 2800,
      color: "#34383c",
    })),
  };
}
export function createDocument(
  name = "Моя комната",
  width = 4000,
  depth = 3200,
  shape = "rectangle",
): ProjectDocument {
  const points =
    shape === "l"
      ? [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: depth * 0.55 },
          { x: width * 0.55, y: depth * 0.55 },
          { x: width * 0.55, y: depth },
          { x: 0, y: depth },
        ]
      : shape === "u"
        ? [
            { x: 0, y: 0 },
            { x: width * 0.3, y: 0 },
            { x: width * 0.3, y: depth * 0.5 },
            { x: width * 0.7, y: depth * 0.5 },
            { x: width * 0.7, y: 0 },
            { x: width, y: 0 },
            { x: width, y: depth },
            { x: 0, y: depth },
          ]
        : rectangle(width, depth);
  const { room, walls } = makeRoom(name, points),
    floorId = uid(),
    variantId = uid();
  return {
    schemaVersion: 1,
    name,
    units: "cm",
    floors: [
      {
        id: floorId,
        name: "1 этаж",
        rooms: [room],
        walls,
        openings: [],
        measurements: [],
        zones: [],
        annotations: [],
      },
    ],
    variants: [{ id: variantId, name: "Вариант 1", items: [] }],
    activeVariantId: variantId,
    settings: {
      clearance: 800,
      gridSize: 100,
      snap: true,
      layers: {
        walls: true,
        openings: true,
        furniture: true,
        dimensions: true,
        names: false,
        zones: true,
        underlay: true,
        grid: true,
      },
    },
  };
}
export function instantiate(
  catalog: CatalogItem,
  floorId: string,
  point: Point,
): Furniture {
  return furnitureSchema.parse({
    ...catalog,
    id: uid(),
    catalogId: catalog.id,
    floorId,
    ...point,
    angle: 0,
    locked: false,
    shopping: { owned: false, price: 0, store: "", url: "", note: "" },
  });
}
