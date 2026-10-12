import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Download,
  Share2,
  MousePointer2,
  Hand,
  PencilRuler,
  Ruler,
  Square,
  StickyNote,
  SearchCheck,
  ScanLine,
  Plus,
  Minus,
  Maximize,
  ChevronDown,
  Menu,
  X,
  Check,
  Layers,
  ShoppingBag,
  GitCompare,
  WandSparkles,
} from "lucide-react";
import {
  analyzeFloor,
  routeClearance,
  bounds,
  distance,
  snap,
  selfIntersects,
  makeRoom,
  uid,
  rectangle,
  moveWallVertex,
  furniturePolygon,
  instantiate,
  smartLayouts,
  whatFits,
  documentSchema,
  type Point,
  type Furniture,
  type CatalogItem,
  type Floor,
  type ProjectDocument,
  type Variant,
} from "@roomfit/core";
import { request, catalog as loadCatalog, type Project } from "./api";
import { useAuth } from "./App";
import { useProject } from "./useProject";
import { PlanContent, planBounds, polygonPoints } from "./Plan";
import { Logo, Loading, ErrorBox, Modal } from "./components";
import { Inspector } from "./Inspector";
import {
  ExportDialog,
  ShareDialog,
  CompareDialog,
  ShoppingDialog,
  VersionsDialog,
  CustomFurnitureDialog,
} from "./EditorDialogs";
import { downloadJSON, readUnderlay } from "./exports";
export type Tool =
  | "select"
  | "pan"
  | "room"
  | "wall"
  | "measure"
  | "zone"
  | "annotation"
  | "fit"
  | "calibrate";
type View = { x: number; y: number; width: number; height: number };
type Drag = {
  kind: "items" | "pan" | "lasso" | "vertex" | "rotate" | "resize";
  start: Point;
  items?: Furniture[];
  vertex?: Point;
  originalView?: View;
};
export function EditorPage() {
  const { id } = useParams(),
    [project, setProject] = useState<Project | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request<Project>(`/projects/${id}`)
      .then((p) => {
        if (active) setProject(p);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [id]);
  if (error)
    return (
      <div className="loading">
        <ErrorBox error={error} />
        <Link to="/">Вернуться к проектам</Link>
      </div>
    );
  return project ? <Editor key={project.id} project={project} /> : <Loading />;
}
export function SharedPage() {
  const { token } = useParams(),
    [project, setProject] = useState<Project | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    request<{ name: string; document: ProjectDocument; version: number }>(
      `/shared/${token}`,
    )
      .then((p) =>
        setProject({
          ...p,
          id: "shared",
          favorite: false,
          archived: false,
          deletedAt: null,
          updatedAt: "",
        }),
      )
      .catch((e) => setError(e.message));
  }, [token]);
  if (error)
    return (
      <div className="loading">
        <ErrorBox error={error} />
        <Link to="/register">Создать свой проект</Link>
      </div>
    );
  return project ? <Editor project={project} readOnly /> : <Loading />;
}
export function Editor({
  project,
  readOnly = false,
}: {
  project: Project;
  readOnly?: boolean;
}) {
  const { user } = useAuth(),
    store = useProject(project, user?.id || "guest", readOnly),
    { doc, change, begin, commit } = store;
  const [viewVariant, setViewVariant] = useState(doc.activeVariantId);
  const [floorId, setFloorId] = useState(doc.floors[0].id),
    floor = doc.floors.find((f) => f.id === floorId) || doc.floors[0],
    variant =
      doc.variants.find(
        (v) => v.id === (readOnly ? viewVariant : doc.activeVariantId),
      ) || doc.variants[0];
  const [selected, setSelected] = useState<string[]>([]),
    [entity, setEntity] = useState({ id: "", kind: "" }),
    [tool, setTool] = useState<Tool>(readOnly ? "pan" : "select"),
    [panel, setPanel] = useState("catalog"),
    [mobilePanel, setMobilePanel] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]),
    [personal, setPersonal] = useState<CatalogItem[]>([]),
    [error, setError] = useState(""),
    [hint, setHint] = useState(""),
    [dialog, setDialog] = useState(""),
    [route, setRoute] = useState(false),
    [fits, setFits] = useState<ReturnType<typeof whatFits> | null>(null),
    [autoWorking, setAutoWorking] = useState(false);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const svg = useRef<SVGSVGElement>(null),
    canvasHost = useRef<HTMLDivElement>(null),
    drag = useRef<Drag | null>(null),
    pointerMap = useRef(new Map<number, Point>()),
    pinch = useRef<{
      distance: number;
      view: View;
      center: Point;
      zoom: number;
    } | null>(null);
  const [view, setView] = useState<View>(() =>
      planBounds(floor, variant.items),
    ),
    viewRef = useRef(view),
    [zoom, setZoom] = useState(1),
    [draft, setDraft] = useState<Point[]>([]),
    [cursor, setCursor] = useState<Point | null>(null),
    [lasso, setLasso] = useState<Point[] | null>(null);
  viewRef.current = view;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const clipboard = useRef<Furniture[]>([]);
  const analysis = useMemo(
    () => analyzeFloor(floor, variant.items, doc.settings.clearance),
    [floor, variant.items, doc.settings.clearance],
  );
  const routeResult = useMemo(
    () =>
      route
        ? routeClearance(floor, variant.items, doc.settings.clearance)
        : null,
    [route, floor, variant.items, doc.settings.clearance],
  );
  useEffect(() => {
    loadCatalog()
      .then(setCatalog)
      .catch((e) => setError(e.message));
    if (!readOnly)
      request<CatalogItem[]>("/furniture")
        .then(setPersonal)
        .catch((e) => setError(e.message));
  }, [readOnly]);
  const updateFloor = useCallback(
    (fn: (floor: Floor) => void, transient = false) =>
      change((d) => fn(d.floors.find((f) => f.id === floor.id)!), transient),
    [change, floor.id],
  );
  const updateVariant = useCallback(
    (fn: (v: Variant) => void, transient = false) =>
      change(
        (d) => fn(d.variants.find((v) => v.id === d.activeVariantId)!),
        transient,
      ),
    [change],
  );
  const fitView = useCallback(() => {
    const b = planBounds(floor, variant.items);
    if ((canvasHost.current?.clientWidth || 1000) < 640) {
      b.x -= 600;
      b.width += 600;
    }
    const host = canvasHost.current,
      ratio = host ? host.clientWidth / Math.max(1, host.clientHeight) : 1.4,
      width = Math.max(b.width, b.height * ratio),
      height = width / ratio;
    setView({
      x: b.x - (width - b.width) / 2,
      y: b.y - (height - b.height) / 2,
      width,
      height,
    });
    setZoom(1);
  }, [floor, variant.items]);
  useEffect(() => {
    fitView();
    setSelected([]);
    setEntity({ id: "", kind: "" });
    setDraft([]);
  }, [floor.id]);
  const screenPoint = useCallback((clientX: number, clientY: number) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }, []);
  const snapped = (p: Point) =>
    doc.settings.snap
      ? snap(
          p,
          floor,
          doc.settings.gridSize,
          svg.current?.getScreenCTM()?.a || 1,
        )
      : p;
  const zoomBy = useCallback((factor: number, center?: Point) => {
    const z = zoomRef.current;
    const next = Math.max(0.1, Math.min(8, z * factor)),
      ratio = z / next;
    zoomRef.current = next;
    setView((v) => {
      const p = center || { x: v.x + v.width / 2, y: v.y + v.height / 2 };
      return {
        x: p.x - (p.x - v.x) * ratio,
        y: p.y - (p.y - v.y) * ratio,
        width: v.width * ratio,
        height: v.height * ratio,
      };
    });
    setZoom(next);
  }, []);
  useEffect(() => {
    const node = svg.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0015), screenPoint(e.clientX, e.clientY));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [zoomBy, screenPoint]);
  const selectEntity = (
    id: string,
    kind: string,
    e: React.PointerEvent<SVGElement>,
  ) => {
    if (tool !== "select" || readOnly) return;
    e.stopPropagation();
    setSelected([]);
    setEntity({ id, kind });
    setPanel("properties");
  };
  const startItems = (item: Furniture, e: React.PointerEvent<SVGGElement>) => {
    if (readOnly || tool !== "select") return;
    e.stopPropagation();
    setEntity({ id: "", kind: "" });
    const ids = e.shiftKey
      ? selected.includes(item.id)
        ? selected.filter((id) => id !== item.id)
        : [...selected, item.id]
      : selected.includes(item.id)
        ? selected
        : item.groupId
          ? variant.items
              .filter((i) => i.groupId === item.groupId)
              .map((i) => i.id)
          : [item.id];
    setSelected(ids);
    setPanel("properties");
    if (!item.locked) {
      begin();
      drag.current = {
        kind: "items",
        start: screenPoint(e.clientX, e.clientY),
        items: variant.items
          .filter((i) => ids.includes(i.id) && !i.locked)
          .map((i) => ({ ...i })),
      };
      svg.current!.setPointerCapture(e.pointerId);
    }
  };
  const addItem = (c: CatalogItem, position?: Point, angle = 0) => {
    const center = position || {
        x: view.x + view.width / 2,
        y: view.y + view.height / 2,
      },
      item = { ...instantiate(c, floor.id, snapped(center)), angle };
    updateVariant((v) => v.items.push(item));
    setSelected([item.id]);
    setEntity({ id: "", kind: "" });
    setPanel("properties");
    setMobilePanel(false);
    setHint("Добавлено. Перетаскивай или введи координаты в свойствах.");
  };
  const deleteSelected = useCallback(() => {
    if (readOnly) return;
    if (selected.length) {
      updateVariant((v) => {
        v.items = v.items.filter((i) => !selected.includes(i.id) || i.locked);
      });
      setSelected([]);
    } else if (entity.id) {
      updateFloor((f) => {
        if (entity.kind === "room") {
          const ids = f.walls
            .filter((w) => w.roomId === entity.id)
            .map((w) => w.id);
          f.rooms = f.rooms.filter((r) => r.id !== entity.id);
          f.walls = f.walls.filter((w) => !ids.includes(w.id));
          f.openings = f.openings.filter((o) => !ids.includes(o.wallId));
        } else if (entity.kind === "wall") {
          if (f.walls.find((w) => w.id === entity.id)?.roomId) {
            setHint(
              "Стена связана с контуром комнаты. Удали комнату или перемести её вершину.",
            );
            return;
          }
          f.walls = f.walls.filter((w) => w.id !== entity.id);
          f.openings = f.openings.filter((o) => o.wallId !== entity.id);
        } else if (entity.kind === "opening")
          f.openings = f.openings.filter((o) => o.id !== entity.id);
        else if (entity.kind === "zone")
          f.zones = f.zones.filter((z) => z.id !== entity.id);
        else if (entity.kind === "measurement")
          f.measurements = f.measurements.filter((m) => m.id !== entity.id);
        else if (entity.kind === "annotation")
          f.annotations = f.annotations.filter((a) => a.id !== entity.id);
      });
      setEntity({ id: "", kind: "" });
    }
  }, [selected, entity, readOnly, updateVariant, updateFloor]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,dialog"))
        return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") {
        setTool(readOnly ? "pan" : "select");
        setDraft([]);
        setSelected([]);
        setEntity({ id: "", kind: "" });
        setMobilePanel(false);
      }
      if (ctrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void store.save();
      }
      if (readOnly) return;
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? store.redo() : store.undo();
      }
      if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
      }
      if (ctrl && e.key.toLowerCase() === "c") {
        clipboard.current = variant.items
          .filter((i) => selected.includes(i.id))
          .map((i) => structuredClone(i));
      }
      if (ctrl && e.key.toLowerCase() === "v" && clipboard.current.length) {
        e.preventDefault();
        const groups = new Map<string, string>();
        const copies = clipboard.current.map((i) => ({
          ...structuredClone(i),
          id: uid(),
          floorId: floor.id,
          x: i.x + 100,
          y: i.y + 100,
          locked: false,
          groupId: i.groupId
            ? groups.get(i.groupId) ||
              (groups.set(i.groupId, uid()), groups.get(i.groupId))
            : undefined,
        }));
        updateVariant((v) => v.items.push(...copies));
        setSelected(copies.map((i) => i.id));
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key.toLowerCase() === "r")
        updateVariant((v) =>
          v.items.forEach((i) => {
            if (selected.includes(i.id) && !i.locked)
              i.angle += e.shiftKey ? 15 : 90;
          }),
        );
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) &&
        selected.length
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 100 : 10;
        updateVariant((v) =>
          v.items.forEach((i) => {
            if (selected.includes(i.id) && !i.locked) {
              i.x +=
                e.key === "ArrowLeft"
                  ? -step
                  : e.key === "ArrowRight"
                    ? step
                    : 0;
              i.y +=
                e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
            }
          }),
        );
      }
      if (e.code === "Space") {
        e.preventDefault();
        setTool("pan");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    doc,
    selected,
    entity,
    floor.id,
    readOnly,
    store.undo,
    store.redo,
    store.save,
    updateVariant,
    deleteSelected,
  ]);
  const finishPolygon = () => {
    if (draft.length < 3) {
      setHint("Нужны минимум три точки.");
      return;
    }
    if (selfIntersects(draft)) {
      setHint("Контур пересекает сам себя. Исправь точки или начни заново.");
      return;
    }
    updateFloor((f) => {
      if (tool === "room") {
        const r = makeRoom(`Комната ${f.rooms.length + 1}`, draft);
        f.rooms.push(r.room);
        f.walls.push(...r.walls);
      } else
        f.zones.push({
          id: uid(),
          name: "Зона",
          points: draft,
          forbidden: true,
        });
    });
    setDraft([]);
    setTool("select");
  };
  const pointAction = (p: Point) => {
    if (tool === "room" || tool === "zone") {
      if (draft.length >= 3 && distance(p, draft[0]) < view.width / 45) {
        finishPolygon();
        return;
      }
      setDraft([...draft, p]);
    }
    if (tool === "annotation") {
      const text = prompt("Подпись на плане");
      if (text)
        updateFloor((f) =>
          f.annotations.push({ id: uid(), point: p, text: text.slice(0, 500) }),
        );
      setTool("select");
    }
    if (["wall", "measure", "fit", "calibrate"].includes(tool)) {
      if (!draft.length) {
        setDraft([p]);
        return;
      }
      const start = draft[0];
      if (distance(start, p) < 1) return;
      if (tool === "wall")
        updateFloor((f) =>
          f.walls.push({
            id: uid(),
            start,
            end: p,
            thickness: 100,
            height: 2800,
            color: "#34383c",
          }),
        );
      if (tool === "measure")
        updateFloor((f) => f.measurements.push({ id: uid(), start, end: p }));
      if (tool === "fit") {
        setFits(
          whatFits(
            floor,
            variant.items,
            rectangle(
              Math.abs(p.x - start.x),
              Math.abs(p.y - start.y),
              Math.min(p.x, start.x),
              Math.min(p.y, start.y),
            ),
            [...catalog, ...personal],
            doc.settings.clearance,
          ),
        );
        setPanel("fits");
        setMobilePanel(true);
      }
      if (tool === "calibrate" && floor.underlay) {
        const length = prompt("Известная длина между точками, в сантиметрах");
        if (length && Number(length.replace(",", ".")) > 0) {
          const factor =
            (Number(length.replace(",", ".")) * 10) / distance(start, p);
          updateFloor((f) => {
            const u = f.underlay!;
            u.x = start.x + (u.x - start.x) * factor;
            u.y = start.y + (u.y - start.y) * factor;
            u.width *= factor;
            u.height *= factor;
          });
          setHint(
            "Масштаб подложки откалиброван. Обведи стены инструментом «Комната».",
          );
        }
      }
      setDraft([]);
      setTool("select");
    }
  };
  const pointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = screenPoint(e.clientX, e.clientY);
    pointerMap.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.current!.setPointerCapture(e.pointerId);
    if (pointerMap.current.size === 2) {
      if (drag.current) commit();
      drag.current = null;
      const [a, b] = [...pointerMap.current.values()];
      pinch.current = {
        distance: distance(a, b),
        view: viewRef.current,
        center: screenPoint((a.x + b.x) / 2, (a.y + b.y) / 2),
        zoom,
      };
      return;
    }
    if (tool === "pan" || e.button === 1 || readOnly) {
      drag.current = {
        kind: "pan",
        start: { x: e.clientX, y: e.clientY },
        originalView: viewRef.current,
      };
      return;
    }
    if (tool === "select") {
      setSelected([]);
      setEntity({ id: "", kind: "" });
      drag.current = { kind: "lasso", start: p };
      setLasso([p, p]);
    } else pointAction(snapped(p));
  };
  const pointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointerMap.current.has(e.pointerId))
      pointerMap.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointerMap.current.size === 2) {
      const [a, b] = [...pointerMap.current.values()],
        state = pinch.current;
      const nextZoom = Math.max(
          0.1,
          Math.min(
            8,
            (state.zoom * distance(a, b)) / Math.max(1, state.distance),
          ),
        ),
        ratio = state.zoom / nextZoom;
      const rect = svg.current!.getBoundingClientRect(),
        newW = state.view.width * ratio,
        newH = state.view.height * ratio;
      setView({
        x: state.center.x - (((a.x + b.x) / 2 - rect.left) / rect.width) * newW,
        y: state.center.y - (((a.y + b.y) / 2 - rect.top) / rect.height) * newH,
        width: newW,
        height: newH,
      });
      setZoom(nextZoom);
      return;
    }
    const p = screenPoint(e.clientX, e.clientY),
      d = drag.current;
    if (draft.length) setCursor(snapped(p));
    if (!d) return;
    if (d.kind === "pan") {
      const v = d.originalView!,
        rect = svg.current!.getBoundingClientRect();
      setView({
        ...v,
        x: v.x - ((e.clientX - d.start.x) * v.width) / rect.width,
        y: v.y - ((e.clientY - d.start.y) * v.height) / rect.height,
      });
    }
    if (d.kind === "lasso") setLasso([d.start, p]);
    if (d.kind === "items") {
      let dx = p.x - d.start.x,
        dy = p.y - d.start.y;
      if (doc.settings.snap && d.items?.length) {
        const anchor = d.items[0],
          s = snapped({ x: anchor.x + dx, y: anchor.y + dy });
        dx = s.x - anchor.x;
        dy = s.y - anchor.y;
      }
      updateVariant(
        (v) =>
          v.items.forEach((i) => {
            const original = d.items!.find((a) => a.id === i.id);
            if (original) {
              i.x = original.x + dx;
              i.y = original.y + dy;
            }
          }),
        true,
      );
    }
    if (d.kind === "vertex" && d.vertex) {
      const target = snapped(p);
      const next = moveWallVertex(floor, d.vertex, target);
      if (
        !next.rooms.some((r) => selfIntersects(r.points)) &&
        next.walls.every((w) => distance(w.start, w.end) >= 100)
      ) {
        change((doc) => {
          doc.floors = doc.floors.map((f) => (f.id === floor.id ? next : f));
        }, true);
        d.vertex = target;
      }
    }
    if (d.kind === "rotate" && d.items?.[0]) {
      const original = d.items[0];
      let angle =
        (Math.atan2(p.y - original.y, p.x - original.x) * 180) / Math.PI + 90;
      if (e.shiftKey || doc.settings.snap) angle = Math.round(angle / 15) * 15;
      updateVariant((v) => {
        const item = v.items.find((i) => i.id === original.id)!;
        item.angle = angle;
      }, true);
    }
    if (d.kind === "resize" && d.items?.[0]) {
      const original = d.items[0],
        a = (-original.angle * Math.PI) / 180,
        xx =
          (p.x - original.x) * Math.cos(a) - (p.y - original.y) * Math.sin(a),
        yy =
          (p.x - original.x) * Math.sin(a) + (p.y - original.y) * Math.cos(a);
      updateVariant((v) => {
        const item = v.items.find((i) => i.id === original.id)!;
        item.width = Math.max(
          10,
          Math.min(20000, Math.round(Math.abs(xx) * 2)),
        );
        item.depth = Math.max(
          10,
          Math.min(20000, Math.round(Math.abs(yy) * 2)),
        );
      }, true);
    }
  };
  const pointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointerMap.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointerMap.current.size < 2) pinch.current = null;
      drag.current = null;
      return;
    }
    if (drag.current?.kind === "lasso" && lasso) {
      const b = bounds(lasso);
      if (distance(lasso[0], lasso[1]) > view.width / 100)
        setSelected(
          variant.items
            .filter(
              (i) =>
                i.floorId === floor.id &&
                i.x >= b.minX &&
                i.x <= b.maxX &&
                i.y >= b.minY &&
                i.y <= b.maxY,
            )
            .map((i) => i.id),
        );
      setLasso(null);
    }
    if (
      drag.current &&
      ["items", "vertex", "resize", "rotate"].includes(drag.current.kind)
    )
      commit();
    drag.current = null;
  };
  const changeTool = (t: Tool) => {
    setTool(t);
    setDraft([]);
    setHint(
      t === "select"
        ? ""
        : t === "room" || t === "zone"
          ? "Нажимай на углы контура. Нажми на первую точку или «Замкнуть контур»."
          : t === "pan"
            ? "Перетаскивай план. Колесо мыши или два пальца — масштаб."
            : t === "annotation"
              ? "Нажми на место для подписи."
              : "Нажми на две точки на плане.",
    );
  };
  const selectedItem =
    selected.length === 1
      ? variant.items.find((i) => i.id === selected[0])
      : null;
  const handle = (
    kind: Drag["kind"],
    e: React.PointerEvent<SVGElement>,
    vertex?: Point,
  ) => {
    e.stopPropagation();
    begin();
    drag.current = {
      kind,
      start: screenPoint(e.clientX, e.clientY),
      items: selectedItem ? [structuredClone(selectedItem)] : [],
      vertex,
    };
    svg.current!.setPointerCapture(e.pointerId);
  };
  const importFile = async (file: File) => {
    try {
      if (file.name.endsWith(".json")) {
        if (file.size > 8e6) throw Error("JSON больше 8 МБ");
        const imported = documentSchema.parse(JSON.parse(await file.text()));
        change((d) => Object.assign(d, imported));
        setFloorId(imported.floors[0].id);
      } else {
        const u = await readUnderlay(file),
          b = planBounds(floor);
        updateFloor((f) => {
          f.underlay = {
            src: u.src,
            x: b.x + 500,
            y: b.y + 500,
            width: b.width - 1000,
            height: (b.width - 1000) * u.ratio,
            opacity: 0.6,
          };
        });
        changeTool("calibrate");
        setPanel("room");
        setHint(
          "Выбери две точки известного размера на подложке. PDF: импортирована первая страница.",
        );
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const generateLayouts = async () => {
    if (autoWorking) return;
    setAutoWorking(true);
    setHint("Подбираем геометрически допустимые варианты…");
    const task = new Worker(new URL("./layout.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = task;
    const timer = setTimeout(() => {
      task.terminate();
      setAutoWorking(false);
      setHint(
        "Поиск остановлен: слишком сложный проект. Уменьши число предметов.",
      );
    }, 15000);
    task.onmessage = (event) => {
      clearTimeout(timer);
      task.terminate();
      worker.current = null;
      setAutoWorking(false);
      if (event.data.error) {
        setError(event.data.error);
        return;
      }
      const candidates = event.data.variants as Variant[];
      if (!candidates.length) {
        setHint(
          "Не удалось найти расстановку с текущими предметами. Попробуй уменьшить их количество или размеры.",
        );
        return;
      }
      change((d) =>
        d.variants.push(...candidates.slice(0, 30 - d.variants.length)),
      );
      setDialog("compare");
      setHint(
        "Найденные варианты — предложения. Сравни проходы и выбери подходящий.",
      );
    };
    task.onerror = () => {
      clearTimeout(timer);
      task.terminate();
      setAutoWorking(false);
      setError("Не удалось выполнить поиск расстановки.");
    };
    task.postMessage({ floor, variant });
  };
  return (
    <div className={`editor ${readOnly ? "read-only" : ""}`}>
      <header className="editor-header">
        <Link to="/" className="icon" title="К проектам">
          <ArrowLeft size={20} />
        </Link>
        <Link to="/" className="editor-logo">
          <Logo />
        </Link>
        <div className="editor-project">
          <button
            className="project-name"
            disabled={readOnly}
            onClick={() => {
              const name = prompt("Название проекта", doc.name);
              if (name?.trim())
                change((d) => {
                  d.name = name.trim().slice(0, 120);
                });
            }}
          >
            {doc.name}
            <ChevronDown size={14} />
          </button>
          <span
            className={`save-status ${store.status.includes("Ошибка") || store.status.includes("Конфликт") ? "bad" : ""}`}
            role="status"
          >
            {readOnly ? (
              "Только просмотр"
            ) : store.status === "Сохранено" ? (
              <>
                <Check size={12} /> Сохранено
              </>
            ) : (
              store.status
            )}
          </span>
        </div>
        <div className="editor-head-actions">
          {!readOnly && (
            <>
              <button
                className="icon"
                title="Отменить (Ctrl+Z)"
                disabled={!store.canUndo}
                onClick={store.undo}
              >
                <Undo2 size={19} />
              </button>
              <button
                className="icon"
                title="Повторить (Ctrl+Shift+Z)"
                disabled={!store.canRedo}
                onClick={store.redo}
              >
                <Redo2 size={19} />
              </button>
              <button className="hide-small" onClick={() => setDialog("share")}>
                <Share2 size={17} /> Поделиться
              </button>
            </>
          )}
          <button className="primary" onClick={() => setDialog("export")}>
            <Download size={17} />
            <span>Экспорт</span>
          </button>
        </div>
      </header>
      <div className="editor-subbar">
        <div className="floor-tabs">
          <select
            aria-label="Этаж"
            value={floor.id}
            onChange={(e) => setFloorId(e.target.value)}
          >
            {doc.floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {!readOnly && (
            <button
              className="icon"
              title="Добавить этаж"
              onClick={() => {
                const id = uid(),
                  r = makeRoom("Комната", rectangle(4000, 3200));
                change((d) =>
                  d.floors.push({
                    id,
                    name: `${d.floors.length + 1} этаж`,
                    rooms: [r.room],
                    walls: r.walls,
                    openings: [],
                    zones: [],
                    measurements: [],
                    annotations: [],
                  }),
                );
                setFloorId(id);
              }}
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        <div className="variant-tabs">
          <select
            aria-label="Вариант"
            value={variant.id}
            onChange={(e) => {
              if (readOnly) setViewVariant(e.target.value);
              else
                change((d) => {
                  d.activeVariantId = e.target.value;
                });
              setSelected([]);
            }}
          >
            {doc.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {!readOnly && (
            <button
              className="icon"
              title="Дублировать вариант"
              onClick={() =>
                change((d) => {
                  const copy = structuredClone(variant);
                  copy.id = uid();
                  copy.name = `${variant.name} — копия`;
                  d.variants.push(copy);
                  d.activeVariantId = copy.id;
                })
              }
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        <span className="area-label">
          {(analysis.totalArea / 1e6).toFixed(2)} м²
        </span>
        <div className="mode-buttons">
          <button
            title="Сравнить варианты"
            onClick={() => setDialog("compare")}
          >
            <GitCompare size={16} />
            <span>Сравнить</span>
          </button>
          <button title="Список покупок" onClick={() => setDialog("shopping")}>
            <ShoppingBag size={16} />
            <span>Покупки</span>
          </button>
          {!readOnly && (
            <button onClick={() => void generateLayouts()}>
              <WandSparkles size={16} />
              <span>Подобрать</span>
            </button>
          )}
        </div>
      </div>
      {(error ||
        hint ||
        store.recovery ||
        store.status.includes("Конфликт") ||
        store.status.includes("Ошибка")) && (
        <div className="editor-message">
          <ErrorBox error={error} />
          {error && (
            <button className="icon" onClick={() => setError("")}>
              <X size={14} />
            </button>
          )}
          {store.recovery ? (
            <>
              <span>Найдена несохранённая локальная копия.</span>
              <button onClick={store.applyRecovery}>Восстановить</button>
              <button onClick={store.dismissRecovery}>Пропустить</button>
            </>
          ) : store.status.includes("Конфликт") ? (
            <>
              <span>
                Проект изменён в другой вкладке. Скачай свои изменения в JSON
                перед обновлением.
              </span>
              <button onClick={() => downloadJSON(doc)}>Скачать копию</button>
              <button onClick={() => location.reload()}>Обновить</button>
            </>
          ) : store.status.includes("Ошибка") ? (
            <>
              <span>Изменения сохранены локально.</span>
              <button onClick={() => void store.save()}>
                Повторить сохранение
              </button>
            </>
          ) : (
            <span>{hint}</span>
          )}
        </div>
      )}
      <div className="editor-body">
        <div className="canvas-host" ref={canvasHost}>
          <div className="toolbox">
            {(
              [
                ["select", MousePointer2, "Выбрать"],
                ["pan", Hand, "Перемещение"],
                ["room", Square, "Контур комнаты"],
                ["wall", PencilRuler, "Стена"],
                ["measure", Ruler, "Измерение"],
                ["zone", Square, "Запретная зона"],
                ["annotation", StickyNote, "Подпись"],
                ["fit", SearchCheck, "Что поместится?"],
                ["calibrate", ScanLine, "Калибровка подложки"],
              ] as const
            )
              .filter(([t]) => !readOnly || t === "pan")
              .map(([t, Icon, label]) => (
                <button
                  key={t}
                  title={label}
                  aria-label={label}
                  className={tool === t ? "active" : ""}
                  onClick={() => changeTool(t)}
                >
                  <Icon size={20} />
                </button>
              ))}
          </div>
          <svg
            ref={svg}
            className={`editor-canvas tool-${tool}`}
            viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
            onPointerDownCapture={(e) => {
              pointerMap.current.set(e.pointerId, {
                x: e.clientX,
                y: e.clientY,
              });
              svg.current!.setPointerCapture(e.pointerId);
              if (pointerMap.current.size === 2) {
                e.stopPropagation();
                if (drag.current) commit();
                drag.current = null;
                const [a, b] = [...pointerMap.current.values()];
                pinch.current = {
                  distance: distance(a, b),
                  view: viewRef.current,
                  center: screenPoint((a.x + b.x) / 2, (a.y + b.y) / 2),
                  zoom,
                };
              }
            }}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            aria-label="2D-план комнаты"
            role="img"
          >
            <PlanContent
              floor={floor}
              items={variant.items}
              doc={doc}
              selected={selected}
              selectedEntity={entity.id}
              status={analysis.status}
              selectItem={readOnly ? undefined : startItems}
              selectEntity={readOnly ? undefined : selectEntity}
            >
              {routeResult && (
                <g pointerEvents="none">
                  {routeResult.reachable.map((p, i) => (
                    <rect
                      key={i}
                      x={p.x}
                      y={p.y}
                      width={routeResult.step}
                      height={routeResult.step}
                      fill="#62a58a"
                      fillOpacity=".3"
                    />
                  ))}
                </g>
              )}
              {draft.length > 0 && (
                <g pointerEvents="none">
                  <polyline
                    points={polygonPoints([
                      ...draft,
                      ...(cursor ? [cursor] : []),
                    ])}
                    fill={
                      tool === "room" || tool === "zone" ? "#93c6af44" : "none"
                    }
                    stroke="#28786a"
                    strokeWidth="15"
                    strokeDasharray="45 25"
                  />
                  {draft.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={i === 0 ? 50 : 25}
                      fill="#28786a"
                    />
                  ))}
                </g>
              )}
              {lasso && (
                <rect
                  x={Math.min(lasso[0].x, lasso[1].x)}
                  y={Math.min(lasso[0].y, lasso[1].y)}
                  width={Math.abs(lasso[1].x - lasso[0].x)}
                  height={Math.abs(lasso[1].y - lasso[0].y)}
                  fill="#28786a22"
                  stroke="#28786a"
                  strokeWidth="8"
                />
              )}
              {!readOnly &&
                entity.kind === "wall" &&
                floor.walls
                  .filter((w) => w.id === entity.id)
                  .flatMap((w) => [w.start, w.end])
                  .map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={view.width / 80}
                      fill="white"
                      stroke="#28786a"
                      strokeWidth="15"
                      style={{ cursor: "move" }}
                      onPointerDown={(e) => handle("vertex", e, p)}
                    />
                  ))}
              {!readOnly && selectedItem && !selectedItem.locked && (
                <g
                  transform={`translate(${selectedItem.x} ${selectedItem.y}) rotate(${selectedItem.angle})`}
                >
                  <path
                    d={`M 0 ${-selectedItem.depth / 2} V ${-selectedItem.depth / 2 - 210}`}
                    stroke="#28786a"
                    strokeWidth="12"
                  />
                  <circle
                    cx="0"
                    cy={-selectedItem.depth / 2 - 210}
                    r={view.width / 100}
                    fill="white"
                    stroke="#28786a"
                    strokeWidth="15"
                    onPointerDown={(e) => handle("rotate", e)}
                  />
                  <circle
                    cx={selectedItem.width / 2}
                    cy={selectedItem.depth / 2}
                    r={view.width / 100}
                    fill="white"
                    stroke="#28786a"
                    strokeWidth="15"
                    onPointerDown={(e) => handle("resize", e)}
                  />
                </g>
              )}
            </PlanContent>
          </svg>
          {draft.length >= 3 && (tool === "room" || tool === "zone") && (
            <button className="close-polygon primary" onClick={finishPolygon}>
              Замкнуть контур
            </button>
          )}
          <div className="canvas-legend">
            <span>
              <i className="legend-red" /> Столкновение
            </span>
            <span>
              <i className="legend-gold" /> Узкий проход
            </span>
          </div>
          <div className="zoom-controls">
            <button
              className="icon"
              aria-label="Уменьшить"
              onClick={() => zoomBy(0.8)}
            >
              <Minus size={18} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              className="icon"
              aria-label="Увеличить"
              onClick={() => zoomBy(1.25)}
            >
              <Plus size={18} />
            </button>
            <button
              className="icon"
              aria-label="Вписать план"
              onClick={fitView}
            >
              <Maximize size={18} />
            </button>
          </div>
          <button
            className="mobile-panel-toggle"
            onClick={() => setMobilePanel((v) => !v)}
          >
            <Menu size={19} />
            {mobilePanel ? "Закрыть панель" : "Мебель и свойства"}
          </button>
        </div>
        <aside className={`inspector ${mobilePanel ? "mobile-open" : ""}`}>
          <div className="inspector-tabs">
            {[
              ["catalog", "Мебель"],
              ["room", "Комната"],
              ["properties", "Свойства"],
              ["checks", "Проверка"],
            ].map(([v, label]) => (
              <button
                key={v}
                className={panel === v ? "active" : ""}
                onClick={() => setPanel(v)}
              >
                {label}
                {v === "checks" && analysis.errors + analysis.warnings > 0 && (
                  <b>{analysis.errors + analysis.warnings}</b>
                )}
              </button>
            ))}
            <button
              className="icon mobile-close"
              onClick={() => setMobilePanel(false)}
              aria-label="Закрыть панель"
            >
              <X size={16} />
            </button>
          </div>
          <Inspector
            {...{
              doc,
              floor,
              variant,
              panel,
              selected,
              entity,
              catalog,
              personal,
              analysis,
              fits,
              routeResult,
              readOnly,
              updateFloor,
              updateVariant,
              change,
              setSelected,
              setEntity,
              addItem,
              deleteSelected,
              setDialog,
              setHint,
              importFile,
            }}
            onRoute={() => setRoute((v) => !v)}
            onFit={() => changeTool("fit")}
            onFocusIssue={(p) =>
              setView((v) => ({
                ...v,
                x: p.x - v.width / 2,
                y: p.y - v.height / 2,
              }))
            }
          />
          <div className="inspector-footer">
            <button onClick={() => setDialog("layers")}>
              <Layers size={16} /> Слои
            </button>
            {!readOnly && (
              <button onClick={() => setDialog("versions")}>
                История версий
              </button>
            )}
          </div>
        </aside>
      </div>
      <footer className="editor-status">
        <span>
          {variant.items.filter((i) => i.floorId === floor.id).length} предметов
          ·{" "}
          {selected.length
            ? `${selected.length} выбрано`
            : "Размеры помещения — по внутренним стенам"}
        </span>
        <span>
          {analysis.errors ? `${analysis.errors} столкн.` : "Столкновений нет"}{" "}
          · свободно {(analysis.freeArea / 1e6).toFixed(2)} м²
        </span>
      </footer>
      {dialog === "export" && (
        <ExportDialog
          doc={doc}
          floorId={floor.id}
          close={() => setDialog("")}
        />
      )}
      {dialog === "share" && (
        <ShareDialog projectId={project.id} close={() => setDialog("")} />
      )}
      {dialog === "compare" && (
        <CompareDialog
          doc={doc}
          floor={floor}
          selected={selected}
          change={change}
          readOnly={readOnly}
          close={() => setDialog("")}
        />
      )}
      {dialog === "shopping" && (
        <ShoppingDialog
          doc={doc}
          change={change}
          readOnly={readOnly}
          close={() => setDialog("")}
        />
      )}
      {dialog === "versions" && (
        <VersionsDialog
          projectId={project.id}
          change={change}
          close={() => setDialog("")}
        />
      )}
      {dialog === "custom" && (
        <CustomFurnitureDialog
          units={doc.units}
          close={() => setDialog("")}
          save={async (item) => {
            const saved = await request<CatalogItem>(
              "/furniture",
              "POST",
              item,
            );
            setPersonal((p) => [...p, saved]);
            addItem(saved);
            setDialog("");
          }}
        />
      )}
      {dialog === "layers" && (
        <Modal title="Слои плана" close={() => setDialog("")}>
          <div className="layer-list">
            {Object.entries(doc.settings.layers).map(([key, visible]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={visible}
                  disabled={readOnly}
                  onChange={(e) =>
                    change((d) => {
                      d.settings.layers[key as keyof typeof d.settings.layers] =
                        e.target.checked;
                    })
                  }
                />
                {
                  {
                    walls: "Стены",
                    openings: "Двери и окна",
                    furniture: "Мебель",
                    dimensions: "Размеры",
                    names: "Подписи",
                    zones: "Зоны",
                    underlay: "Подложка",
                    grid: "Сетка",
                  }[key]
                }
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
