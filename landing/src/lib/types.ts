export type FurnitureType =
  | "bed"
  | "sofa"
  | "armchair"
  | "desk"
  | "table"
  | "coffee"
  | "chair"
  | "wardrobe"
  | "dresser"
  | "nightstand"
  | "tvstand"
  | "shelf"
  | "plant"
  | "rug"
  | "kitchen";
export interface Size {
  w: number;
  h: number;
}
export interface Bounds extends Size {
  x: number;
  y: number;
}
export interface Furniture extends Bounds {
  id: string;
  type: FurnitureType;
  name: string;
  rot?: number;
  tone?: string;
  key?: string;
}
export interface CatalogItem extends Size {
  key: string;
  type: FurnitureType;
  name: string;
  cat: string;
}
export interface Opening {
  wall: "top" | "bottom" | "left" | "right";
  at: number;
  w: number;
  flip?: boolean;
}
export interface RoomTemplate {
  name: string;
  room: Size;
  floor: "oak" | "light" | "walnut" | "tile";
  items: Furniture[];
  doors: Opening[];
  windows: Opening[];
}
