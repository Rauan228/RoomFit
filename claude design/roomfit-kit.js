// RoomFit shared kit: top-down furniture, plan renderer, geometry checks, catalog.
(function () {
  const R = window.React;
  const h = (t, p, ...c) => R.createElement(t, p, ...c);
  const box = (s, ...c) => h('div', { style: Object.assign({ position: 'absolute' }, s) }, ...c);

  const CATALOG = [
    { key: 'bed2', type: 'bed', name: 'Двуспальная кровать', w: 160, h: 200, cat: 'Кровати' },
    { key: 'bed1', type: 'bed', name: 'Односпальная кровать', w: 90, h: 200, cat: 'Кровати' },
    { key: 'kbed', type: 'bed', name: 'Детская кровать', w: 80, h: 160, cat: 'Кровати' },
    { key: 'sofa3', type: 'sofa', name: 'Диван трёхместный', w: 220, h: 95, cat: 'Диваны' },
    { key: 'sofa2', type: 'sofa', name: 'Диван двухместный', w: 160, h: 90, cat: 'Диваны' },
    { key: 'arm', type: 'armchair', name: 'Кресло', w: 80, h: 80, cat: 'Диваны' },
    { key: 'desk', type: 'desk', name: 'Рабочий стол', w: 120, h: 60, cat: 'Столы' },
    { key: 'dtable', type: 'table', name: 'Обеденный стол', w: 140, h: 80, cat: 'Столы' },
    { key: 'coffee', type: 'coffee', name: 'Журнальный столик', w: 90, h: 55, cat: 'Столы' },
    { key: 'chair', type: 'chair', name: 'Стул', w: 45, h: 50, cat: 'Стулья' },
    { key: 'ochair', type: 'chair', name: 'Офисное кресло', w: 60, h: 60, cat: 'Стулья' },
    { key: 'ward', type: 'wardrobe', name: 'Шкаф', w: 180, h: 60, cat: 'Шкафы' },
    { key: 'ward2', type: 'wardrobe', name: 'Шкаф-купе', w: 200, h: 65, cat: 'Шкафы' },
    { key: 'dresser', type: 'dresser', name: 'Комод', w: 100, h: 45, cat: 'Тумбы' },
    { key: 'night', type: 'nightstand', name: 'Тумба прикроватная', w: 50, h: 40, cat: 'Тумбы' },
    { key: 'tvst', type: 'tvstand', name: 'ТВ-тумба', w: 160, h: 40, cat: 'Тумбы' },
    { key: 'shelf', type: 'shelf', name: 'Стеллаж', w: 80, h: 35, cat: 'Стеллажи' },
    { key: 'shelf2', type: 'shelf', name: 'Стеллаж широкий', w: 120, h: 35, cat: 'Стеллажи' },
    { key: 'plant', type: 'plant', name: 'Растение', w: 45, h: 45, cat: 'Другое' },
    { key: 'rug', type: 'rug', name: 'Ковёр', w: 200, h: 140, cat: 'Другое' },
    { key: 'kitchen', type: 'kitchen', name: 'Кухонный гарнитур', w: 240, h: 60, cat: 'Другое' },
  ];
  const CATS = ['Все', 'Кровати', 'Диваны', 'Столы', 'Стулья', 'Шкафы', 'Тумбы', 'Стеллажи', 'Другое'];

  const sh = '0 2px 6px rgba(50,35,20,.25), 0 0 0 1px rgba(60,40,20,.12)';
  function Furn({ type, w, h: H, tone }) {
    const W = w, base = { left: 0, top: 0, width: W, height: H, boxShadow: sh, borderRadius: 4 };
    const m = Math.min(W, H);
    switch (type) {
      case 'bed':
        return box({ ...base, background: '#b8956a', borderRadius: 5 },
          box({ left: '4%', right: '4%', top: '3%', bottom: '3%', background: '#f6f2ec', borderRadius: 3 }),
          W > 120 ? box({ left: '9%', width: '38%', top: '6%', height: '15%', background: '#fff', borderRadius: m * 0.06, boxShadow: '0 1px 3px rgba(0,0,0,.18)' }) : null,
          box({ right: '9%', width: W > 120 ? '38%' : '82%', top: '6%', height: '15%', background: '#fff', borderRadius: m * 0.06, boxShadow: '0 1px 3px rgba(0,0,0,.18)' }),
          box({ left: '4%', right: '4%', top: '28%', bottom: '3%', background: tone || '#e3d8c6', borderRadius: '2px 2px 3px 3px', boxShadow: '0 -1px 4px rgba(0,0,0,.12)' }),
          box({ left: '4%', right: '4%', top: '28%', height: '9%', background: '#efe8dc', borderBottom: '1px solid rgba(0,0,0,.06)' }),
          box({ left: '4%', right: '4%', bottom: '3%', height: '22%', background: 'rgba(120,100,70,.18)' }));
      case 'sofa': case 'armchair': {
        const c = tone || '#56705b', arm = Math.max(4, W * (type === 'armchair' ? 0.16 : 0.08)), n = type === 'armchair' ? 1 : W > 180 ? 3 : 2;
        const cs = []; const cw = (W - arm * 2) / n;
        for (let i = 0; i < n; i++) cs.push(box({ left: arm + i * cw + 1, width: cw - 2, top: H * 0.3, bottom: H * 0.06, background: '#6a8670', borderRadius: 3, boxShadow: 'inset 0 -2px 3px rgba(0,0,0,.12)' }));
        return box({ ...base, background: c, borderRadius: Math.max(4, m * 0.14) },
          box({ left: 0, right: 0, top: 0, height: H * 0.28, background: '#48614e', borderRadius: `${m * 0.14}px ${m * 0.14}px 2px 2px` }),
          ...cs);
      }
      case 'wardrobe': case 'dresser':
        return box({ ...base, background: tone || '#dcc6a2', borderRadius: 2 },
          box({ left: 3, right: 3, top: 3, bottom: 3, border: '1px solid rgba(110,80,40,.25)', borderRadius: 1, backgroundImage: `repeating-linear-gradient(90deg, transparent 0 ${W / (type === 'dresser' ? 2 : 3) - 1}px, rgba(110,80,40,.28) ${W / (type === 'dresser' ? 2 : 3) - 1}px ${W / (type === 'dresser' ? 2 : 3)}px)` }),
          box({ left: 0, right: 0, bottom: 0, height: 2, background: '#a88456' }));
      case 'desk': case 'table':
        return box({ ...base, background: tone || '#c79c6a', borderRadius: type === 'table' ? m * 0.12 : 3, backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,.06) 0 3px, transparent 3px 9px)' },
          type === 'desk' ? box({ left: '36%', width: '28%', top: '18%', height: '42%', background: '#3a3b40', borderRadius: 2 }) : null,
          type === 'desk' ? box({ left: '10%', width: m * 0.22, height: m * 0.22, top: '20%', background: '#f1e6cf', borderRadius: '50%', boxShadow: '0 0 0 2px rgba(0,0,0,.08)' }) : null,
          type === 'table' ? box({ left: '38%', width: '24%', top: '30%', height: '40%', background: 'rgba(255,255,255,.5)', borderRadius: '50%' }) : null);
      case 'coffee':
        return box({ ...base, background: tone || '#8a6340', borderRadius: '50%' },
          box({ left: '35%', width: '30%', top: '30%', height: '40%', background: '#5c7f60', borderRadius: '50%' }));
      case 'chair':
        return box({ ...base, background: 'transparent', boxShadow: 'none' },
          box({ left: '8%', right: '8%', top: '18%', bottom: '4%', background: tone || '#c99a68', borderRadius: m * 0.22, boxShadow: sh }),
          box({ left: '6%', right: '6%', top: 0, height: '22%', background: '#9c7448', borderRadius: m * 0.12, boxShadow: sh }));
      case 'nightstand':
        return box({ ...base, background: tone || '#cfae82', borderRadius: 3 },
          box({ left: '50%', top: '50%', width: m * 0.5, height: m * 0.5, marginLeft: -m * 0.25, marginTop: -m * 0.25, background: '#f6ead2', borderRadius: '50%', boxShadow: '0 0 6px 2px rgba(255,220,150,.6)' }));
      case 'tvstand':
        return box({ ...base, background: tone || '#4a4a50', borderRadius: 2 },
          box({ left: '15%', right: '15%', top: '20%', height: '18%', background: '#151517', borderRadius: 1 }));
      case 'shelf':
        return box({ ...base, background: tone || '#cdb089', borderRadius: 2, backgroundImage: `repeating-linear-gradient(90deg, rgba(90,60,30,.35) 0 1px, transparent 1px ${Math.max(8, W / 4)}px)` },
          box({ left: '12%', width: '10%', top: '20%', bottom: '20%', background: '#7d9c7f', borderRadius: 1 }),
          box({ left: '55%', width: '18%', top: '25%', bottom: '25%', background: '#e9e2d4', borderRadius: 1 }));
      case 'plant':
        return box({ ...base, background: 'radial-gradient(circle at 50% 50%, #7fb07b 0 20%, #4f8a52 45%, #2f6435 70%)', borderRadius: '50%', boxShadow: '0 3px 6px rgba(20,40,20,.35)' },
          box({ left: '18%', top: '10%', width: '34%', height: '34%', background: '#6aa266', borderRadius: '50%' }),
          box({ right: '12%', top: '30%', width: '32%', height: '32%', background: '#3e7a42', borderRadius: '50%' }),
          box({ left: '28%', bottom: '10%', width: '30%', height: '30%', background: '#5b9a5a', borderRadius: '50%' }));
      case 'rug':
        return box({ ...base, background: tone || '#ebe3d5', boxShadow: '0 1px 2px rgba(0,0,0,.12)', borderRadius: 3 },
          box({ left: '6%', right: '6%', top: '8%', bottom: '8%', border: '1px solid rgba(140,110,70,.35)', borderRadius: 2 }));
      case 'kitchen':
        return box({ ...base, background: tone || '#e6e3dc', borderRadius: 2, borderBottom: '3px solid #b9b3a8' },
          box({ left: '12%', width: '20%', top: '18%', height: '58%', background: '#c7ccd1', borderRadius: 4, boxShadow: 'inset 0 1px 3px rgba(0,0,0,.25)' }),
          box({ left: '58%', width: '26%', top: '14%', height: '66%', background: '#2c2d31', borderRadius: 3 }),
          box({ left: '61%', width: m * 0.18, height: m * 0.18, top: '22%', border: '1.5px solid #777', borderRadius: '50%' }),
          box({ left: '73%', width: m * 0.18, height: m * 0.18, top: '50%', border: '1.5px solid #777', borderRadius: '50%' }));
      default:
        return box({ ...base, background: tone || '#d9cbb5', border: '1px solid rgba(0,0,0,.15)' });
    }
  }

  function aabb(it) {
    const a = ((it.rot || 0) % 360) * Math.PI / 180;
    const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    return { x: it.x, y: it.y, w: it.w * c + it.h * s, h: it.w * s + it.h * c };
  }
  function doorZones(room, doors) {
    return (doors || []).map(d => {
      const w = d.w;
      if (d.wall === 'bottom') return { x: d.at, y: room.h - w, w, h: w };
      if (d.wall === 'top') return { x: d.at, y: 0, w, h: w };
      if (d.wall === 'left') return { x: 0, y: d.at, w, h: w };
      return { x: room.w - w, y: d.at, w, h: w };
    });
  }
  const ov = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
  const soft = t => t === 'rug';
  const noWarn = t => t === 'rug' || t === 'plant' || t === 'chair';

  function analyze(room, items, doors, threshold) {
    threshold = threshold || 60;
    const st = {}, issues = [], minGap = {};
    const bx = items.map(it => ({ it, b: aabb(it) }));
    const zones = doorZones(room, doors);
    const flag = (id, lvl) => { if (st[id] !== 'err') st[id] = lvl; };
    const note = (id, g) => { if (g >= 0 && (minGap[id] == null || g < minGap[id])) minGap[id] = g; };
    bx.forEach(({ it, b }) => {
      st[it.id] = 'ok';
      if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > room.w + 0.5 || b.y + b.h > room.h + 0.5) { st[it.id] = 'err'; issues.push({ lvl: 'err', ids: [it.id], text: `${it.name} заходит за стену` }); }
      if (!soft(it.type)) zones.forEach(z => { if (ov(b, z)) { st[it.id] = 'err'; issues.push({ lvl: 'err', ids: [it.id], text: `${it.name} мешает открыванию двери` }); } });
      const walls = [b.x, b.y, room.w - b.x - b.w, room.h - b.y - b.h];
      walls.forEach(g => { if (g > 8) note(it.id, g); if (!noWarn(it.type) && g > 8 && g < threshold) { flag(it.id, 'warn'); issues.push({ lvl: 'warn', ids: [it.id], text: `${it.name}: до стены ${Math.round(g)} см`, gap: g }); } });
    });
    for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) {
      const A = bx[i], B = bx[j];
      if (soft(A.it.type) || soft(B.it.type)) continue;
      if (ov(A.b, B.b)) { st[A.it.id] = st[B.it.id] = 'err'; issues.push({ lvl: 'err', ids: [A.it.id, B.it.id], text: `${A.it.name} пересекается с «${B.it.name}»` }); continue; }
      let g = null;
      const yo = Math.min(A.b.y + A.b.h, B.b.y + B.b.h) - Math.max(A.b.y, B.b.y);
      const xo = Math.min(A.b.x + A.b.w, B.b.x + B.b.w) - Math.max(A.b.x, B.b.x);
      if (yo > 0) g = Math.max(B.b.x - (A.b.x + A.b.w), A.b.x - (B.b.x + B.b.w));
      else if (xo > 0) g = Math.max(B.b.y - (A.b.y + A.b.h), A.b.y - (B.b.y + B.b.h));
      if (g == null) continue;
      if (g > 8) { note(A.it.id, g); note(B.it.id, g); }
      if (g > 8 && g < threshold && !noWarn(A.it.type) && !noWarn(B.it.type)) {
        flag(A.it.id, 'warn'); flag(B.it.id, 'warn');
        issues.push({ lvl: 'warn', ids: [A.it.id, B.it.id], text: `Узкий проход ${Math.round(g)} см: ${A.it.name} — ${B.it.name}`, gap: g });
      }
    }
    const errs = issues.filter(i => i.lvl === 'err').length, warns = issues.filter(i => i.lvl === 'warn').length;
    const used = items.filter(i => !soft(i.type)).reduce((s, i) => s + i.w * i.h, 0);
    const passes = issues.filter(i => i.gap).map(i => i.gap);
    return { st, issues, errs, warns, minGap, free: Math.max(0, Math.round(100 - used / (room.w * room.h) * 100)), minPass: passes.length ? Math.round(Math.min(...passes)) : null };
  }

  // distances from item to nearest obstacle (wall or item) in 4 directions
  function rays(room, items, id) {
    const it = items.find(i => i.id === id); if (!it) return [];
    const a = aabb(it), others = items.filter(i => i.id !== id && !soft(i.type)).map(aabb);
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2, out = [];
    const yov = b => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0, xov = b => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0;
    let L = 0; others.forEach(b => { if (yov(b) && b.x + b.w <= a.x + .5) L = Math.max(L, b.x + b.w); }); out.push({ dir: 'l', x1: L, x2: a.x, y: cy, d: a.x - L });
    let Rr = room.w; others.forEach(b => { if (yov(b) && b.x >= a.x + a.w - .5) Rr = Math.min(Rr, b.x); }); out.push({ dir: 'r', x1: a.x + a.w, x2: Rr, y: cy, d: Rr - a.x - a.w });
    let T = 0; others.forEach(b => { if (xov(b) && b.y + b.h <= a.y + .5) T = Math.max(T, b.y + b.h); }); out.push({ dir: 't', y1: T, y2: a.y, x: cx, d: a.y - T });
    let B = room.h; others.forEach(b => { if (xov(b) && b.y >= a.y + a.h - .5) B = Math.min(B, b.y); }); out.push({ dir: 'b', y1: a.y + a.h, y2: B, x: cx, d: B - a.y - a.h });
    return out;
  }
  function between(items, idA, idB) {
    const A = aabb(items.find(i => i.id === idA)), B = aabb(items.find(i => i.id === idB));
    const dx = Math.max(0, B.x - (A.x + A.w), A.x - (B.x + B.w)), dy = Math.max(0, B.y - (A.y + A.h), A.y - (B.y + B.h));
    const x1 = dx === 0 ? (Math.max(A.x, B.x) + Math.min(A.x + A.w, B.x + B.w)) / 2 : (B.x > A.x ? A.x + A.w : A.x);
    const x2 = dx === 0 ? x1 : (B.x > A.x ? B.x : B.x + B.w);
    const y1 = dy === 0 ? (Math.max(A.y, B.y) + Math.min(A.y + A.h, B.y + B.h)) / 2 : (B.y > A.y ? A.y + A.h : A.y);
    const y2 = dy === 0 ? y1 : (B.y > A.y ? B.y : B.y + B.h);
    return { d: Math.round(Math.hypot(dx, dy)), x1, y1, x2, y2 };
  }
  function fmt(cm, unit) {
    if (unit === 'м') return (cm / 100).toFixed(2).replace('.', ',') + ' м';
    return Math.round(cm) + ' см';
  }

  const FLOORS = {
    oak: s => ({ backgroundColor: '#d9bb8f', backgroundImage: `repeating-linear-gradient(90deg, rgba(110,70,30,.14) 0 1px, transparent 1px ${Math.max(4, 16 * s)}px), repeating-linear-gradient(0deg, transparent 0 ${120 * s}px, rgba(110,70,30,.08) ${120 * s}px ${120 * s + 1}px)` }),
    light: s => ({ backgroundColor: '#ece1cd', backgroundImage: `repeating-linear-gradient(90deg, rgba(120,90,50,.10) 0 1px, transparent 1px ${Math.max(4, 16 * s)}px)` }),
    walnut: s => ({ backgroundColor: '#a57a52', backgroundImage: `repeating-linear-gradient(90deg, rgba(50,25,10,.18) 0 1px, transparent 1px ${Math.max(4, 16 * s)}px)` }),
    tile: s => ({ backgroundColor: '#e8e6e1', backgroundImage: `linear-gradient(rgba(0,0,0,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.07) 1px, transparent 1px)`, backgroundSize: `${40 * s}px ${40 * s}px` }),
  };

  function geom(room, opt) {
    const wall = opt.wall ?? 10, dims = opt.dims !== false, m = opt.margin ?? (dims ? 30 : 0);
    let s = opt.scale;
    if (!s) { const sw = opt.fitW ? (opt.fitW - 2 * m) / (room.w + 2 * wall) : 99, shh = opt.fitH ? (opt.fitH - 2 * m) / (room.h + 2 * wall) : 99; s = Math.min(sw, shh); }
    return { s, m, wall, off: m + wall * s, W: (room.w + 2 * wall) * s + 2 * m, H: (room.h + 2 * wall) * s + 2 * m };
  }

  function DimLine({ x, y, len, vertical, label, dark }) {
    const col = dark ? 'rgba(248,247,244,.75)' : '#3b3b40';
    const tick = vertical ? { width: 9, height: 1, left: -4 } : { width: 1, height: 9, top: -4 };
    return box({ left: x, top: y, width: vertical ? 1 : len, height: vertical ? len : 1, background: col },
      box({ ...tick, background: col, ...(vertical ? { top: 0 } : { left: 0 }) }),
      box({ ...tick, background: col, ...(vertical ? { bottom: 0 } : { right: 0 }) }),
      h('div', { style: { position: 'absolute', left: vertical ? -10 : '50%', top: vertical ? '50%' : -10, transform: vertical ? 'translate(-50%,-50%) rotate(-90deg)' : 'translate(-50%,-50%)', whiteSpace: 'nowrap', font: '600 11px Manrope, sans-serif', color: dark ? '#F8F7F4' : '#1E1E22', background: dark ? '#0B0D0D' : '#F7F7F5', padding: '0 5px' } }, label));
  }

  function Plan(props) {
    const room = props.room || { w: 400, h: 320 }, items = props.items || [], doors = props.doors || [], windows = props.windows || [];
    const g = geom(room, props), s = g.s, wl = g.wall * s, unit = props.unit || 'см';
    const status = props.status || {}, showNames = props.names;
    const fl = (FLOORS[props.floor || 'oak'] || FLOORS.oak)(s);
    const kids = [];
    kids.push(box({ left: g.m, top: g.m, width: (room.w + 2 * g.wall) * s, height: (room.h + 2 * g.wall) * s, background: props.wallColor || '#2e2e33', borderRadius: 2, boxShadow: '0 10px 30px rgba(20,15,10,.18)' }));
    kids.push(box({ left: g.off, top: g.off, width: room.w * s, height: room.h * s, ...fl }));
    windows.forEach((wd, i) => {
      const hor = wd.wall === 'top' || wd.wall === 'bottom';
      const st = hor ? { left: g.off + wd.at * s, width: wd.w * s, top: wd.wall === 'top' ? g.m : g.off + room.h * s, height: wl } : { top: g.off + wd.at * s, height: wd.w * s, left: wd.wall === 'left' ? g.m : g.off + room.w * s, width: wl };
      kids.push(box({ ...st, background: '#eef4f6', border: '1px solid #8fb1c0', boxSizing: 'border-box' }, box(hor ? { left: 0, right: 0, top: '50%', height: 1, background: '#8fb1c0' } : { top: 0, bottom: 0, left: '50%', width: 1, background: '#8fb1c0' })));
    });
    doors.forEach((d, i) => {
      const dw = d.w * s, hor = d.wall === 'top' || d.wall === 'bottom';
      const gap = hor ? { left: g.off + d.at * s, width: dw, top: d.wall === 'top' ? g.m : g.off + room.h * s, height: wl } : { top: g.off + d.at * s, height: dw, left: d.wall === 'left' ? g.m : g.off + room.w * s, width: wl };
      kids.push(box({ ...gap, ...fl }));
      const pos = d.wall === 'bottom' ? { left: g.off + d.at * s, top: g.off + room.h * s - dw } : d.wall === 'top' ? { left: g.off + d.at * s, top: g.off } : d.wall === 'left' ? { left: g.off, top: g.off + d.at * s } : { left: g.off + room.w * s - dw, top: g.off + d.at * s };
      const rot = { bottom: 0, left: 90, top: 180, right: 270 }[d.wall];
      const flip = d.flip ? ' scaleX(-1)' : '';
      kids.push(box({ ...pos, width: dw, height: dw, transform: `rotate(${rot}deg)${flip}`, pointerEvents: 'none' },
        props.zones ? box({ left: 0, top: 0, width: dw, height: dw, background: 'rgba(230,90,90,.08)', borderTopRightRadius: '100%' }) : null,
        box({ left: 0, top: 0, width: dw, height: dw, borderTop: '1.2px dashed rgba(40,40,45,.55)', borderRight: '1.2px dashed rgba(40,40,45,.55)', borderTopRightRadius: '100%', boxSizing: 'border-box' }),
        box({ left: 0, top: 0, width: Math.max(2, 4 * s), height: dw, background: '#3a3a40', borderRadius: 1 })));
    });
    items.forEach(it => {
      const b = aabb(it), stt = status[it.id], sel = props.selectedId === it.id;
      kids.push(box({ left: g.off + b.x * s, top: g.off + b.y * s, width: b.w * s, height: b.h * s },
        box({ left: '50%', top: '50%', width: it.w * s, height: it.h * s, transform: `translate(-50%,-50%) rotate(${it.rot || 0}deg)` },
          h(Furn, { type: it.type, w: it.w * s, h: it.h * s, tone: it.tone }),
          stt === 'err' ? box({ inset: -2, border: '2px solid #E65A5A', background: 'rgba(230,90,90,.16)', borderRadius: 4 }) : stt === 'warn' ? box({ inset: -2, border: '2px dashed #E3A43B', borderRadius: 4 }) : null,
          sel ? box({ inset: -3, border: '1.5px solid #5FA768', borderRadius: 4 }) : null),
        showNames && it.type !== 'plant' && it.type !== 'rug' ? h('div', { style: { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', font: '600 9px Manrope', color: '#1E1E22', background: 'rgba(255,255,255,.85)', padding: '1px 4px', borderRadius: 4, whiteSpace: 'nowrap' } }, it.name) : null));
    });
    if (props.dims !== false) {
      kids.push(h(DimLine, { key: 'dt', x: g.off, y: g.m * 0.42, len: room.w * s, label: fmt(room.w, unit), dark: props.dark }));
      kids.push(h(DimLine, { key: 'dl', x: g.m * 0.42, y: g.off, len: room.h * s, vertical: true, label: fmt(room.h, unit), dark: props.dark }));
    }
    return h('div', { style: Object.assign({ position: 'relative', width: g.W, height: g.H, flex: 'none' }, props.style || {}) }, ...kids.map((k, i) => R.cloneElement(k, { key: i })));
  }

  function FurnThumb({ type, w, h: H, size }) {
    size = size || 64; const k = size / Math.max(w, H);
    return h('div', { style: { width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      h('div', { style: { position: 'relative', width: w * k, height: H * k } }, h(Furn, { type, w: w * k, h: H * k })));
  }

  const ROOMS = {
    bedroom: { name: 'Моя спальня', room: { w: 400, h: 320 }, floor: 'oak', doors: [{ wall: 'bottom', at: 300, w: 80 }], windows: [{ wall: 'top', at: 130, w: 140 }],
      items: [
        { id: 'b1', key: 'bed2', type: 'bed', name: 'Кровать', w: 160, h: 200, x: 120, y: 0, rot: 0 },
        { id: 'n1', key: 'night', type: 'nightstand', name: 'Тумба', w: 50, h: 40, x: 66, y: 4, rot: 0 },
        { id: 'n2', key: 'night', type: 'nightstand', name: 'Тумба', w: 50, h: 40, x: 284, y: 4, rot: 0 },
        { id: 'w1', key: 'ward', type: 'wardrobe', name: 'Шкаф', w: 180, h: 60, x: 0, y: 260, rot: 180 },
        { id: 'd1', key: 'desk', type: 'desk', name: 'Рабочий стол', w: 120, h: 60, x: 340, y: 60, rot: 270 },
        { id: 'p1', key: 'plant', type: 'plant', name: 'Растение', w: 45, h: 45, x: 4, y: 4, rot: 0 },
        { id: 'r1', key: 'rug', type: 'rug', name: 'Ковёр', w: 200, h: 120, x: 100, y: 150, rot: 0 },
      ] },
    bedroomB: { name: 'Моя спальня', room: { w: 400, h: 320 }, floor: 'oak', doors: [{ wall: 'bottom', at: 300, w: 80 }], windows: [{ wall: 'top', at: 130, w: 140 }],
      items: [
        { id: 'b1', key: 'bed2', type: 'bed', name: 'Кровать', w: 160, h: 200, x: 100, y: 60, rot: 90 },
        { id: 'w1', key: 'ward', type: 'wardrobe', name: 'Шкаф', w: 180, h: 60, x: 0, y: 260, rot: 180 },
        { id: 'd1', key: 'desk', type: 'desk', name: 'Рабочий стол', w: 120, h: 60, x: 340, y: 100, rot: 270 },
        { id: 'a1', key: 'arm', type: 'armchair', name: 'Кресло', w: 80, h: 80, x: 290, y: 230, rot: 0 },
        { id: 'p1', key: 'plant', type: 'plant', name: 'Растение', w: 45, h: 45, x: 4, y: 4, rot: 0 },
      ] },
    living: { name: 'Гостиная', room: { w: 520, h: 400 }, floor: 'light', doors: [{ wall: 'left', at: 290, w: 90 }], windows: [{ wall: 'top', at: 160, w: 200 }],
      items: [
        { id: 'r', type: 'rug', name: 'Ковёр', w: 260, h: 180, x: 130, y: 110 },
        { id: 's', type: 'sofa', name: 'Диван', w: 240, h: 100, x: 140, y: 296, rot: 180 },
        { id: 'c', type: 'coffee', name: 'Столик', w: 100, h: 60, x: 210, y: 170 },
        { id: 'a', type: 'armchair', name: 'Кресло', w: 80, h: 80, x: 420, y: 160, rot: 270 },
        { id: 't', type: 'tvstand', name: 'ТВ-тумба', w: 180, h: 40, x: 170, y: 0 },
        { id: 'p', type: 'plant', name: 'Растение', w: 50, h: 50, x: 466, y: 4 },
        { id: 'p2', type: 'plant', name: 'Растение', w: 45, h: 45, x: 4, y: 4 },
        { id: 'sh', type: 'shelf', name: 'Стеллаж', w: 120, h: 35, x: 0, y: 120, rot: 90 },
      ] },
    kids: { name: 'Детская', room: { w: 320, h: 300 }, floor: 'light', doors: [{ wall: 'bottom', at: 220, w: 80 }], windows: [{ wall: 'top', at: 100, w: 120 }],
      items: [
        { id: 'b', type: 'bed', name: 'Кровать', w: 90, h: 200, x: 0, y: 0, tone: '#cfe0d0' },
        { id: 'd', type: 'desk', name: 'Стол', w: 100, h: 55, x: 220, y: 0 },
        { id: 'c', type: 'chair', name: 'Стул', w: 45, h: 50, x: 247, y: 58 },
        { id: 'r', type: 'rug', name: 'Ковёр', w: 140, h: 100, x: 110, y: 120, tone: '#f1e3cf' },
        { id: 'sh', type: 'shelf', name: 'Стеллаж', w: 80, h: 35, x: 0, y: 265, rot: 180 },
        { id: 'p', type: 'plant', name: 'Растение', w: 40, h: 40, x: 276, y: 150 },
      ] },
    office: { name: 'Домашний кабинет', room: { w: 340, h: 280 }, floor: 'walnut', doors: [{ wall: 'bottom', at: 20, w: 80 }], windows: [{ wall: 'right', at: 70, w: 140 }],
      items: [
        { id: 'd', type: 'desk', name: 'Стол', w: 160, h: 70, x: 270, y: 55, rot: 90 },
        { id: 'c', type: 'chair', name: 'Кресло', w: 60, h: 60, x: 196, y: 110, rot: 90 },
        { id: 'sh', type: 'shelf', name: 'Стеллаж', w: 160, h: 35, x: 0, y: 40, rot: 90 },
        { id: 'a', type: 'armchair', name: 'Кресло', w: 80, h: 80, x: 60, y: 10 },
        { id: 'p', type: 'plant', name: 'Растение', w: 45, h: 45, x: 290, y: 230 },
      ] },
    studio: { name: 'Студия', room: { w: 600, h: 400 }, floor: 'oak', doors: [{ wall: 'bottom', at: 500, w: 90 }], windows: [{ wall: 'top', at: 80, w: 160 }, { wall: 'top', at: 360, w: 160 }],
      items: [
        { id: 'b', type: 'bed', name: 'Кровать', w: 160, h: 200, x: 30, y: 0 },
        { id: 'n', type: 'nightstand', name: 'Тумба', w: 45, h: 40, x: 194, y: 4 },
        { id: 's', type: 'sofa', name: 'Диван', w: 200, h: 90, x: 330, y: 190, rot: 180 },
        { id: 'c', type: 'coffee', name: 'Столик', w: 80, h: 50, x: 390, y: 110 },
        { id: 'k', type: 'kitchen', name: 'Кухня', w: 240, h: 60, x: 0, y: 340, rot: 180 },
        { id: 't', type: 'table', name: 'Стол', w: 100, h: 70, x: 280, y: 300 },
        { id: 'p', type: 'plant', name: 'Растение', w: 45, h: 45, x: 550, y: 4 },
      ] },
    kitchen: { name: 'Кухня', room: { w: 310, h: 280 }, floor: 'tile', doors: [{ wall: 'bottom', at: 210, w: 80 }], windows: [{ wall: 'top', at: 100, w: 120 }],
      items: [
        { id: 'k', type: 'kitchen', name: 'Гарнитур', w: 240, h: 60, x: 0, y: 0 },
        { id: 'k2', type: 'kitchen', name: 'Гарнитур', w: 120, h: 60, x: 250, y: 30, rot: 90 },
        { id: 't', type: 'table', name: 'Стол', w: 120, h: 80, x: 40, y: 140 },
        { id: 'c1', type: 'chair', name: 'Стул', w: 45, h: 50, x: 77, y: 225, rot: 180 },
        { id: 'c2', type: 'chair', name: 'Стул', w: 45, h: 50, x: 77, y: 87 },
        { id: 'p', type: 'plant', name: 'Растение', w: 40, h: 40, x: 4, y: 236 },
      ] },
  };

  const api = { Furn, FurnThumb, Plan, analyze, rays, between, aabb, fmt, geom, CATALOG, CATS, ROOMS, FLOORS };
  window.RoomFit = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
