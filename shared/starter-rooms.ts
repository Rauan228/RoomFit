// Public examples use centimetres and top-left bounds. Conversion to the
// editor's millimetres and centres happens only when the user creates a copy.
export const STARTER_ROOMS = {
  bedroom12: {
    name: "Спальня 12 м²",
    w: 400,
    h: 300,
    doors: [{ wall: "bottom", at: 310, w: 80 }],
    windows: [{ wall: "top", at: 140, w: 120 }],
    items: [
      {
        id: "bed",
        type: "bed",
        catalogId: "bed-double",
        name: "Кровать",
        w: 160,
        h: 200,
        x: 120,
        y: 0,
      },
      {
        id: "wardrobe",
        type: "wardrobe",
        catalogId: "wardrobe",
        name: "Шкаф",
        w: 180,
        h: 60,
        x: 0,
        y: 0,
        rot: 90,
      },
      {
        id: "desk",
        type: "desk",
        catalogId: "desk",
        name: "Стол",
        w: 100,
        h: 50,
        x: 0,
        y: 250,
      },
    ],
  },
  small9: {
    name: "Комната 9 м²",
    w: 300,
    h: 300,
    doors: [{ wall: "bottom", at: 210, w: 80 }],
    windows: [{ wall: "top", at: 100, w: 100 }],
    items: [
      {
        id: "bed",
        type: "bed",
        catalogId: "bed-single",
        name: "Кровать",
        w: 90,
        h: 200,
        x: 0,
        y: 0,
      },
      {
        id: "wardrobe",
        type: "wardrobe",
        catalogId: "wardrobe",
        name: "Шкаф",
        w: 120,
        h: 60,
        x: 180,
        y: 0,
      },
      {
        id: "desk",
        type: "desk",
        catalogId: "desk",
        name: "Стол",
        w: 120,
        h: 60,
        x: 180,
        y: 120,
      },
      {
        id: "chair",
        type: "chair",
        catalogId: "chair",
        name: "Стул",
        w: 45,
        h: 50,
        x: 160,
        y: 200,
      },
    ],
  },
  living: {
    name: "Гостиная 12,8 м²",
    w: 400,
    h: 320,
    doors: [{ wall: "bottom", at: 310, w: 80 }],
    windows: [{ wall: "top", at: 150, w: 140 }],
    items: [
      {
        id: "sofa",
        type: "sofa",
        catalogId: "sofa",
        name: "Диван",
        w: 220,
        h: 95,
        x: 0,
        y: 140,
      },
      {
        id: "coffee",
        type: "coffee",
        catalogId: "coffee",
        name: "Столик",
        w: 80,
        h: 55,
        x: 70,
        y: 30,
      },
      {
        id: "shelf",
        type: "shelf",
        catalogId: "shelf",
        name: "Стеллаж",
        w: 35,
        h: 120,
        x: 365,
        y: 0,
      },
    ],
  },
  measure: {
    name: "План комнаты 4 × 3,2 м",
    w: 400,
    h: 320,
    doors: [{ wall: "bottom", at: 310, w: 80 }],
    windows: [{ wall: "top", at: 150, w: 140 }],
    items: [],
  },
} satisfies Record<
  string,
  {
    name: string;
    w: number;
    h: number;
    doors: {
      wall: "top" | "bottom" | "left" | "right";
      at: number;
      w: number;
    }[];
    windows: {
      wall: "top" | "bottom" | "left" | "right";
      at: number;
      w: number;
    }[];
    items: {
      id: string;
      type: string;
      catalogId: string;
      name: string;
      w: number;
      h: number;
      x: number;
      y: number;
      rot?: number;
    }[];
  }
>;
export type StarterKey = keyof typeof STARTER_ROOMS;
export function starterKey(value: string | null): StarterKey | null {
  return value && Object.hasOwn(STARTER_ROOMS, value)
    ? (value as StarterKey)
    : null;
}
