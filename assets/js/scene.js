/* ==========================================================
   SCANDIUM AG – 3D-Hintergrund (Three.js)
   Eine gemeinsame Bildsprache, pro Seite ein eigenes Motiv:
     data-scene="home"        Startseite: Planen · Betreuen · Erneuern
     data-scene="technik"     Gebäudetechnik: echter Grundriss + Gewerke
     data-scene="renovation"  Sanierung & Renovation: Wohnung, die sich zusammensetzt
     data-scene="about"       Über uns: 126 Projekte in der Region, Hauptsitz Zürich
     data-scene="jobs"        Jobs: Büro mit einem freien Arbeitsplatz
     data-scene="verwaltung"  Verwaltung STWEG: Gemeinschaft, Verwaltung, Jahreskreis
   Schwarz/Weiss; Farbe nur für Heizung (rot), Sanitär (grün), Lüftung (blau).
   Klassisches Skript mit dynamischem Import: läuft auf GitHub
   Pages und auch beim lokalen Öffnen per Doppelklick (file://).
   ========================================================== */
(function () {
var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js';
var canvas = document.getElementById('scene');
if (!canvas) return;
var KIND = canvas.getAttribute('data-scene') || 'technik';

import(THREE_URL).then(function (THREE) {
  try { run(THREE); } catch (e) { console.warn('3D-Szene deaktiviert:', e); }
}).catch(function (e) { console.warn('Three.js konnte nicht geladen werden:', e); });

var COLORS = { heat: 0xe5484d, san: 0x2f9e66, vent: 0x4a86e8 };

/* ---------------- Gemeinsamer Rahmen ---------------- */
function run(THREE) {
  const mqMobile = window.matchMedia('(max-width: 820px)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let isMobile = mqMobile.matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 14, 38);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 160);
  const V = THREE.Vector3;

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const mat = (opacity, color = 0xffffff) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

  const H = {
    segs(arr, opacity, color) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const ls = new THREE.LineSegments(g, mat(opacity, color));
      ls.frustumCulled = false;
      return ls;
    },
    box(w, h, d, opacity, color) {
      const ls = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), mat(opacity, color));
      return ls;
    },
    densify(pts, step) {
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
        for (let j = 0; j < n; j++) out.push(a.clone().lerp(b, j / n));
      }
      out.push(pts[pts.length - 1].clone());
      return out;
    },
    // Linie, die sich entlang des Pfades zeichnet
    growLine(pts, opacity, color, step) {
      const geo = new THREE.BufferGeometry().setFromPoints(H.densify(pts, step || 0.25));
      geo.setDrawRange(0, 0);
      const line = new THREE.Line(geo, mat(opacity, color));
      line.frustumCulled = false;
      return { obj: line, geo, count: geo.attributes.position.count, pair: 1 };
    },
    // Rechteckkanal (Lüftung) als Liniensegmente
    ductPositions(a, b, w, h, out, step = 0.6, ringEvery = 2.0) {
      const dir = b.clone().sub(a);
      const L = dir.length();
      if (L < 0.01) return;
      dir.normalize();
      let u, v;
      if (Math.abs(dir.y) > 0.9) { u = new V(1, 0, 0); v = new V(0, 0, 1); }
      else { u = new V().crossVectors(dir, new V(0, 1, 0)).normalize(); v = new V(0, 1, 0); }
      const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([s, t]) =>
        u.clone().multiplyScalar(s * w / 2).add(v.clone().multiplyScalar(t * h / 2)));
      const push = (p, q) => out.push(p.x, p.y, p.z, q.x, q.y, q.z);
      const ring = (p) => { for (let k = 0; k < 4; k++) push(p.clone().add(corners[k]), p.clone().add(corners[(k + 1) % 4])); };
      ring(a);
      const n = Math.max(1, Math.ceil(L / step));
      for (let j = 0; j < n; j++) {
        const s0 = (j / n) * L, s1 = ((j + 1) / n) * L;
        const p0 = a.clone().addScaledVector(dir, s0), p1 = a.clone().addScaledVector(dir, s1);
        for (const c of corners) push(p0.clone().add(c), p1.clone().add(c));
        if (Math.floor(s1 / ringEvery) > Math.floor(s0 / ringEvery) && j < n - 1) ring(p1);
      }
      ring(b);
    },
    growDuct(pts, w, h, opacity, color, step, ringEvery) {
      const pos = [];
      for (let i = 0; i < pts.length - 1; i++) H.ductPositions(pts[i], pts[i + 1], w, h, pos, step, ringEvery);
      const ls = H.segs(pos, opacity, color);
      ls.geometry.setDrawRange(0, 0);
      return { obj: ls, geo: ls.geometry, count: pos.length / 3, pair: 2 };
    },
    // Leitung mit sichtbarer Stärke (Rohr), wächst entlang des Pfades
    growTube(pts, radius, opacity, color) {
      const path = new THREE.CurvePath();
      let len = 0;
      for (let i = 0; i < pts.length - 1; i++) { path.add(new THREE.LineCurve3(pts[i], pts[i + 1])); len += pts[i].distanceTo(pts[i + 1]); }
      const segs = Math.max(8, Math.ceil(len / (radius * 3)));
      const geo = new THREE.TubeGeometry(path, segs, radius, 6, false);
      geo.setDrawRange(0, 0);
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      const mesh = new THREE.Mesh(geo, m);
      mesh.frustumCulled = false;
      return { obj: mesh, geo, count: geo.index.count, pair: 6 };
    },
    setGrow(item, k) {
      const c = Math.floor(clamp01(k) * item.count);
      item.geo.setDrawRange(0, item.pair > 1 ? c - (c % item.pair) : c);
    }
  };

  const ctx = { THREE, scene, V, H, mat, clamp01, smooth, easeOut, reduce, mobile: () => isMobile };
  const builders = { home: buildHome, technik: buildTechnik, renovation: buildRenovation, verwaltung: buildVerwaltung, about: buildAbout, jobs: buildJobs, scanda: buildScanda };
  const api = (builders[KIND] || buildHome)(ctx) || buildHome(ctx);
  const cam = api.cam;

  // Bodenraster
  const grid = new THREE.GridHelper(cam.gridSize || 44, cam.gridSize || 44, 0xffffff, 0xffffff);
  grid.material.transparent = true;
  grid.material.opacity = 0.05;
  grid.material.depthWrite = false;
  grid.position.y = cam.gridY || 0;
  scene.add(grid);

  // Legende (nur wo vorhanden)
  const legend = document.querySelector('.legend');
  const legendItems = legend ? {
    heat: legend.querySelector('[data-trade="heat"]'),
    san: legend.querySelector('[data-trade="san"]'),
    vent: legend.querySelector('[data-trade="vent"]')
  } : null;
  function applyLegend(info) {
    if (!legend) return;
    legend.classList.toggle('show', !!(info && info.show));
    if (info && legendItems) Object.keys(legendItems).forEach((k) => {
      if (legendItems[k]) legendItems[k].classList.toggle('on', (info[k] || 0) > 0.02);
    });
  }

  // Scroll
  const endEl = document.querySelector('[data-scene-end]');
  let scrollEnd = 1;
  const measure = () => {
    scrollEnd = endEl
      ? Math.max(1, endEl.offsetTop + endEl.offsetHeight - window.innerHeight)
      : Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  };
  const getProgress = () => Math.min(1, Math.max(0, window.scrollY / scrollEnd));

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!reduce) {
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  const pick = (pair) => (Array.isArray(pair) ? pair[isMobile ? 1 : 0] : pair);
  let lastW = 0;
  function resize(force) {
    const w = window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (!force && w === lastW) return;
    lastW = w;
    isMobile = mqMobile.matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = pick(cam.fov || [34, 44]);
    if (isMobile) camera.setViewOffset(w, h, 0, h * (cam.mobileShift != null ? cam.mobileShift : 0.3), w, h);
    else camera.setViewOffset(w, h, -w * (w > 1100 ? (cam.shift || 0.25) : 0.2), -h * 0.02, w, h);
    camera.updateProjectionMatrix();
    measure();
  }
  window.addEventListener('resize', () => resize(false));
  window.addEventListener('orientationchange', () => setTimeout(() => resize(true), 200));
  window.addEventListener('load', measure);
  resize(true);

  function placeCamera(p, t, info) {
    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;
    const idle = reduce ? 0 : t * (cam.idle != null ? cam.idle : 0.015);
    const ang = cam.ang0 + p * cam.sweep + idle + mouse.x * 0.05;
    const r = pick(cam.r) - p * pick(cam.dr);
    const y = pick(cam.y) + p * pick(cam.dy) - mouse.y * 0.4;
    const zoom = info && info.zoom ? info.zoom : 0;
    let lx = 0, ly = cam.look + p * (cam.dlook || 0), lz = 0, rr = r, yy = y;
    if (zoom > 0 && info.focus) {
      const e = zoom * zoom * (3 - 2 * zoom);
      lx = info.focus[0] * e; lz = info.focus[2] * e;
      ly = ly + (info.focus[1] - ly) * e;
      rr = r * (1 - (isMobile ? 0.2 : 0.55) * e);
      yy = y + (info.focus[1] + 1.4 - y) * e;
    }
    camera.position.set(lx + Math.sin(ang) * rr, yy, lz + Math.cos(ang) * rr);
    const look = ly;
    camera.lookAt(lx, ly, lz);
    const dist = Math.hypot(rr, yy - look);
    scene.fog.near = dist - (cam.fogNear || 6);
    scene.fog.far = dist + (cam.fogFar || 20);
  }

  let last = performance.now();
  let cur = getProgress();
  let intro = reduce ? 1 : 0;
  const t0 = performance.now();
  let t = 0;
  let first = true;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;
    cur += (getProgress() - cur) * (reduce ? 1 : 1 - Math.exp(-dt * 4.5));
    if (!reduce) intro = Math.min(1, (now - t0) / 1400);
    const visible = window.scrollY < scrollEnd + window.innerHeight * 0.5;
    if (!visible && legend) legend.classList.remove('show');
    if (visible || first) {
      const info = api.update(cur, intro, t);
      if (visible) applyLegend(info);
      placeCamera(reduce ? 0.5 : cur, t, reduce ? null : info);
      renderer.render(scene, camera);
      if (first) { canvas.classList.add('ready'); first = false; }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ======================================================
   STARTSEITE – ein Gebäude, drei Sparten
   Hero: Tragstruktur · 01 Leitungen · 02 Wohneinheiten
   (Stockwerkeigentum) · 03 neue Fassade und PV
   ====================================================== */
function buildHome(c) {
  const { THREE, scene, V, H, clamp01, smooth, easeOut } = c;
  const W = 8, D = 6, FH = 1.25, N = 5, TOP = N * FH;
  const root = new THREE.Group();
  scene.add(root);

  // Tragstruktur
  const colPos = [];
  [-W / 2, -W / 6, W / 6, W / 2].forEach((x) => [-D / 2, 0, D / 2].forEach((z) => colPos.push(x, 0, z, x, FH, z)));
  const floors = [];
  for (let i = 0; i <= N; i++) {
    const g = new THREE.Group();
    g.position.y = i * FH;
    const slab = H.box(W + 0.3, 0.12, D + 0.3, 0);
    g.add(slab);
    let cols = null;
    if (i < N) { cols = H.segs(colPos.slice(), 0.3); cols.scale.y = 0.0001; g.add(cols); }
    root.add(g);
    floors.push({ g, slab, cols, y: i * FH });
  }

  // 01 Gebäudetechnik: Steigzone und Verteilung je Geschoss
  const pipes = { heat: [], san: [], vent: [] };
  const RX = -2.6, RZ = -2.2;
  [['heat', 0, 0.85], ['san', 0.32, 0.8], ['vent', 0.7, 0.7]].forEach(([name, o, op], ti) => {
    const make = (pts) => {
      const it = name === 'vent'
        ? H.growDuct(pts, 0.32, 0.2, op, COLORS.vent, 0.5, 1.6)
        : H.growTube(pts, 0.022, op, COLORS[name]);
      root.add(it.obj);
      return it;
    };
    const riser = make([new V(RX + o, 0.05, RZ), new V(RX + o, TOP - 0.25, RZ)]);
    riser.s = 0; riser.d = 0.35;
    pipes[name].push(riser);
    for (let f = 0; f < N; f++) {
      const y = f * FH + FH - 0.3 - ti * 0.12;
      const it = make([new V(RX + o, y, RZ), new V(RX + o, y, 1.9 - o), new V(2.8 - o, y, 1.9 - o), new V(2.8 - o, y, -1.2)]);
      it.s = 0.25 + f * 0.1; it.d = 0.35;
      pipes[name].push(it);
    }
  });

  // 01b Kollision im Modell: Heizleitung kreuzt den Lüftungskanal in Geschoss 3
  const CF = 2;
  const yv = CF * FH + FH - 0.3 - 2 * 0.12;          // Höhe Lüftungskanal
  const KX = 0.6, KZ = 1.9 - 0.7;                     // Kreuzungspunkt: senkrechte Leitung durch den Kanal
  const clash = H.growTube([new V(KX, yv + 0.95, KZ), new V(KX, yv - 0.95, KZ)], 0.03, 0.95, COLORS.heat);
  const fix = H.growTube([new V(KX, yv + 0.95, KZ), new V(KX, yv + 0.45, KZ), new V(KX, yv + 0.3, KZ + 0.6),
    new V(KX, yv - 0.3, KZ + 0.6), new V(KX, yv - 0.45, KZ), new V(KX, yv - 0.95, KZ)], 0.03, 0.95, COLORS.heat);
  root.add(clash.obj); root.add(fix.obj);
  const mark = new THREE.Group();
  mark.position.set(KX, yv, KZ);
  const ringGeo = new THREE.RingGeometry(0.27, 0.295, 48);
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  const ringMesh = new THREE.Mesh(ringGeo, ringM);
  const tick = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V(-0.14, 0.0, 0), new V(-0.04, -0.1, 0), new V(0.16, 0.12, 0)]),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false }));
  mark.add(ringMesh); mark.add(tick);
  mark.renderOrder = 10;
  ringMesh.onBeforeRender = (r, sc, cam) => { mark.quaternion.copy(cam.quaternion); };
  root.add(mark);

  // 02 Verwaltung STWEG: Wohneinheiten
  const units = [];
  for (let f = 0; f < N; f++) {
    [-W / 4, W / 4].forEach((x, k) => {
      const b = H.box(W / 2 - 0.35, FH - 0.3, D - 0.4, 0);
      b.position.set(x, f * FH + FH / 2 + 0.03, 0);
      root.add(b);
      units.push({ b, i: f * 2 + k });
    });
  }

  // 03 Sanierung: neue Fassade (vertikale Lamellen) und PV auf dem Dach
  const finFront = [], finSide = [];
  for (let x = -W / 2; x <= W / 2 + 0.001; x += 0.5) finFront.push(x, 0, 0, x, TOP, 0);
  for (let z = -D / 2; z <= D / 2 + 0.001; z += 0.5) finSide.push(0, 0, z, 0, TOP, z);
  const front = H.segs(finFront, 0); front.position.z = D / 2 + 0.3; root.add(front);
  const side = H.segs(finSide, 0); side.position.x = W / 2 + 0.3; root.add(side);
  const pv = [];
  const pvPos = [];
  for (let ix = 0; ix < 5; ix++) for (let iz = 0; iz < 4; iz++) {
    const x0 = -3.0 + ix * 1.25, z0 = -2.2 + iz * 1.15, w = 1.05, d = 0.9, y = TOP + 0.25 + iz * 0.0;
    pvPos.push(x0, y, z0, x0 + w, y, z0, x0 + w, y, z0, x0 + w, y + 0.18, z0 + d,
               x0 + w, y + 0.18, z0 + d, x0, y + 0.18, z0 + d, x0, y + 0.18, z0 + d, x0, y, z0);
  }
  const pvObj = H.segs(pvPos, 0.8);
  pvObj.geometry.setDrawRange(0, 0);
  root.add(pvObj);
  const pvCount = pvPos.length / 3;

  function update(p, intro, t) {
    // Hero: Struktur
    const build = intro;
    floors.forEach((f, i) => {
      const k = easeOut(clamp01(build * (N + 0.8) - i));
      f.g.position.y = f.y + (1 - k) * 0.7;
      f.slab.material.opacity = 0.55 * k;
      f.slab.visible = k > 0.001;
      if (f.cols) { f.cols.scale.y = Math.max(0.0001, k); f.cols.visible = k > 0.001; }
    });

    // 01 Leitungen
    const q1 = Math.max(0.6 * intro, smooth(0.08, 0.25, p));
    const fade = 1 - 0.75 * smooth(0.46, 0.58, p);
    const info = { show: p < 0.52 };
    Object.keys(pipes).forEach((name) => {
      pipes[name].forEach((it) => {
        H.setGrow(it, (q1 - it.s) / it.d);
        it.obj.material.opacity = (name === 'vent' ? 0.7 : 0.85) * fade;
      });
      info[name] = q1;
    });

    // 01b Kollision: erscheint, pulsiert, wird gelöst
    const z = smooth(0.18, 0.3, p) * (1 - smooth(0.46, 0.56, p));
    const kc = smooth(0.26, 0.31, p);           // Leitung kollidiert
    const ks = smooth(0.36, 0.42, p);           // gelöst
    H.setGrow(clash, kc);
    clash.obj.material.opacity = 0.95 * (1 - ks) * fade;
    clash.obj.visible = kc > 0.001 && ks < 0.999;
    H.setGrow(fix, ks);
    fix.obj.material.opacity = 0.95 * fade;
    fix.obj.visible = ks > 0.001;
    const pulse = kc > 0.99 && ks < 0.01 ? 0.5 + 0.5 * Math.sin(t * 7) : 0;
    ringM.opacity = (kc * (1 - ks) * (0.55 + 0.45 * pulse) + ks * 0.9) * z;
    ringM.color.setHex(ks > 0.5 ? 0xffffff : COLORS.heat);
    tick.material.opacity = ks * z;
    mark.scale.setScalar(1 + 0.15 * pulse);
    info.zoom = z;
    info.focus = [KX, yv, KZ];

    // 02 Wohneinheiten nacheinander
    const q2 = smooth(0.45, 0.66, p);
    const out2 = 1 - 0.75 * smooth(0.74, 0.86, p);
    units.forEach((u) => {
      const k = clamp01(q2 * (units.length + 2) - u.i);
      const flash = k > 0 && k < 1 ? 0.35 * Math.sin(k * Math.PI) : 0;
      u.b.material.opacity = (0.7 * k + flash) * out2;
      u.b.visible = k > 0.001;
    });

    // 03 Fassade und PV
    const q3 = smooth(0.72, 0.97, p);
    const kf = easeOut(clamp01(q3 / 0.6));
    front.material.opacity = 0.32 * kf; front.position.z = D / 2 + 0.3 + (1 - kf) * 2.2;
    side.material.opacity = 0.32 * kf; side.position.x = W / 2 + 0.3 + (1 - kf) * 2.2;
    front.visible = side.visible = kf > 0.001;
    const kp = clamp01((q3 - 0.4) / 0.6);
    const n = Math.floor(kp * pvCount);
    pvObj.geometry.setDrawRange(0, n - (n % 2));
    return info;
  }

  return {
    update,
    cam: {
      ang0: -0.75, sweep: 1.9, idle: 0.018,
      r: [29, 52], dr: [2, 3],
      y: [5, 14], dy: [7, 3],
      look: TOP * 0.45, dlook: 0.4, fov: [34, 44], gridY: 0, mobileShift: 0.34, shift: 0.26
    }
  };
}

/* ======================================================
   GEBÄUDETECHNIK – echter Grundriss + Gewerke
   ====================================================== */
function buildTechnik(c) {
  const DATA = window.SCANDIUM_BUILDING;
  if (!DATA) return null;
  const { THREE, scene, V, H, clamp01, smooth, easeOut, mobile } = c;
  const SCALE = 0.17;
  const root = new THREE.Group();
  root.scale.setScalar(SCALE);
  scene.add(root);

  const WALL_H = 2.7;
  const LEVELS = [
    { key: 'ug', y: -3 }, { key: 'eg', y: 0 }, { key: 'og', y: 3 },
    { key: 'og', y: 6 }, { key: 'og', y: 9 }, { key: 'at', y: 12 }
  ];
  function ringSegments(rings, y, out) {
    rings.forEach((r) => { for (let i = 0; i < r.length - 1; i++) out.push(r[i][0], y, r[i][1], r[i + 1][0], y, r[i + 1][1]); });
  }
  function verticalSegments(rings, h, out) {
    rings.forEach((r) => { for (let i = 0; i < r.length - 1; i++) out.push(r[i][0], 0, r[i][1], r[i][0], h, r[i][1]); });
  }

  const floors = [];
  LEVELS.forEach((lv) => {
    const d = DATA[lv.key];
    const group = new THREE.Group();
    group.position.y = lv.y;
    const a1 = []; ringSegments(d.outline, 0, a1);
    const a2 = []; ringSegments(d.walls, 0.02, a2);
    const a3 = []; ringSegments(d.walls, WALL_H, a3);
    const a4 = []; verticalSegments(d.walls, WALL_H, a4);
    const slab = H.segs(a1, 0), base = H.segs(a2, 0), top = H.segs(a3, 0.2), vert = H.segs(a4, 0.07);
    const wallGroup = new THREE.Group();
    wallGroup.add(top, vert);
    wallGroup.scale.y = 0.0001;
    group.add(slab, base, wallGroup);
    root.add(group);
    floors.push({ group, slab, base, wallGroup, top, vert, y: lv.y });
  });
  {
    const arr = []; ringSegments(DATA.at.outline, 0, arr);
    const roof = H.segs(arr, 0);
    const g = new THREE.Group(); g.position.y = 15; g.add(roof); root.add(g);
    floors.push({ group: g, slab: roof, y: 15, roof: true });
  }

  const trades = { heat: [], san: [], vent: [] };
  const HOUSES = [
    { rx: -10.2, rz: -4.0, west: { z: -1.0, x: -22, end: 4 }, east: { z: 3.2, x: -6.0, end: -2 } },
    { rx: 15.8, rz: -3.4, west: { z: -0.8, x: 8.6, end: 4 }, east: { z: 2.2, x: 21.5, end: -4 } }
  ];
  const TRADE = { heat: { off: 0, y: 2.3, pairOff: 0.22 }, san: { off: 0.55, y: 2.15 }, vent: { off: 1.2, y: 2.45 } };
  const TECH = { x: -9.9, z: -5.6 };
  const UG_Z = -2.6;
  function routeTrade(name) {
    const t = TRADE[name];
    const variants = name === 'heat' ? [0, t.pairOff] : [0];
    variants.forEach((pv) => {
      const o = t.off + pv;
      const yUG = -3 + t.y;
      const make = (pts, s, d) => {
        const it = name === 'vent' ? H.growDuct(pts, 0.5, 0.3, 0.75, COLORS.vent) : H.growTube(pts, 0.11, 0.95, COLORS[name]);
        it.s = s; it.d = d;
        root.add(it.obj);
        trades[name].push(it);
      };
      make([new V(TECH.x + o, yUG, TECH.z), new V(TECH.x + o, yUG, UG_Z + o),
            new V(HOUSES[1].rx + o, yUG, UG_Z + o), new V(HOUSES[1].rx + o, yUG, HOUSES[1].rz)], 0.0, 0.3);
      HOUSES.forEach((hs, hi) => {
        const rx = hs.rx + o;
        make([new V(rx, yUG, hs.rz), new V(rx, 12 + t.y, hs.rz)], 0.18 + hi * 0.06, 0.3);
        for (let f = 0; f < 5; f++) {
          const y = f * 3 + t.y;
          const s = 0.36 + f * 0.08 + hi * 0.03;
          const w = hs.west, e = hs.east;
          make([new V(rx, y, hs.rz), new V(rx, y, w.z + o), new V(w.x + o, y, w.z + o), new V(w.x + o, y, w.end)], s, 0.26);
          make([new V(rx, y, hs.rz), new V(rx, y, e.z + o), new V(e.x - o, y, e.z + o), new V(e.x - o, y, e.end)], s + 0.02, 0.26);
        }
      });
    });
  }
  routeTrade('heat'); routeTrade('san'); routeTrade('vent');

  const PHASE = { heat: [0.2, 0.5], san: [0.38, 0.68], vent: [0.55, 0.9] };
  function update(p, intro) {
    const build = intro * (0.3 + 0.7 * smooth(0.0, 0.36, p));
    const n = floors.length;
    const boost = mobile() ? 1.7 : 1;
    floors.forEach((f, i) => {
      const k = easeOut(clamp01(build * (n + 0.5) - i));
      f.group.position.y = f.y + (1 - k) * 1.6;
      f.slab.material.opacity = Math.min(1, 0.5 * boost) * k;
      f.slab.visible = k > 0.001;
      if (!f.roof) {
        f.base.material.opacity = Math.min(1, 0.42 * boost) * k;
        f.top.material.opacity = 0.2 * boost;
        f.vert.material.opacity = 0.07 * boost;
        f.base.visible = k > 0.001;
        f.wallGroup.scale.y = Math.max(0.0001, k);
        f.wallGroup.visible = k > 0.001;
      }
    });
    const info = { show: p > 0.15 && p < 0.995 };
    Object.keys(trades).forEach((name) => {
      const tp = smooth(PHASE[name][0], PHASE[name][1], p);
      trades[name].forEach((it) => H.setGrow(it, (tp - it.s) / it.d));
      info[name] = tp;
    });
    return info;
  }

  return {
    update,
    cam: {
      ang0: -0.6, sweep: 1.5, idle: 0.015,
      r: [19, 34], dr: [2.5, 4],
      y: [5.2, 14], dy: [5.5, 2],
      look: 0.9, fov: [34, 44], gridY: -3.2 * SCALE, mobileShift: 0.3
    }
  };
}

/* ======================================================
   SANIERUNG & RENOVATION – Wohnung als Explosionszeichnung
   Produkte schweben über ihrem Platz und setzen sich beim
   Scrollen zusammen (Produkt + Montage).
   ====================================================== */
function buildRenovation(c) {
  const { THREE, scene, V, H, clamp01, smooth, easeOut } = c;
  const root = new THREE.Group();
  scene.add(root);
  const RW = 7, RD = 5, RH = 2.6;          // Raum (m)
  const X0 = -RW / 2, Z0 = -RD / 2;

  // --- Rohbau: Boden, Rückwand, linke Wand, Trennwand Bad ---
  const shell = new THREE.Group();
  const floor = H.box(RW, 0.08, RD, 0.5); floor.position.set(0, -0.04, 0); shell.add(floor);
  const back = H.box(RW, RH, 0.14, 0.45); back.position.set(0, RH / 2, Z0 - 0.07); shell.add(back);
  const left = H.box(0.14, RH, RD, 0.45); left.position.set(X0 - 0.07, RH / 2, 0); shell.add(left);
  const part = H.box(0.1, RH, 2.6, 0.35); part.position.set(1.0, RH / 2, Z0 + 1.3); shell.add(part);
  shell.scale.y = 0.0001;
  root.add(shell);

  // Bauteile: Gruppe + Zielposition + Explosions-Versatz
  const parts = [];
  function part3(group, target, off, order) {
    group.position.copy(target).add(off);
    group.userData = { target, off, order };
    group.traverse((o) => { if (o.material) o.userData.base = o.material.opacity; });
    root.add(group);
    parts.push(group);
  }
  function g(...objs) { const gr = new THREE.Group(); objs.forEach((o) => gr.add(o)); return gr; }
  function at(o, x, y, z) { o.position.set(x, y, z); return o; }
  function circle(r, n, opacity) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push(new V(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), c.mat(opacity));
  }

  // Bodenbelag: Parkett (Wohnen) und Platten (Bad)
  const plank = [];
  for (let z = Z0 + 0.22; z < RD / 2; z += 0.22) plank.push(X0, 0, z, 1.0, 0, z);
  for (let z = Z0 + 0.55; z < RD / 2; z += 0.22) plank.push(1.0, 0, z, RW / 2, 0, z);
  for (let x = 1.3; x < RW / 2; x += 0.3) plank.push(x, 0, Z0, x, 0, Z0 + 2.6);
  const planks = H.segs(plank, 0.22);
  part3(g(planks), new V(0, 0.005, 0), new V(0, -0.6, 0), 0);

  // Küche an der Rückwand
  const kx = -1.4, kLen = 3.6;
  const base = H.box(kLen, 0.85, 0.6, 0.8);
  const doors = [];
  for (let x = -kLen / 2 + 0.6; x < kLen / 2 - 0.01; x += 0.6) doors.push(x, -0.42, 0.301, x, 0.42, 0.301);
  const top = H.box(kLen + 0.06, 0.04, 0.64, 0.9); top.position.y = 0.445;
  const sink = H.box(0.6, 0.02, 0.4, 0.8); sink.position.set(0.6, 0.47, 0);
  const hob = g(at(circle(0.1, 24, 0.8), -0.95, 0.47, -0.1), at(circle(0.1, 24, 0.8), -0.7, 0.47, -0.1),
                at(circle(0.08, 24, 0.8), -0.95, 0.47, 0.12), at(circle(0.08, 24, 0.8), -0.7, 0.47, 0.12));
  const kitchen = g(base, H.segs(doors, 0.45), top, sink, hob);
  part3(kitchen, new V(kx, 0.425, Z0 + 0.3), new V(0.3, 1.9, 1.2), 1);
  const upper = H.box(kLen, 0.7, 0.35, 0.7);
  const ud = [];
  for (let x = -kLen / 2 + 0.6; x < kLen / 2 - 0.01; x += 0.6) ud.push(x, -0.35, 0.176, x, 0.35, 0.176);
  part3(g(upper, H.segs(ud, 0.4)), new V(kx, 1.95, Z0 + 0.175), new V(0.2, 2.2, 1.0), 2);

  // Bad: Badewanne, WC, Lavabo
  const tub = g(H.box(0.78, 0.55, 1.7, 0.85), at(H.box(0.62, 0.02, 1.52, 0.6), 0, 0.27, 0));
  part3(tub, new V(3.05, 0.275, Z0 + 0.95), new V(0.9, 1.8, 0.5), 3);
  const wc = g(at(H.box(0.38, 0.4, 0.55, 0.85), 0, 0.2, 0.05), at(H.box(0.38, 0.38, 0.14, 0.85), 0, 0.6, -0.2));
  part3(wc, new V(1.45, 0, Z0 + 0.35), new V(0.5, 2.2, 0.8), 4);
  const lav = g(at(H.box(0.6, 0.12, 0.45, 0.9), 0, 0.86, 0), at(H.box(0.6, 0.42, 0.42, 0.6), 0, 0.55, 0),
                at(H.box(0.5, 0.6, 0.02, 0.6), 0, 1.55, -0.21));
  part3(lav, new V(2.2, 0, Z0 + 0.24), new V(0.7, 2.0, 1.0), 5);

  // Fenster in der linken Wand + Storen
  const win = g(H.box(0.16, 1.4, 1.6, 0.9), H.segs([0, -0.7, 0, 0, 0.7, 0], 0.6));
  part3(win, new V(X0 - 0.07, 1.45, 0.8), new V(-1.6, 0.8, 0.5), 6);
  const lam = [];
  const NL = 16;
  for (let i = 0; i < NL; i++) { const y = 2.15 - i * 0.09; lam.push(0, y, -0.8, 0, y, 0.8); }
  const storen = H.segs(lam, 0.75);
  storen.geometry.setDrawRange(0, 0);
  const storenBox = H.box(0.18, 0.16, 1.7, 0.8); storenBox.position.y = 2.3;
  const storenG = g(storen, storenBox);
  part3(storenG, new V(X0 - 0.26, 0, 0.8), new V(-1.8, 1.2, 0.5), 7);

  // Elektro: Steckdosen, Schalter, Leuchte
  const sock = (x, y, z, rotY) => { const b = H.box(0.09, 0.09, 0.02, 0.9); b.position.set(x, y, z); b.rotation.y = rotY || 0; return b; };
  const elec = g(sock(-2.6, 1.1, Z0 + 0.01), sock(-2.45, 1.1, Z0 + 0.01), sock(-0.3, 1.1, Z0 + 0.01),
                 sock(X0 + 0.01, 0.3, -1.4, Math.PI / 2), sock(X0 + 0.01, 0.3, 2.0, Math.PI / 2),
                 sock(0.92, 1.05, 0.25, Math.PI / 2));
  part3(elec, new V(0, 0, 0), new V(0, 1.3, 0.6), 8);
  const lamp = g(H.segs([0, RH, 0, 0, RH - 0.7, 0], 0.6), at(circle(0.22, 32, 0.85), 0, RH - 0.7, 0),
                 at(circle(0.12, 32, 0.6), 0, RH - 0.55, 0));
  part3(lamp, new V(-1.3, 0, 0.6), new V(0, 1.2, 0), 9);

  const NP = parts.length;
  function update(p, intro) {
    const k0 = easeOut(clamp01(intro));
    shell.scale.y = Math.max(0.0001, k0);

    // Explosion -> Montage
    const q = smooth(0.08, 0.9, p);
    parts.forEach((gr) => {
      const { target, off, order } = gr.userData;
      const s = (order / NP) * 0.62;
      const k = easeOut(clamp01((q - s) / 0.38));
      const appear = clamp01(intro * 1.4 - 0.25 - order * 0.04);
      gr.position.set(target.x + off.x * (1 - k), target.y + off.y * (1 - k), target.z + off.z * (1 - k));
      gr.traverse((o) => { if (o.material) o.material.opacity = o.userData.base * appear * (0.45 + 0.55 * k); });
    });
    // Storen fahren am Schluss herunter
    const ks = clamp01((q - 0.8) / 0.2);
    const n = Math.floor(ks * NL) * 2;
    storen.geometry.setDrawRange(0, n);
    return null;
  }

  return {
    update,
    cam: {
      ang0: 0.95, sweep: -0.4, idle: 0.01, shift: 0.19,
      r: [18, 19.5], dr: [1, 2.5],
      y: [8.5, 11], dy: [-2.5, -2.5],
      look: 2.0, dlook: -0.8, fov: [34, 44], gridY: -0.09, gridSize: 30, mobileShift: 0.2,
      fogNear: 8, fogFar: 16
    }
  };
}

/* ======================================================
   VERWALTUNG STWEG – eine Gemeinschaft, ein Ansprechpartner
   Wohneinheiten fügen sich zum Gebäude, jede Einheit wird mit
   der Verwaltung verbunden, ein Jahreskreis schliesst sich.
   ====================================================== */
function buildVerwaltung(c) {
  const { THREE, scene, V, H, clamp01, smooth, easeOut } = c;
  const root = new THREE.Group();
  scene.add(root);
  const W = 7.5, D = 5.5, FH = 1.3, N = 5, COLS = 3;
  const TOP = N * FH;
  const uw = W / COLS;

  // Wohneinheiten (Stockwerkeigentum)
  const units = [];
  for (let f = 0; f < N; f++) {
    for (let k = 0; k < COLS; k++) {
      const b = H.box(uw - 0.18, FH - 0.18, D - 0.3, 0);
      const target = new V(-W / 2 + uw * (k + 0.5), f * FH + FH / 2, 0);
      b.position.copy(target);
      root.add(b);
      units.push({ b, target, f, k, i: f * COLS + k });
    }
  }
  // Gebäudehülle (Platten)
  const slabs = [];
  for (let f = 0; f <= N; f++) {
    const s = H.box(W + 0.3, 0.08, D + 0.3, 0);
    s.position.y = f * FH;
    root.add(s);
    slabs.push({ s, f });
  }

  // Verwaltung: Knoten vor dem Gebäude
  const HUB = new V(-W / 2 - 0.9, TOP * 0.45, D / 2 + 2.6);
  const hub = new THREE.Group();
  const hubBox = H.box(0.55, 0.55, 0.55, 0);
  hubBox.rotation.set(Math.PI / 4, Math.PI / 4, 0);
  const hubPts = [];
  for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; hubPts.push(new V(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75)); }
  const hubRing = new THREE.Line(new THREE.BufferGeometry().setFromPoints(hubPts), c.mat(0));
  hub.add(hubBox, hubRing);
  hub.position.copy(HUB);
  root.add(hub);

  // Verbindungen Einheit -> Verwaltung (rechtwinklig geführt)
  const links = units.map((u) => {
    const a = u.target.clone(); a.z = D / 2 - 0.15;
    const mid1 = new V(a.x, a.y, D / 2 + 1.2 + u.f * 0.18);
    const mid2 = new V(HUB.x, a.y, mid1.z);
    const mid3 = new V(HUB.x, a.y, HUB.z);
    const it = H.growLine([a, mid1, mid2, mid3, HUB.clone()], 0, 0xffffff, 0.12);
    root.add(it.obj);
    return it;
  });

  // Jahreskreis mit 12 Monatsmarken
  const R = Math.hypot(W, D) / 2 + 2.2;
  const circ = [];
  for (let i = 0; i <= 180; i++) { const a = (i / 180) * Math.PI * 2 - Math.PI / 2; circ.push(new V(Math.cos(a) * R, 0.02, Math.sin(a) * R)); }
  const year = H.growLine(circ, 0.55, 0xffffff, 10);
  year.count = circ.length;
  root.add(year.obj);
  const ticks = [];
  for (let m = 0; m < 12; m++) {
    const a = (m / 12) * Math.PI * 2 - Math.PI / 2;
    const l = m % 3 === 0 ? 0.6 : 0.3;
    ticks.push(Math.cos(a) * R, 0.02, Math.sin(a) * R, Math.cos(a) * (R + l), 0.02, Math.sin(a) * (R + l));
  }
  const tickObj = H.segs(ticks, 0);
  root.add(tickObj);
  // drei Ereignisse im Jahr: Versammlung, Budget, Abrechnung
  const marks = [1, 5, 9].map((m) => {
    const a = (m / 12) * Math.PI * 2 - Math.PI / 2;
    const b = H.box(0.32, 0.32, 0.32, 0);
    b.position.set(Math.cos(a) * R, 0.18, Math.sin(a) * R);
    root.add(b);
    return { b, at: m / 12 };
  });

  const NU = units.length;
  function update(p, intro, t) {
    // 1) Einheiten fügen sich zusammen
    const gather = smooth(0.0, 0.32, p);
    const appear = clamp01(intro * 1.2);
    units.forEach((u) => {
      const spread = (1 - easeOut(gather)) * 0.6;
      const k = clamp01(appear * (NU + 4) / NU * 1.0 - (u.i / NU) * 0.6);
      u.b.position.set(u.target.x + (u.k - 1) * spread * 0.9, u.target.y + u.f * spread * 0.7, u.target.z);
      u.b.material.opacity = 0.55 * k;
      u.b.visible = k > 0.001;
    });
    slabs.forEach((sl) => {
      sl.s.position.y = sl.f * FH + sl.f * (1 - easeOut(gather)) * 0.7 - (1 - easeOut(gather)) * 0.35;
      sl.s.material.opacity = 0.5 * easeOut(gather) * appear;
    });

    // 2) Verbindungen zur Verwaltung
    const q2 = smooth(0.3, 0.68, p);
    hubBox.material.opacity = 0.9 * smooth(0.0, 0.25, q2);
    hubRing.material.opacity = 0.6 * smooth(0.0, 0.25, q2);
    hub.rotation.y = c.reduce ? 0 : t * 0.4;
    links.forEach((it, i) => {
      const s = (i / NU) * 0.55;
      H.setGrow(it, (q2 - s) / 0.45);
      it.obj.material.opacity = 0.5;
    });
    // verbundene Einheit hebt sich kurz hervor
    units.forEach((u, i) => {
      const s = (i / NU) * 0.55;
      const k = clamp01((q2 - s) / 0.45);
      if (k > 0.98) u.b.material.opacity = Math.max(u.b.material.opacity, 0.75);
    });

    // 3) Jahreskreis
    const q3 = smooth(0.62, 0.97, p);
    H.setGrow(year, q3);
    tickObj.material.opacity = 0.45 * smooth(0.0, 0.3, q3);
    marks.forEach((m) => {
      const k = clamp01((q3 - m.at) / 0.12);
      m.b.material.opacity = 0.9 * k;
      m.b.rotation.y = c.reduce ? 0 : t * 0.5;
      m.b.visible = k > 0.001;
    });
    return null;
  }

  return {
    update,
    cam: {
      ang0: -0.2, sweep: 0.9, idle: 0.012,
      r: [27, 38], dr: [1.5, 2],
      y: [6, 15], dy: [9, 6],
      look: TOP * 0.5, dlook: -1.6, fov: [34, 44], gridY: 0, mobileShift: 0.26
    }
  };
}

/* ======================================================
   ÜBER UNS – 126 Projekte seit 2017
   Kleine Häuser erscheinen nach Jahren geordnet in den
   Regionen Zürich, Aargau, Luzern, Solothurn und Bern;
   in der Mitte der Hauptsitz in Zürich.
   ====================================================== */
function buildAbout(c) {
  const { THREE, scene, V, H, clamp01, smooth, easeOut } = c;
  const root = new THREE.Group();
  scene.add(root);

  // reproduzierbarer Zufall
  let seed = 2017;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // Regionen (grob nach Lage: Westen = -x, Süden = +z)
  const REG = [
    { x: 0, z: 0, r: 3.2, w: 0.34, name: 'Zürich' },
    { x: -5.6, z: -1.2, r: 2.2, w: 0.22, name: 'Aargau' },
    { x: -3.6, z: 4.8, r: 1.9, w: 0.15, name: 'Luzern' },
    { x: -9.2, z: 1.2, r: 1.8, w: 0.12, name: 'Solothurn' },
    { x: -9.8, z: 6.2, r: 2.1, w: 0.17, name: 'Bern' }
  ];
  // Regionen beschriften: Umriss als feiner Kreis und Name als Schild
  function label(text) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d');
    g.font = '500 56px Inter, -apple-system, Helvetica Neue, Arial, sans-serif';
    g.fillStyle = '#f5f5f7';
    g.textBaseline = 'middle';
    g.letterSpacing = '6px';
    g.fillText(text.toUpperCase(), 12, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    sp.scale.set(2.8, 0.7, 1);
    sp.center.set(0, 0.5);
    return sp;
  }
  const regionMarks = REG.map((r, i) => {
    const pts = [];
    for (let k = 0; k <= 72; k++) { const a = (k / 72) * Math.PI * 2; pts.push(new V(r.x + Math.cos(a) * (r.r + 0.5), 0.01, r.z + Math.sin(a) * (r.r + 0.5))); }
    const circle = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), c.mat(0));
    const sp = label(r.name);
    sp.position.set(r.x - r.r * 0.2, 1.4 + (i === 0 ? 2.6 : 0), r.z + r.r + 0.9);
    return { circle, sp, d: i * 0.06 };
  });
  const pickRegion = () => { let u = rnd(), a = 0; for (const r of REG) { a += r.w; if (u <= a) return r; } return REG[0]; };

  // Haus als Liniensegmente: Quader + Satteldach
  function house(out, x, z, w, d, h, roof, rot) {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const P = (px, py, pz) => [x + px * cs - pz * sn, py, z + px * sn + pz * cs];
    const L = (a, b) => out.push(...P(...a), ...P(...b));
    const hw = w / 2, hd = d / 2;
    const b = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]];
    const t = b.map(([a, , cc]) => [a, h, cc]);
    for (let i = 0; i < 4; i++) { L(b[i], b[(i + 1) % 4]); L(t[i], t[(i + 1) % 4]); L(b[i], t[i]); }
    if (roof) {
      const r1 = [-hw, h + roof, 0], r2 = [hw, h + roof, 0];
      L(r1, r2); L(t[0], r1); L(t[3], r1); L(t[1], r2); L(t[2], r2);
    }
  }

  // 126 Projekte, chronologisch: zuerst EFH, später vermehrt MFH
  const N = 126;
  const pos = [];
  const marks = [];   // Anzahl Vertices nach jedem Haus
  const placed = [];
  for (let i = 0; i < N; i++) {
    const tt = i / N;
    const reg = i < 12 ? REG[Math.floor(rnd() * 2)] : pickRegion();
    let x, z, ok = false, tries = 0;
    while (!ok && tries < 40) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * reg.r;
      x = reg.x + Math.cos(a) * rr; z = reg.z + Math.sin(a) * rr;
      ok = Math.hypot(x, z) > 1.7 && placed.every((p) => Math.hypot(p[0] - x, p[1] - z) > 0.72);
      tries++;
    }
    placed.push([x, z]);
    const mfh = rnd() < 0.15 + tt * 0.6;
    const rot = Math.round(rnd() * 4) * (Math.PI / 2) + (rnd() - 0.5) * 0.4;
    if (mfh) house(pos, x, z, 0.7 + rnd() * 0.25, 0.48, 0.55 + rnd() * 0.4, 0, rot);
    else house(pos, x, z, 0.4, 0.32, 0.24, 0.16, rot);
    marks.push(pos.length / 3);
  }
  const houses = H.segs(pos, 0.7);
  houses.geometry.setDrawRange(0, 0);
  root.add(houses);

  // Hauptsitz Zürich (Ambassador House): höheres Gebäude in der Mitte
  const hq = new THREE.Group();
  const HQH = 3.4;
  const body = H.box(1.6, HQH, 1.2, 0.85); body.position.y = HQH / 2; hq.add(body);
  const fl = [];
  for (let y = 0.4; y < HQH; y += 0.4) fl.push(-0.8, y, 0.6, 0.8, y, 0.6, 0.8, y, 0.6, 0.8, y, -0.6);
  hq.add(H.segs(fl, 0.35));
  hq.scale.y = 0.0001;
  root.add(hq);
  const ringPts = [];
  for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; ringPts.push(new V(Math.cos(a) * 1.25, 0.01, Math.sin(a) * 1.25)); }
  const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), c.mat(0));
  root.add(ring);

  // Verbindungen Hauptsitz -> Regionen
  const links = REG.slice(1).map((r, i) => {
    const it = H.growLine([new V(0, 0.02, 0), new V(r.x, 0.02, r.z)], 0.3, 0xffffff, 0.2);
    it.s = i * 0.08;
    root.add(it.obj);
    return it;
  });

  regionMarks.forEach((m) => { root.add(m.circle); root.add(m.sp); });

  // Mittelpunkt der Szene leicht nach Westen verschieben
  root.position.set(1.2, 0, -1.6);

  function update(p, intro) {
    // Gründung: erste Häuser beim Laden, dann Wachstum mit dem Scroll
    const grow = clamp01(0.18 * intro + smooth(0.02, 0.85, p) * 0.82);
    const k = Math.floor(grow * N);
    houses.geometry.setDrawRange(0, k > 0 ? marks[k - 1] : 0);
    // Hauptsitz entsteht ab der Mitte (2023)
    const kh = easeOut(smooth(0.5, 0.75, p));
    hq.scale.y = Math.max(0.0001, kh);
    hq.visible = kh > 0.001;
    ring.material.opacity = 0.5 * kh;
    links.forEach((it) => H.setGrow(it, (smooth(0.62, 0.95, p) - it.s) / 0.6));
    regionMarks.forEach((m) => {
      const k = clamp01((intro - 0.3 - m.d) / 0.5);
      m.circle.material.opacity = 0.16 * k;
      m.sp.material.opacity = 0.6 * k;
    });
    return null;
  }

  return {
    update,
    cam: {
      ang0: -0.15, sweep: 0.55, idle: 0.01,
      r: [18, 24], dr: [2, 3],
      y: [14, 19], dy: [-3, -3],
      look: 0.4, fov: [34, 44], gridY: -0.01, gridSize: 60, mobileShift: 0.22, shift: 0.33,
      fogNear: 4, fogFar: 22
    }
  };
}

/* ======================================================
   JOBS – ein Büro, ein freier Platz
   Ein ruhiges Einzelbüro: Schreibtisch mit zwei Bildschirmen,
   leerer Stuhl, markiert als freie Stelle.
   ====================================================== */
function buildJobs(c) {
  const { THREE, scene, V, H, clamp01, smooth, easeOut } = c;
  const root = new THREE.Group();
  scene.add(root);
  const OW = 5.6, OD = 4.6, OH = 2.9;
  const X0 = -OW / 2, Z0 = -OD / 2;

  const items = [];
  function add(g, order) {
    g.traverse((o) => { if (o.material) o.userData.base = o.material.opacity; });
    g.userData.order = order;
    g.userData.y = g.position.y;
    root.add(g);
    items.push(g);
    return g;
  }
  const G = (...o) => { const g = new THREE.Group(); o.forEach((x) => g.add(x)); return g; };
  const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
  function circle(r, n, op, y = 0) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push(new V(Math.cos(a) * r, y, Math.sin(a) * r)); }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), c.mat(op));
  }

  // Raum: Boden, Rückwand mit Holzlamellen, raumhohe Fensterfront links
  const shell = new THREE.Group();
  shell.add(at(H.box(OW, 0.05, OD, 0.45), 0, -0.025, 0));
  shell.add(at(H.box(OW, OH, 0.1, 0.4), 0, OH / 2, Z0 - 0.05));
  const glass = [];
  for (let z = Z0; z <= OD / 2 + 0.001; z += OD / 4) glass.push(X0, 0, z, X0, OH, z);
  glass.push(X0, 0, Z0, X0, 0, OD / 2, X0, OH, Z0, X0, OH, OD / 2);
  shell.add(H.segs(glass, 0.42));
  const slats = [];
  for (let x = 0.9; x <= OW / 2 - 0.1; x += 0.14) slats.push(x, 0.05, Z0 + 0.02, x, OH - 0.05, Z0 + 0.02);
  shell.add(H.segs(slats, 0.22));
  shell.scale.y = 0.0001;
  root.add(shell);

  // Teppich
  add(at(H.box(3.0, 0.01, 2.2, 0.32), -0.2, 0.005, -0.1), 0);

  // Schreibtisch
  const top = at(H.box(1.9, 0.045, 0.85, 0.95), 0, 0.74, 0);
  const legs = [];
  [-0.88, 0.88].forEach((x) => legs.push(x, 0, -0.38, x, 0.72, -0.38, x, 0.72, -0.38, x, 0.72, 0.38, x, 0.72, 0.38, x, 0, 0.38, x, 0, -0.38, x, 0, 0.38));
  add(at(G(top, H.segs(legs, 0.65)), -0.2, 0, -0.6), 1);

  // Zwei Bildschirme
  function monitor() {
    return G(at(H.box(0.62, 0.38, 0.03, 0.9), 0, 1.05, 0), H.segs([0, 0.77, 0, 0, 0.86, 0], 0.6),
             at(H.box(0.3, 0.01, 0.14, 0.5), 0, 0.77, 0.06));
  }
  const ml = monitor(); ml.position.x = -0.34; ml.rotation.y = 0.16;
  const mr = monitor(); mr.position.x = 0.34; mr.rotation.y = -0.16;
  const kb = at(H.box(0.46, 0.015, 0.15, 0.6), 0, 0.77, 0.3);
  const mouse = at(H.box(0.06, 0.015, 0.1, 0.6), 0.38, 0.77, 0.3);
  add(at(G(ml, mr, kb, mouse), -0.2, 0, -0.78), 2);

  // Leerer Stuhl, leicht vom Tisch weggedreht
  const chair = G(
    at(H.box(0.52, 0.06, 0.5, 0.8), 0, 0.47, 0),
    at(H.box(0.52, 0.52, 0.05, 0.8), 0, 0.8, 0.25),
    H.segs([0, 0.08, 0, 0, 0.44, 0, -0.28, 0.04, 0, 0.28, 0.04, 0, 0, 0.04, -0.28, 0, 0.04, 0.28], 0.6)
  );
  chair.rotation.y = 0.35;
  add(at(chair, -0.1, 0, 0.35), 3);

  // Pendelleuchte über dem Tisch
  add(at(G(circle(0.3, 48, 0.8, 1.95), circle(0.2, 40, 0.45, 2.12), H.segs([0, 2.12, 0, 0, OH, 0], 0.35)), -0.2, 0, -0.6), 4);

  // Regal an der Rückwand
  const sh = [];
  for (let y = 0.45; y <= 2.25; y += 0.45) sh.push(-0.55, y, 0, 0.55, y, 0);
  sh.push(-0.55, 0, 0, -0.55, 2.25, 0, 0.55, 0, 0, 0.55, 2.25, 0);
  const books = [];
  [[-0.45, 0.45], [0.05, 0.9], [-0.3, 1.35], [0.15, 1.8]].forEach(([x, y]) => { for (let k = 0; k < 4; k++) books.push(x + k * 0.06, y, 0, x + k * 0.06, y + 0.3, 0); });
  add(at(G(H.segs(sh, 0.55), H.segs(books, 0.35)), 1.6, 0, Z0 + 0.22), 5);

  // Bild an der Wand
  add(at(G(H.box(1.0, 0.7, 0.02, 0.6), at(H.box(0.8, 0.5, 0.01, 0.35), 0, 0, 0.012)), -1.2, 1.7, Z0 + 0.03), 5.5);

  // Pflanze in der Ecke
  const leaves = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, h = 0.9 + (i % 3) * 0.25;
    leaves.push(0, 0.45, 0, Math.cos(a) * 0.35, 0.45 + h, Math.sin(a) * 0.35);
  }
  add(at(G(circle(0.2, 24, 0.7, 0), circle(0.25, 24, 0.7, 0.45),
           H.segs([0.2, 0, 0, 0.25, 0.45, 0, -0.2, 0, 0, -0.25, 0.45, 0, 0, 0, 0.2, 0, 0.45, 0.25, 0, 0, -0.2, 0, 0.45, -0.25], 0.6),
           H.segs(leaves, 0.5)), X0 + 0.45, 0, Z0 + 0.45), 6);

  // Markierung des freien Platzes
  const ring1 = circle(0.6, 64, 0, 0.02);
  const ring2 = circle(0.6, 64, 0, 0.02);
  const beam = H.segs([0, 0.05, 0, 0, 2.2, 0], 0);
  const dot = at(H.box(0.13, 0.13, 0.13, 0), 0, 2.3, 0); dot.rotation.set(Math.PI / 4, 0, Math.PI / 4);
  const mark = at(G(ring1, ring2, beam, dot), -0.1, 0, 0.35);
  root.add(mark);

  const NO = 6;
  function update(p, intro, t) {
    shell.scale.y = Math.max(0.0001, easeOut(clamp01(intro * 1.4)));
    const q = clamp01(intro * 0.65 + smooth(0.0, 0.35, p) * 0.35);
    items.forEach((g) => {
      const k = easeOut(clamp01(q * 1.6 - (g.userData.order / NO) * 0.6));
      g.position.y = g.userData.y + (1 - k) * 0.6;
      g.traverse((o) => { if (o.material) o.material.opacity = o.userData.base * k; });
      g.visible = k > 0.001;
    });
    const km = clamp01(0.75 * smooth(0.6, 1.0, intro) + 0.25 * smooth(0.0, 0.3, p));
    const pulse = c.reduce ? 0.5 : (Math.sin(t * 2.2) + 1) / 2;
    ring1.material.opacity = 0.9 * km;
    const s2 = 1 + pulse * 0.9;
    ring2.scale.set(s2, 1, s2);
    ring2.material.opacity = 0.5 * km * (1 - pulse);
    beam.material.opacity = 0.6 * km;
    dot.material.opacity = 0.95 * km;
    dot.rotation.y = c.reduce ? 0 : t * 0.8;
    return null;
  }

  return {
    update,
    cam: {
      ang0: 0.7, sweep: -0.45, idle: 0.01, shift: 0.2,
      r: [9, 12], dr: [1.0, 1.5],
      y: [5.2, 7], dy: [-1.6, -2],
      look: 0.9, fov: [34, 44], gridY: -0.05, gridSize: 30, mobileShift: 0.22,
      fogNear: 4, fogFar: 12
    }
  };
}

/* ======================================================
   PROJEKT SCANDA – KI plant Gebäude
   Ein neuronales Netz aus Knoten schwebt über dem Grundriss;
   eine Scanlinie fährt über den Plan und die Wände entstehen.
   ====================================================== */
function buildScanda(c) {
  const DATA = window.SCANDIUM_BUILDING;
  if (!DATA) return null;
  const { THREE, scene, V, H, clamp01, smooth, easeOut } = c;
  const SC = 0.13;
  const root = new THREE.Group();
  root.scale.setScalar(SC);
  scene.add(root);

  // Grundriss EG + Wände (werden vom Scan aufgedeckt)
  const rings = DATA.eg.walls;
  let minX = 1e9, maxX = -1e9;
  rings.forEach((r) => r.forEach(([x]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }));
  const segs = [];   // [x0,z0,x1,z1]
  rings.forEach((r) => { for (let i = 0; i < r.length - 1; i++) segs.push([r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]]); });
  const NS = segs.length;
  root.position.x = -((minX + maxX) / 2) * SC;
  const WH = 2.7;
  const planPos = new Float32Array(NS * 6), wallPos = new Float32Array(NS * 12);
  segs.forEach(([a, b, cc, d], i) => {
    planPos.set([a, 0, b, cc, 0, d], i * 6);
    wallPos.set([a, 0, b, a, WH, b, a, WH, b, cc, WH, d], i * 12);
  });
  const plan = H.segs(Array.from(planPos), 0.6);
  const walls = H.segs(Array.from(wallPos), 0.22);
  root.add(plan, walls);
  // nach x sortiert aufdecken
  const order = segs.map((s2, i) => [Math.max(s2[0], s2[2]), i]).sort((u, v) => v[0] - u[0]).map((u) => u[1]);
  const sortedPlan = new Float32Array(NS * 6), sortedWall = new Float32Array(NS * 12), keyX = new Float32Array(NS);
  order.forEach((idx, j) => {
    sortedPlan.set(planPos.subarray(idx * 6, idx * 6 + 6), j * 6);
    sortedWall.set(wallPos.subarray(idx * 12, idx * 12 + 12), j * 12);
    keyX[j] = Math.max(segs[idx][0], segs[idx][2]);
  });
  plan.geometry.setAttribute('position', new THREE.Float32BufferAttribute(sortedPlan, 3));
  walls.geometry.setAttribute('position', new THREE.Float32BufferAttribute(sortedWall, 3));

  // Scanlinie
  const scan = H.segs([0, 0.05, -14, 0, 0.05, 14, 0, 0.05, -14, 0, 4, -14, 0, 0.05, 14, 0, 4, 14, 0, 4, -14, 0, 4, 14], 0);
  root.add(scan);

  // Neuronales Netz über dem Plan
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const layers = [10, 14, 10];
  const nodes = [];
  layers.forEach((n, L) => {
    for (let i = 0; i < n; i++) {
      nodes.push({ L, p: new V(minX + (maxX - minX) * ((i + 0.5) / n) + (rnd() - 0.5) * 2, 12 + L * 4.5, (rnd() - 0.5) * 14) });
    }
  });
  const nodePos = [];
  nodes.forEach(({ p }) => { const r = 0.35; nodePos.push(p.x - r, p.y, p.z, p.x + r, p.y, p.z, p.x, p.y - r, p.z, p.x, p.y + r, p.z, p.x, p.y, p.z - r, p.x, p.y, p.z + r); });
  const nodeObj = H.segs(nodePos, 0);
  root.add(nodeObj);
  const linkPos = [];
  nodes.forEach((a) => nodes.forEach((b) => {
    if (b.L === a.L + 1 && rnd() < 0.28) linkPos.push(a.p.x, a.p.y, a.p.z, b.p.x, b.p.y, b.p.z);
  }));
  // Verbindungen der untersten Schicht zum Plan
  nodes.filter((n) => n.L === 0).forEach((n) => linkPos.push(n.p.x, n.p.y, n.p.z, n.p.x, 0.1, n.p.z * 0.5));
  const links = H.segs(linkPos, 0);
  root.add(links);

  function update(p, intro, t) {
    const ni = smooth(0.0, 1.0, intro);
    nodeObj.material.opacity = 0.8 * ni;
    const pulse = c.reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.6);
    links.material.opacity = (0.12 + 0.12 * pulse) * ni;
    // Scan: Hero zeigt schon ein Drittel, Rest beim Scrollen
    const q = clamp01(0.3 * intro + smooth(0.0, 0.85, p) * 0.7);
    const sx = maxX + 1 - (maxX - minX + 2) * q;
    let k = 0;
    while (k < NS && keyX[k] >= sx) k++;
    plan.geometry.setDrawRange(0, k * 2);
    walls.geometry.setDrawRange(0, k * 4);
    scan.position.x = sx;
    scan.material.opacity = q < 0.999 ? 0.7 : 0;
    return null;
  }

  return {
    update,
    cam: {
      ang0: -0.35, sweep: 0.6, idle: 0.012, shift: 0.18,
      r: [12.5, 18], dr: [0, 0],
      y: [6.5, 11], dy: [-1, -1],
      look: 1.1, fov: [34, 44], gridY: -0.02, gridSize: 40, mobileShift: 0.26
    }
  };
}
})();
