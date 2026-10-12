// Furniture and plan visuals adapted from the supplied Claude Design kit.
import * as R from "react";
import { aabb, fmt } from "./geometry";
const h = R.createElement;
const box = (s, ...c) =>
  h("div", { style: { position: "absolute", ...s } }, ...c);
const sh = "0 2px 6px rgba(50,35,20,.25), 0 0 0 1px rgba(60,40,20,.12)";
/** @param {{type: string, w: number, h: number, tone?: string}} props */
function Furn({ type, w, h: H, tone }) {
  const W = w,
    base = {
      left: 0,
      top: 0,
      width: W,
      height: H,
      boxShadow: sh,
      borderRadius: 4,
    };
  const m = Math.min(W, H);
  switch (type) {
    case "bed":
      return box(
        { ...base, background: "#b8956a", borderRadius: 5 },
        box({
          left: "4%",
          right: "4%",
          top: "3%",
          bottom: "3%",
          background: "#f6f2ec",
          borderRadius: 3,
        }),
        W > 120
          ? box({
              left: "9%",
              width: "38%",
              top: "6%",
              height: "15%",
              background: "#fff",
              borderRadius: m * 0.06,
              boxShadow: "0 1px 3px rgba(0,0,0,.18)",
            })
          : null,
        box({
          right: "9%",
          width: W > 120 ? "38%" : "82%",
          top: "6%",
          height: "15%",
          background: "#fff",
          borderRadius: m * 0.06,
          boxShadow: "0 1px 3px rgba(0,0,0,.18)",
        }),
        box({
          left: "4%",
          right: "4%",
          top: "28%",
          bottom: "3%",
          background: tone || "#e3d8c6",
          borderRadius: "2px 2px 3px 3px",
          boxShadow: "0 -1px 4px rgba(0,0,0,.12)",
        }),
        box({
          left: "4%",
          right: "4%",
          top: "28%",
          height: "9%",
          background: "#efe8dc",
          borderBottom: "1px solid rgba(0,0,0,.06)",
        }),
        box({
          left: "4%",
          right: "4%",
          bottom: "3%",
          height: "22%",
          background: "rgba(120,100,70,.18)",
        }),
      );
    case "sofa":
    case "armchair": {
      const c = tone || "#56705b",
        arm = Math.max(4, W * (type === "armchair" ? 0.16 : 0.08)),
        n = type === "armchair" ? 1 : W > 180 ? 3 : 2;
      const cs = [];
      const cw = (W - arm * 2) / n;
      for (let i = 0; i < n; i++)
        cs.push(
          box({
            left: arm + i * cw + 1,
            width: cw - 2,
            top: H * 0.3,
            bottom: H * 0.06,
            background: tone
              ? `color-mix(in srgb, ${tone}, white 8%)`
              : "#6a8670",
            borderRadius: 3,
            boxShadow: "inset 0 -2px 3px rgba(0,0,0,.12)",
          }),
        );
      return box(
        { ...base, background: c, borderRadius: Math.max(4, m * 0.14) },
        box({
          left: 0,
          right: 0,
          top: 0,
          height: H * 0.28,
          background: tone
            ? `color-mix(in srgb, ${tone}, black 10%)`
            : "#48614e",
          borderRadius: `${m * 0.14}px ${m * 0.14}px 2px 2px`,
        }),
        ...cs,
      );
    }
    case "wardrobe":
    case "dresser":
      return box(
        { ...base, background: tone || "#dcc6a2", borderRadius: 2 },
        box({
          left: 3,
          right: 3,
          top: 3,
          bottom: 3,
          border: "1px solid rgba(110,80,40,.25)",
          borderRadius: 1,
          backgroundImage: `repeating-linear-gradient(90deg, transparent 0 ${W / (type === "dresser" ? 2 : 3) - 1}px, rgba(110,80,40,.28) ${W / (type === "dresser" ? 2 : 3) - 1}px ${W / (type === "dresser" ? 2 : 3)}px)`,
        }),
        box({ left: 0, right: 0, bottom: 0, height: 2, background: "#a88456" }),
      );
    case "desk":
    case "table":
      return box(
        {
          ...base,
          background: tone || "#c79c6a",
          borderRadius: type === "table" ? m * 0.12 : 3,
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,.06) 0 3px, transparent 3px 9px)",
        },
        type === "desk"
          ? box({
              left: "36%",
              width: "28%",
              top: "18%",
              height: "42%",
              background: "#3a3b40",
              borderRadius: 2,
            })
          : null,
        type === "desk"
          ? box({
              left: "10%",
              width: m * 0.22,
              height: m * 0.22,
              top: "20%",
              background: "#f1e6cf",
              borderRadius: "50%",
              boxShadow: "0 0 0 2px rgba(0,0,0,.08)",
            })
          : null,
        type === "table"
          ? box({
              left: "38%",
              width: "24%",
              top: "30%",
              height: "40%",
              background: "rgba(255,255,255,.5)",
              borderRadius: "50%",
            })
          : null,
      );
    case "coffee":
      return box(
        { ...base, background: tone || "#8a6340", borderRadius: "50%" },
        box({
          left: "35%",
          width: "30%",
          top: "30%",
          height: "40%",
          background: "#5c7f60",
          borderRadius: "50%",
        }),
      );
    case "chair":
      return box(
        { ...base, background: "transparent", boxShadow: "none" },
        box({
          left: "8%",
          right: "8%",
          top: "18%",
          bottom: "4%",
          background: tone || "#c99a68",
          borderRadius: m * 0.22,
          boxShadow: sh,
        }),
        box({
          left: "6%",
          right: "6%",
          top: 0,
          height: "22%",
          background: "#9c7448",
          borderRadius: m * 0.12,
          boxShadow: sh,
        }),
      );
    case "nightstand":
      return box(
        { ...base, background: tone || "#cfae82", borderRadius: 3 },
        box({
          left: "50%",
          top: "50%",
          width: m * 0.5,
          height: m * 0.5,
          marginLeft: -m * 0.25,
          marginTop: -m * 0.25,
          background: "#f6ead2",
          borderRadius: "50%",
          boxShadow: "0 0 6px 2px rgba(255,220,150,.6)",
        }),
      );
    case "tvstand":
      return box(
        { ...base, background: tone || "#4a4a50", borderRadius: 2 },
        box({
          left: "15%",
          right: "15%",
          top: "20%",
          height: "18%",
          background: "#151517",
          borderRadius: 1,
        }),
      );
    case "shelf":
      return box(
        {
          ...base,
          background: tone || "#cdb089",
          borderRadius: 2,
          backgroundImage: `repeating-linear-gradient(90deg, rgba(90,60,30,.35) 0 1px, transparent 1px ${Math.max(8, W / 4)}px)`,
        },
        box({
          left: "12%",
          width: "10%",
          top: "20%",
          bottom: "20%",
          background: "#7d9c7f",
          borderRadius: 1,
        }),
        box({
          left: "55%",
          width: "18%",
          top: "25%",
          bottom: "25%",
          background: "#e9e2d4",
          borderRadius: 1,
        }),
      );
    case "plant":
      return box(
        {
          ...base,
          background:
            "radial-gradient(circle at 50% 50%, #7fb07b 0 20%, #4f8a52 45%, #2f6435 70%)",
          borderRadius: "50%",
          boxShadow: "0 3px 6px rgba(20,40,20,.35)",
        },
        box({
          left: "18%",
          top: "10%",
          width: "34%",
          height: "34%",
          background: "#6aa266",
          borderRadius: "50%",
        }),
        box({
          right: "12%",
          top: "30%",
          width: "32%",
          height: "32%",
          background: "#3e7a42",
          borderRadius: "50%",
        }),
        box({
          left: "28%",
          bottom: "10%",
          width: "30%",
          height: "30%",
          background: "#5b9a5a",
          borderRadius: "50%",
        }),
      );
    case "rug":
      return box(
        {
          ...base,
          background: tone || "#ebe3d5",
          boxShadow: "0 1px 2px rgba(0,0,0,.12)",
          borderRadius: 3,
        },
        box({
          left: "6%",
          right: "6%",
          top: "8%",
          bottom: "8%",
          border: "1px solid rgba(140,110,70,.35)",
          borderRadius: 2,
        }),
      );
    case "kitchen":
      return box(
        {
          ...base,
          background: tone || "#e6e3dc",
          borderRadius: 2,
          borderBottom: "3px solid #b9b3a8",
        },
        box({
          left: "12%",
          width: "20%",
          top: "18%",
          height: "58%",
          background: "#c7ccd1",
          borderRadius: 4,
          boxShadow: "inset 0 1px 3px rgba(0,0,0,.25)",
        }),
        box({
          left: "58%",
          width: "26%",
          top: "14%",
          height: "66%",
          background: "#2c2d31",
          borderRadius: 3,
        }),
        box({
          left: "61%",
          width: m * 0.18,
          height: m * 0.18,
          top: "22%",
          border: "1.5px solid #777",
          borderRadius: "50%",
        }),
        box({
          left: "73%",
          width: m * 0.18,
          height: m * 0.18,
          top: "50%",
          border: "1.5px solid #777",
          borderRadius: "50%",
        }),
      );
    default:
      return box({
        ...base,
        background: tone || "#d9cbb5",
        border: "1px solid rgba(0,0,0,.15)",
      });
  }
}

const FLOORS = {
  oak: (s) => ({
    backgroundColor: "#d9bb8f",
    backgroundImage: `repeating-linear-gradient(90deg, rgba(110,70,30,.14) 0 1px, transparent 1px ${Math.max(4, 16 * s)}px), repeating-linear-gradient(0deg, transparent 0 ${120 * s}px, rgba(110,70,30,.08) ${120 * s}px ${120 * s + 1}px)`,
  }),
  light: (s) => ({
    backgroundColor: "#ece1cd",
    backgroundImage: `repeating-linear-gradient(90deg, rgba(120,90,50,.10) 0 1px, transparent 1px ${Math.max(4, 16 * s)}px)`,
  }),
  walnut: (s) => ({
    backgroundColor: "#a57a52",
    backgroundImage: `repeating-linear-gradient(90deg, rgba(50,25,10,.18) 0 1px, transparent 1px ${Math.max(4, 16 * s)}px)`,
  }),
  tile: (s) => ({
    backgroundColor: "#e8e6e1",
    backgroundImage: `linear-gradient(rgba(0,0,0,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.07) 1px, transparent 1px)`,
    backgroundSize: `${40 * s}px ${40 * s}px`,
  }),
};

function geom(room, opt) {
  const wall = opt.wall ?? 10,
    dims = opt.dims !== false,
    m = opt.margin ?? (dims ? 30 : 0);
  let s = opt.scale;
  if (!s) {
    const sw = opt.fitW ? (opt.fitW - 2 * m) / (room.w + 2 * wall) : 99,
      shh = opt.fitH ? (opt.fitH - 2 * m) / (room.h + 2 * wall) : 99;
    s = Math.min(sw, shh);
  }
  return {
    s,
    m,
    wall,
    off: m + wall * s,
    W: (room.w + 2 * wall) * s + 2 * m,
    H: (room.h + 2 * wall) * s + 2 * m,
  };
}

function DimLine({ x, y, len, vertical, label, dark }) {
  const col = dark ? "rgba(248,247,244,.75)" : "#3b3b40";
  const tick = vertical
    ? { width: 9, height: 1, left: -4 }
    : { width: 1, height: 9, top: -4 };
  return box(
    {
      left: x,
      top: y,
      width: vertical ? 1 : len,
      height: vertical ? len : 1,
      background: col,
    },
    box({ ...tick, background: col, ...(vertical ? { top: 0 } : { left: 0 }) }),
    box({
      ...tick,
      background: col,
      ...(vertical ? { bottom: 0 } : { right: 0 }),
    }),
    h(
      "div",
      {
        style: {
          position: "absolute",
          left: vertical ? -10 : "50%",
          top: vertical ? "50%" : -10,
          transform: vertical
            ? "translate(-50%,-50%) rotate(-90deg)"
            : "translate(-50%,-50%)",
          whiteSpace: "nowrap",
          font: '600 11px "Manrope Variable", sans-serif',
          color: dark ? "#F8F7F4" : "#1E1E22",
          background: dark ? "#0B0D0D" : "#F7F7F5",
          padding: "0 5px",
        },
      },
      label,
    ),
  );
}

function Plan(props) {
  const room = props.room || { w: 400, h: 320 },
    items = props.items || [],
    doors = props.doors || [],
    windows = props.windows || [];
  const g = geom(room, props),
    s = g.s,
    wl = g.wall * s,
    unit = props.unit || "см";
  const status = props.status || {},
    showNames = props.names;
  const fl = (FLOORS[props.floor || "oak"] || FLOORS.oak)(s);
  const kids = [];
  kids.push(
    box({
      left: g.m,
      top: g.m,
      width: (room.w + 2 * g.wall) * s,
      height: (room.h + 2 * g.wall) * s,
      background: props.wallColor || "#2e2e33",
      borderRadius: 2,
      boxShadow: "0 10px 30px rgba(20,15,10,.18)",
    }),
  );
  kids.push(
    box({
      left: g.off,
      top: g.off,
      width: room.w * s,
      height: room.h * s,
      ...fl,
    }),
  );
  windows.forEach((wd, i) => {
    const hor = wd.wall === "top" || wd.wall === "bottom";
    const st = hor
      ? {
          left: g.off + wd.at * s,
          width: wd.w * s,
          top: wd.wall === "top" ? g.m : g.off + room.h * s,
          height: wl,
        }
      : {
          top: g.off + wd.at * s,
          height: wd.w * s,
          left: wd.wall === "left" ? g.m : g.off + room.w * s,
          width: wl,
        };
    kids.push(
      box(
        {
          ...st,
          background: "#eef4f6",
          border: "1px solid #8fb1c0",
          boxSizing: "border-box",
        },
        box(
          hor
            ? {
                left: 0,
                right: 0,
                top: "50%",
                height: 1,
                background: "#8fb1c0",
              }
            : {
                top: 0,
                bottom: 0,
                left: "50%",
                width: 1,
                background: "#8fb1c0",
              },
        ),
      ),
    );
  });
  doors.forEach((d, i) => {
    const dw = d.w * s,
      hor = d.wall === "top" || d.wall === "bottom";
    const gap = hor
      ? {
          left: g.off + d.at * s,
          width: dw,
          top: d.wall === "top" ? g.m : g.off + room.h * s,
          height: wl,
        }
      : {
          top: g.off + d.at * s,
          height: dw,
          left: d.wall === "left" ? g.m : g.off + room.w * s,
          width: wl,
        };
    kids.push(box({ ...gap, ...fl }));
    const pos =
      d.wall === "bottom"
        ? { left: g.off + d.at * s, top: g.off + room.h * s - dw }
        : d.wall === "top"
          ? { left: g.off + d.at * s, top: g.off }
          : d.wall === "left"
            ? { left: g.off, top: g.off + d.at * s }
            : { left: g.off + room.w * s - dw, top: g.off + d.at * s };
    const rot = { bottom: 0, left: 90, top: 180, right: 270 }[d.wall];
    const flip = d.flip ? " scaleX(-1)" : "";
    kids.push(
      box(
        {
          ...pos,
          width: dw,
          height: dw,
          transform: `rotate(${rot}deg)${flip}`,
          pointerEvents: "none",
        },
        props.zones
          ? box({
              left: 0,
              top: 0,
              width: dw,
              height: dw,
              background: "rgba(230,90,90,.08)",
              borderTopRightRadius: "100%",
            })
          : null,
        box({
          left: 0,
          top: 0,
          width: dw,
          height: dw,
          borderTop: "1.2px dashed rgba(40,40,45,.55)",
          borderRight: "1.2px dashed rgba(40,40,45,.55)",
          borderTopRightRadius: "100%",
          boxSizing: "border-box",
        }),
        box({
          left: 0,
          top: 0,
          width: Math.max(2, 4 * s),
          height: dw,
          background: "#3a3a40",
          borderRadius: 1,
        }),
      ),
    );
  });
  [...items]
    .sort((a, b) => Number(b.type === "rug") - Number(a.type === "rug"))
    .forEach((it) => {
      const b = aabb(it),
        stt = status[it.id],
        sel = props.selectedId === it.id;
      kids.push(
        box(
          {
            left: g.off + b.x * s,
            top: g.off + b.y * s,
            width: b.w * s,
            height: b.h * s,
          },
          box(
            {
              left: "50%",
              top: "50%",
              width: it.w * s,
              height: it.h * s,
              transform: `translate(-50%,-50%) rotate(${it.rot || 0}deg)`,
            },
            h(Furn, { type: it.type, w: it.w * s, h: it.h * s, tone: it.tone }),
            stt === "err"
              ? box({
                  inset: -2,
                  border: "2px solid #E65A5A",
                  background: "rgba(230,90,90,.16)",
                  borderRadius: 4,
                })
              : stt === "warn"
                ? box({
                    inset: -2,
                    border: "2px dashed #E3A43B",
                    borderRadius: 4,
                  })
                : null,
            sel
              ? box({
                  inset: -3,
                  border: "1.5px solid #5FA768",
                  borderRadius: 4,
                })
              : null,
          ),
          showNames && it.type !== "plant" && it.type !== "rug"
            ? h(
                "div",
                {
                  style: {
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%,-50%)",
                    font: '600 9px "Manrope Variable"',
                    color: "#1E1E22",
                    background: "rgba(255,255,255,.85)",
                    padding: "1px 4px",
                    borderRadius: 4,
                    whiteSpace: "nowrap",
                  },
                },
                it.name,
              )
            : null,
        ),
      );
    });
  if (props.dims !== false) {
    kids.push(
      h(DimLine, {
        key: "dt",
        x: g.off,
        y: g.m * 0.42,
        len: room.w * s,
        label: fmt(room.w, unit),
        dark: props.dark,
      }),
    );
    kids.push(
      h(DimLine, {
        key: "dl",
        x: g.m * 0.42,
        y: g.off,
        len: room.h * s,
        vertical: true,
        label: fmt(room.h, unit),
        dark: props.dark,
      }),
    );
  }
  return h(
    "div",
    {
      style: Object.assign(
        { position: "relative", width: g.W, height: g.H, flex: "none" },
        props.style || {},
      ),
    },
    ...kids.map((k, i) => R.cloneElement(k, { key: i })),
  );
}

function FurnThumb({ type, w, h: H, size }) {
  size = size || 64;
  const k = size / Math.max(w, H);
  return h(
    "div",
    {
      style: {
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      },
    },
    h(
      "div",
      { style: { position: "relative", width: w * k, height: H * k } },
      h(Furn, { type, w: w * k, h: H * k }),
    ),
  );
}

export { Furn, FurnThumb, Plan, geom };
