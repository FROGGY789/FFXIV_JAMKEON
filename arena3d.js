/* arena3d.js — 기믹 도식 3D 뷰어
 *
 * 평면도(SVG)를 그리는 draw(items) 와 같은 데이터를 받아서 Three.js 로 입체 필드를 그림.
 * - draw() 가 만든 <svg data-arena="N"> 옆에 "3D로 보기" 버튼을 자동으로 붙임.
 * - window.Arena3D.open(items, {title}) 으로 직접 열 수도 있음.
 *
 * 좌표: SVG (x, y) → 3D (x, 0, y). 북쪽 = -z, 필드 반지름 = 100.
 */
(function () {
  'use strict';
  if (window.Arena3D) return;

  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
  const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm';

  const RC = { T: '#2f6fe4', H: '#2e9e55', D: '#d24545' };
  const BC = { '가루다': '#2f7d5b', '이프리트': '#d2552b', '타이탄': '#a07228', '알테마': '#14868c', '라하브레아': '#6b4bb0' };
  const FALLBACK = {
    '--bad': 'rgba(226,64,52,.30)', '--badS': 'rgba(200,40,30,.8)',
    '--safe': 'rgba(40,170,90,.25)', '--safeS': 'rgba(30,140,70,.9)',
    '--buf': 'rgba(60,170,220,.25)', '--bufS': 'rgba(40,130,190,.9)',
    '--ink': '#141b2d', '--sub': '#525b70', '--card': '#ffffff', '--bg': '#fbfaf7',
    '--floor': '#ece7dc', '--rim': '#b9b1a1', '--line': '#dcd8cf'
  };
  const ZH = { bad: 10, safe: 5, buf: 7 }; // 장판 벽 높이
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 좌표 헬퍼 (평면도와 동일) ---------- */
  const P = (a, d) => { const r = a * Math.PI / 180; return [Math.sin(r) * d, -Math.cos(r) * d]; };
  const xy = v => (v.length === 2 && v.pol ? P(v[0], v[1]) : v);
  const at = o => (o.xy ? o.xy : P(o.at[0], o.at[1]));
  const strip = s => String(s == null ? '' : s).replace(/<[^>]+>/g, '');

  /* ---------- 색 해석: var(--x), light-dark() 모두 실제 색으로 ---------- */
  let probe;
  function resolveColor(c, fb) {
    if (!c) return parseRGBA(fb || '#888');
    let raw = String(c).trim();
    const m = raw.match(/^var\((--[\w-]+)\s*(?:,\s*(.+))?\)$/);
    if (m) {
      const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
      raw = v || m[2] || FALLBACK[m[1]] || fb || '#888';
    }
    if (!probe) { probe = document.createElement('i'); probe.style.display = 'none'; document.body.appendChild(probe); }
    probe.style.color = '';
    probe.style.color = raw;
    if (!probe.style.color) probe.style.color = fb || (m && FALLBACK[m[1]]) || '#888';
    return parseRGBA(getComputedStyle(probe).color);
  }
  function parseRGBA(s) {
    const n = String(s).match(/[\d.]+/g) || [128, 128, 128];
    const r = +n[0], g = +n[1], b = +n[2], a = n[3] == null ? 1 : +n[3];
    return { r, g, b, a, hex: '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''), css: `rgba(${r},${g},${b},${a})` };
  }

  /* ---------- 레지스트리: draw() 에서 호출 ---------- */
  const REG = (window.__arena = window.__arena || []);
  window.Arena3D = { open, register: items => REG.push(items) - 1 };

  /* ---------- 스타일 ---------- */
  const css = `
.a3d-btn{display:flex;align-items:center;gap:6px;margin:10px auto 0;padding:6px 14px;min-height:36px;border-radius:999px;
  border:1px solid color-mix(in srgb,currentColor 28%,transparent);background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.a3d-btn:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
.a3d-btn:focus-visible{outline:3px solid color-mix(in srgb,currentColor 50%,transparent);outline-offset:2px}
.a3d-btn svg{width:16px!important;height:16px!important;max-width:none!important;margin:0!important;display:inline!important}
dialog.a3d{border:0;padding:0;margin:auto;width:min(1200px,100vw - 24px);height:min(860px,100dvh - 24px);max-width:none;max-height:none;border-radius:18px;
  background:var(--a3d-bg);color:var(--a3d-ink);box-shadow:0 30px 80px rgba(0,0,0,.35);overflow:hidden;font-family:inherit}
dialog.a3d::backdrop{background:rgba(10,12,20,.55);backdrop-filter:blur(3px)}
.a3d-in{display:grid;grid-template-rows:auto minmax(0,1fr) auto;height:100%}
.a3d-hd{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--a3d-line)}
.a3d-hd h2{font-size:17px;line-height:1.3;margin:0;font-weight:800;flex:1;min-width:0}
.a3d-hd small{display:block;font-size:12px;font-weight:500;color:var(--a3d-sub)}
.a3d-x{flex:none;width:40px;height:40px;border-radius:10px;border:1px solid var(--a3d-line);background:transparent;color:inherit;font-size:20px;cursor:pointer}
.a3d-stage{position:relative;min-height:0;touch-action:none}
.a3d-stage canvas{display:block;width:100%!important;height:100%!important;outline:none}
.a3d-hint{position:absolute;left:12px;bottom:10px;font-size:12px;color:var(--a3d-sub);pointer-events:none;background:color-mix(in srgb,var(--a3d-bg) 75%,transparent);padding:3px 8px;border-radius:6px}
.a3d-load{position:absolute;inset:0;display:grid;place-items:center;font-size:14px;color:var(--a3d-sub)}
.a3d-cap{position:absolute;left:12px;top:12px;right:12px;display:flex;gap:10px;align-items:center;pointer-events:none}
.a3d-cap>div{background:color-mix(in srgb,var(--a3d-bg) 88%,transparent);border:1px solid var(--a3d-line);border-radius:12px;padding:8px 12px;font-size:14px;line-height:1.45;max-width:560px;box-shadow:0 4px 16px rgba(0,0,0,.08)}
.a3d-cap b{display:inline-block;margin-right:8px;font-weight:800}
.a3d-cap i{font-style:normal;color:var(--a3d-sub);font-size:12px;font-weight:700;margin-right:6px}
.a3d-prog{position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--a3d-line)}
.a3d-prog>i{display:block;height:100%;width:0;background:var(--a3d-ink)}
.a3d-side{position:absolute;top:12px;right:12px;bottom:12px;width:min(340px,calc(100% - 24px));overflow:auto;background:var(--a3d-bg);border:1px solid var(--a3d-line);border-radius:14px;padding:12px 14px;font-size:14px;line-height:1.55;box-shadow:0 10px 30px rgba(0,0,0,.15);display:none}
.a3d-side.on{display:block}
.a3d-side h3{font-size:14px;margin:0 0 6px;font-weight:800}
.a3d-side ol{margin:0;padding-inline-start:20px}.a3d-side li{margin:4px 0}
.a3d-hb{flex:none;min-height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--a3d-line);background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.a3d-hb[aria-pressed=true]{background:var(--a3d-ink);color:var(--a3d-bg)}
.a3d-bar button.play{min-width:92px}
.a3d-bar{display:flex;flex-wrap:wrap;gap:10px 18px;padding:10px 16px 12px;border-top:1px solid var(--a3d-line);font-size:13px}
.a3d-grp{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.a3d-grp>span{color:var(--a3d-sub);font-weight:700;margin-right:2px}
.a3d-bar button{font:inherit;font-size:13px;font-weight:700;min-height:34px;padding:4px 11px;border-radius:999px;border:1px solid var(--a3d-line);background:transparent;color:inherit;cursor:pointer}
.a3d-bar button[aria-pressed=true]{background:var(--a3d-ink);color:var(--a3d-bg);border-color:var(--a3d-ink)}
.a3d-bar button.role{color:#fff;border-color:transparent;min-width:42px}
.a3d-bar button.role[aria-pressed=true]{box-shadow:0 0 0 2px var(--a3d-bg),0 0 0 4px var(--a3d-ink)}
.a3d-bar button:focus-visible,.a3d-x:focus-visible{outline:3px solid var(--a3d-sub);outline-offset:2px}
@media(max-width:640px){dialog.a3d{width:100vw;height:100dvh;border-radius:0}.a3d-hint{display:none}.a3d-bar{display:grid;gap:8px;padding:8px 12px 10px}.a3d-grp{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.a3d-grp>*{flex:none}}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const CUBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>';

  /* ---------- 버튼 자동 부착 ---------- */
  function attach(root) {
    (root.querySelectorAll ? root : document).querySelectorAll('svg[data-arena]:not([data-a3d])').forEach(svg => {
      svg.setAttribute('data-a3d', '1');
      const items = REG[+svg.getAttribute('data-arena')];
      if (!items) return;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'a3d-btn';
      btn.innerHTML = CUBE + '3D로 보기';
      btn.addEventListener('click', e => {
        e.stopPropagation();
        // 도식이 들어 있는 카드: 공략 순서(ol)를 가진 가장 가까운 조상
        let card = svg.parentElement, n = 0;
        while (card && n++ < 8 && !card.querySelector('ol li')) card = card.parentElement;
        if (!card || n > 8) card = svg.closest('article, .card');
        const h = card && card.querySelector('h3, h2');
        const cap = svg.parentElement && svg.parentElement.querySelector('.cap');
        const steps = card ? [...card.querySelectorAll('ol li')].map(li => li.textContent.trim()).filter(Boolean) : [];
        open(items, { title: h ? strip(h.textContent) : '기믹 3D 보기', sub: cap ? cap.textContent : '', steps });
      });
      const after = svg.nextElementSibling && svg.nextElementSibling.classList.contains('cap') ? svg.nextElementSibling : svg;
      after.insertAdjacentElement('afterend', btn);
    });
  }
  const mo = new MutationObserver(() => attach(document));
  const boot = () => { attach(document); mo.observe(document.body, { childList: true, subtree: true }); };
  if (document.body) boot(); else addEventListener('DOMContentLoaded', boot);

  /* ---------- 다이얼로그 ---------- */
  let dlg, stage, bar, titleEl, subEl, loadEl, capEl, sideEl, sideBtn, progEl;
  function ensureDialog() {
    if (dlg) return;
    dlg = document.createElement('dialog');
    dlg.className = 'a3d';
    dlg.setAttribute('aria-labelledby', 'a3d-title');
    dlg.innerHTML = `<div class="a3d-in">
  <div class="a3d-hd"><h2 id="a3d-title"><span></span><small></small></h2><button class="a3d-hb" type="button" aria-pressed="false" hidden>공략 순서</button><button class="a3d-x" type="button" aria-label="닫기">✕</button></div>
  <div class="a3d-stage"><div class="a3d-load">3D 엔진 불러오는 중…</div><div class="a3d-cap" aria-live="polite"></div><div class="a3d-hint">드래그: 회전 · 휠/핀치: 확대 · 우클릭/두 손가락: 이동 · 말 클릭: 강조</div><aside class="a3d-side"></aside><div class="a3d-prog"><i></i></div></div>
  <div class="a3d-bar"></div></div>`;
    document.body.appendChild(dlg);
    stage = dlg.querySelector('.a3d-stage');
    bar = dlg.querySelector('.a3d-bar');
    titleEl = dlg.querySelector('#a3d-title span');
    subEl = dlg.querySelector('#a3d-title small');
    loadEl = dlg.querySelector('.a3d-load');
    capEl = dlg.querySelector('.a3d-cap');
    sideEl = dlg.querySelector('.a3d-side');
    sideBtn = dlg.querySelector('.a3d-hb');
    progEl = dlg.querySelector('.a3d-prog>i');
    sideBtn.addEventListener('click', () => { const on = !sideEl.classList.contains('on'); sideEl.classList.toggle('on', on); sideBtn.setAttribute('aria-pressed', String(on)); });
    dlg.querySelector('.a3d-x').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', teardown);
  }

  let libs;
  function loadLibs() {
    if (!libs) libs = Promise.all([import(THREE_URL), import(ORBIT_URL)]).then(([T, O]) => ({ T, OrbitControls: O.OrbitControls }));
    return libs;
  }

  /* ---------- 상태 ---------- */
  let R = null; // 현재 열린 장면

  async function open(items, opts = {}) {
    ensureDialog();
    const pal = palette();
    dlg.style.setProperty('--a3d-bg', pal.card.hex);
    dlg.style.setProperty('--a3d-ink', pal.ink.hex);
    dlg.style.setProperty('--a3d-sub', pal.sub.hex);
    dlg.style.setProperty('--a3d-line', pal.line.css);
    titleEl.textContent = opts.title || '기믹 3D 보기';
    subEl.textContent = opts.sub || '';
    bar.innerHTML = '';
    capEl.innerHTML = '';
    progEl.style.width = '0';
    sideEl.classList.remove('on'); sideBtn.setAttribute('aria-pressed', 'false');
    sideEl.innerHTML = '';
    sideBtn.hidden = !(opts.steps && opts.steps.length);
    if (!sideBtn.hidden) {
      const h = document.createElement('h3'); h.textContent = '공략 순서'; sideEl.appendChild(h);
      const ol = document.createElement('ol');
      opts.steps.forEach(t => { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); });
      sideEl.appendChild(ol);
    }
    loadEl.style.display = '';
    if (!dlg.open) dlg.showModal();
    let L;
    try { L = await loadLibs(); }
    catch (e) { loadEl.textContent = '3D 엔진을 불러오지 못함. 인터넷 연결을 확인 바람.'; libs = null; return; }
    if (!dlg.open) return;
    loadEl.style.display = 'none';
    teardown();
    R = build(L, items, pal);
  }

  function palette() {
    const g = k => resolveColor(`var(${k})`, FALLBACK[k]);
    return { card: g('--card'), ink: g('--ink'), sub: g('--sub'), line: g('--line'), floor: g('--floor'), rim: g('--rim'),
      bad: g('--bad'), badS: g('--badS'), safe: g('--safe'), safeS: g('--safeS'), buf: g('--buf'), bufS: g('--bufS') };
  }

  /* ---------- 장면 만들기 ---------- */
  function build({ T, OrbitControls }, items, pal) {
    const W = () => stage.clientWidth || 800, H = () => stage.clientHeight || 600;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(W(), H(), false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', '기믹 3D 필드. 드래그해서 회전');
    stage.prepend(renderer.domElement);

    const dark = (pal.card.r + pal.card.g + pal.card.b) / 3 < 110;
    const scene = new T.Scene();
    scene.background = new T.Color(pal.card.hex);
    scene.fog = new T.Fog(pal.card.hex, 420, 900);

    const camera = new T.PerspectiveCamera(42, W() / H(), 1, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 40;
    controls.maxDistance = 900;
    controls.target.set(0, 0, 0);

    /* 조명 */
    scene.add(new T.HemisphereLight(0xffffff, dark ? 0x202530 : 0xb8b0a0, dark ? 1.4 : 1.6));
    const sun = new T.DirectionalLight(0xffffff, dark ? 1.6 : 1.9);
    sun.position.set(-80, 200, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 10, far: 500 });
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    const G = { floor: new T.Group(), zones: new T.Group(), units: new T.Group(), guides: new T.Group(), labels: new T.Group() };
    Object.values(G).forEach(g => scene.add(g));
    const disposables = [];
    const track = o => { disposables.push(o); return o; };
    const animators = [];

    /* --- 공통 재료 --- */
    const V = (x, y, z) => new T.Vector3(x, y, z);
    const W3 = (p, y = 0) => V(p[0], y, p[1]);

    function label(text, { color = pal.ink.hex, bg = null, halo = pal.floor.hex, size = 9, bold = 800 } = {}) {
      text = strip(text);
      const px = 64, pad = bg ? 22 : 14;
      const c = document.createElement('canvas'), x = c.getContext('2d');
      const font = `${bold} ${px}px "Noto Sans KR","Pretendard Variable",Pretendard,system-ui,sans-serif`;
      x.font = font;
      const w = Math.ceil(x.measureText(text).width) + pad * 2, h = px + pad * 1.4;
      c.width = w; c.height = h;
      x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
      if (bg) {
        x.fillStyle = bg; const r = h / 2;
        x.beginPath(); x.roundRect(2, 2, w - 4, h - 4, r); x.fill();
        x.lineWidth = 5; x.strokeStyle = 'rgba(255,255,255,.95)'; x.stroke();
      } else {
        x.lineWidth = 16; x.lineJoin = 'round'; x.strokeStyle = halo; x.strokeText(text, w / 2, h / 2 + 3);
      }
      x.fillStyle = color; x.fillText(text, w / 2, h / 2 + 3);
      const tex = track(new T.CanvasTexture(c));
      tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = track(new T.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
      const s = new T.Sprite(mat);
      const hw = size * 1.35;
      s.scale.set(hw * w / h, hw, 1);
      s.renderOrder = 10;
      return s;
    }

    /* 장판 벽(위로 갈수록 사라지는 홀로그램 막) */
    const wallMat = (col, op) => track(new T.ShaderMaterial({
      uniforms: { uColor: { value: new T.Color(col.hex) }, uOp: { value: op }, uPulse: { value: 1 } },
      vertexShader: 'varying float vH;uniform float uH;void main(){vH=uv.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying float vH;uniform vec3 uColor;uniform float uOp;uniform float uPulse;void main(){float a=uOp*uPulse*pow(1.0-vH,1.6);gl_FragColor=vec4(uColor,a);}',
      transparent: true, depthWrite: false, side: T.DoubleSide
    }));
    function wallGeo(loops, h) {
      const pos = [], uv = [];
      loops.forEach(pts => {
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          pos.push(a.x, 0, a.y, b.x, 0, b.y, b.x, h, b.y, a.x, 0, a.y, b.x, h, b.y, a.x, h, a.y);
          uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
        }
      });
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      return track(g);
    }

    let zIndex = 0;
    function zone(shape, kind) {
      const fill = pal[kind] || pal.bad, stroke = pal[kind + 'S'] || pal.badS;
      const y = 0.25 + (zIndex++) * 0.03;
      const g = new T.Group();
      const geo = track(new T.ShapeGeometry(shape, 48)); geo.rotateX(Math.PI / 2);
      const m = new T.Mesh(geo, track(new T.MeshBasicMaterial({ color: fill.hex, transparent: true, opacity: Math.min(0.75, fill.a * 1.9), depthWrite: false, side: T.DoubleSide })));
      m.position.y = y; m.renderOrder = 1;
      g.add(m);
      const ex = shape.extractPoints(48);
      const loops = [ex.shape, ...ex.holes];
      const lineMat = track(new T.LineBasicMaterial({ color: stroke.hex, transparent: true, opacity: Math.max(0.6, stroke.a) }));
      loops.forEach(pts => {
        const lg = track(new T.BufferGeometry().setFromPoints(pts.concat([pts[0]]).map(p => V(p.x, y + 0.05, p.y))));
        const l = new T.Line(lg, lineMat); l.renderOrder = 2; g.add(l);
      });
      const wm = wallMat(stroke, kind === 'bad' ? 0.55 : 0.4);
      const wall = new T.Mesh(wallGeo(loops, ZH[kind] || 8), wm);
      wall.position.y = y; wall.renderOrder = 3;
      g.add(wall);
      if (kind === 'bad') animators.push(t => { wm.uniforms.uPulse.value = 0.75 + 0.25 * Math.sin(t * 3); });
      // 재생 때 장판 중심에서 커지도록 그룹 원점을 장판 중심으로 옮김
      const c = new T.Box3().setFromObject(g).getCenter(V(0, 0, 0));
      g.children.forEach(ch => { ch.position.x -= c.x; ch.position.z -= c.z; });
      g.position.set(c.x, 0, c.z);
      G.zones.add(g);
      return g;
    }

    /* --- 화살표 / 줄 --- */
    function tubeAlong(points, color, { dash = false, radius = 0.9, head = true } = {}) {
      const mat = track(new T.MeshStandardMaterial({ color, roughness: 0.5 }));
      const curve = new T.CatmullRomCurve3(points);
      const len = curve.getLength();
      const headLen = head ? Math.min(7, len * 0.35) : 0;
      const usable = 1 - headLen / len;
      const g = new T.Group();
      const piece = (u0, u1) => {
        const pts = []; const n = Math.max(2, Math.ceil((u1 - u0) * len / 2));
        for (let i = 0; i <= n; i++) pts.push(curve.getPointAt(u0 + (u1 - u0) * i / n));
        const tg = track(new T.TubeGeometry(new T.CatmullRomCurve3(pts), n * 2, radius, 8, false));
        const m = new T.Mesh(tg, mat); m.castShadow = true; m.userData.u = [u0, u1]; g.add(m);
      };
      if (dash) { const step = 5 / len; for (let u = 0; u < usable; u += step * 1.8) piece(u, Math.min(u + step, usable)); }
      else piece(0, usable);
      if (head) {
        const tip = curve.getPointAt(1), dir = curve.getTangentAt(1).normalize();
        const cone = new T.Mesh(track(new T.ConeGeometry(radius * 3, headLen, 16)), mat);
        cone.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
        cone.position.copy(tip).addScaledVector(dir, -headLen / 2);
        cone.castShadow = true;
        cone.userData.head = 1;
        g.add(cone);
      }
      // 재생: 0→1 로 화살표가 그려지는 진행도
      g.userData.reveal = u => {
        g.children.forEach(m => {
          if (m.userData.head) { m.visible = u >= 0.98; return; }
          const [u0, u1] = m.userData.u, f = Math.max(0, Math.min(1, (u * 1.0 - u0) / (u1 - u0 || 1)));
          m.visible = f > 0;
          m.geometry.setDrawRange(0, f >= 1 ? Infinity : Math.floor(m.geometry.index.count * f / 6) * 6);
        });
      };
      G.guides.add(g);
      return g;
    }

    /* --- 말(롤) / 보스 --- */
    const pawns = {};
    function pawn(role, p) {
      const col = RC[role[0]] || '#666';
      const g = new T.Group();
      const mat = track(new T.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.05, transparent: true }));
      const base = new T.Mesh(track(new T.CylinderGeometry(5.2, 5.6, 1.6, 32)), mat); base.position.y = 0.8;
      const body = new T.Mesh(track(new T.CylinderGeometry(2.6, 4.2, 9, 24)), mat); body.position.y = 6;
      const head = new T.Mesh(track(new T.SphereGeometry(3.3, 24, 16)), mat); head.position.y = 13;
      [base, body, head].forEach(m => { m.castShadow = true; m.userData.role = role; g.add(m); });
      const ringMat = track(new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false }));
      const ring = new T.Mesh(track(new T.RingGeometry(7, 9, 48)), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6;
      g.add(ring);
      const tag = label(role, { color: '#fff', bg: col, size: 5.5 }); tag.position.y = 21; g.add(tag);
      g.position.copy(W3(p));
      G.units.add(g);
      pawns[role] = { g, mat, ring, ringMat, tag };
      return g;
    }
    function boss(name, p, o) {
      const col = o.c || BC[name] || '#555';
      const r = o.r || 11;
      const g = new T.Group();
      const mat = track(new T.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.15 }));
      if (!name && r < 8) {
        const s = new T.Mesh(track(new T.IcosahedronGeometry(r * 0.9, 1)), mat); s.position.y = r + 2; s.castShadow = true; g.add(s);
        animators.push(t => { s.position.y = r + 2 + Math.sin(t * 2 + p[0]) * 0.8; s.rotation.y = t * 0.6; });
      } else {
        const h = r < 9 ? 14 : 24;
        const body = new T.Mesh(track(new T.CylinderGeometry(r * 0.55, r * 0.85, h, 8)), mat); body.position.y = h / 2; body.castShadow = true; g.add(body);
        const gem = new T.Mesh(track(new T.OctahedronGeometry(r * 0.55)), track(new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.2 })));
        gem.position.y = h + r * 0.75; gem.castShadow = true; g.add(gem);
        animators.push(t => { gem.rotation.y = t * 0.8; gem.position.y = h + r * 0.75 + Math.sin(t * 1.6) * 0.7; });
        const base = new T.Mesh(track(new T.CircleGeometry(r, 48)), track(new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, depthWrite: false })));
        base.rotation.x = -Math.PI / 2; base.position.y = 0.4; g.add(base);
        if (name) { const l = label(name, { size: 6 }); l.position.y = h + r * 1.6 + 6; g.add(l); }
      }
      g.position.copy(W3(p));
      G.units.add(g);
      return g;
    }
    function waymark(ch, p) {
      const g = new T.Group();
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      x.fillStyle = '#f2c230'; x.strokeStyle = '#7a5a00'; x.lineWidth = 6; x.beginPath(); x.roundRect(6, 6, 116, 116, 22); x.fill(); x.stroke();
      x.fillStyle = '#3a2a00'; x.font = '900 72px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(strip(ch), 64, 70);
      const tex = track(new T.CanvasTexture(c)); tex.colorSpace = T.SRGBColorSpace;
      const tile = new T.Mesh(track(new T.PlaneGeometry(14, 14)), track(new T.MeshBasicMaterial({ map: tex, transparent: true })));
      tile.rotation.x = -Math.PI / 2; tile.position.y = 0.5; g.add(tile);
      const beam = new T.Mesh(wallGeo([[{ x: -6, y: -6 }, { x: 6, y: -6 }, { x: 6, y: 6 }, { x: -6, y: 6 }]], 22), wallMat(parseRGBA('rgb(242,194,48)'), 0.45));
      g.add(beam);
      g.position.copy(W3(p));
      G.units.add(g);
      return g;
    }

    /* --- 필드 --- */
    (function floor() {
      const fm = track(new T.MeshStandardMaterial({ color: pal.floor.hex, roughness: 0.95 }));
      const disc = new T.Mesh(track(new T.CylinderGeometry(100, 100, 4, 128)), fm); disc.position.y = -2; disc.receiveShadow = true; G.floor.add(disc);
      const rim = new T.Mesh(track(new T.TorusGeometry(100.5, 1.4, 12, 160)), track(new T.MeshStandardMaterial({ color: pal.rim.hex, roughness: 0.6 })));
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.2; G.floor.add(rim);
      const skirt = new T.Mesh(track(new T.CylinderGeometry(101, 96, 22, 128, 1, true)), track(new T.MeshStandardMaterial({ color: pal.rim.hex, roughness: 0.9, side: T.DoubleSide })));
      skirt.position.y = -13; G.floor.add(skirt);
      const dm = track(new T.LineDashedMaterial({ color: pal.rim.hex, dashSize: 2.5, gapSize: 3 }));
      const circ = []; for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; circ.push(V(Math.cos(a) * 50, 0.15, Math.sin(a) * 50)); }
      const l1 = new T.Line(track(new T.BufferGeometry().setFromPoints(circ)), dm); l1.computeLineDistances(); G.floor.add(l1);
      [[V(0, .15, -100), V(0, .15, 100)], [V(-100, .15, 0), V(100, .15, 0)]].forEach(pp => {
        const l = new T.LineSegments(track(new T.BufferGeometry().setFromPoints(pp)), dm); l.computeLineDistances(); G.floor.add(l);
      });
      [['북', 0], ['동', 90], ['남', 180], ['서', 270]].forEach(([t, a]) => {
        const s = label(t, { color: pal.sub.hex, halo: pal.card.hex, size: 8 }); s.position.copy(W3(P(a, 114), 4)); G.labels.add(s);
      });
    })();

    /* --- 데이터 → 오브젝트 --- */
    const ENT = []; // 재생용: {kind, g, o, at, ...}
    const textItems = [];
    const add = (kind, g, extra) => { const e = Object.assign({ kind, g }, extra); ENT.push(e); return e; };
    for (const o of items) {
      const k = o.k || 'bad';
      if (o.z === 'c') {
        const [x, y] = at(o); const s = new T.Shape(); s.absarc(x, y, o.r, 0, Math.PI * 2, false); add('zone', zone(s, k));
      } else if (o.z === 'donut') {
        const [x, y] = at(o); const s = new T.Shape(); s.absarc(x, y, o.r2, 0, Math.PI * 2, false);
        const hole = new T.Path(); hole.absarc(x, y, o.r1, 0, Math.PI * 2, true); s.holes.push(hole); add('zone', zone(s, k));
      } else if (o.z === 'cone') {
        const [x, y] = at(o); const s = new T.Shape(); s.moveTo(x, y);
        const n = Math.max(8, Math.ceil(o.w / 4));
        for (let i = 0; i <= n; i++) { const [dx, dy] = P(o.dir - o.w / 2 + o.w * i / n, o.len); s.lineTo(x + dx, y + dy); }
        s.lineTo(x, y); add('zone', zone(s, k));
      } else if (o.z === 'band') {
        const [x1, y1] = xy(o.a), [x2, y2] = xy(o.b); const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), nx = -dy / L * o.w / 2, ny = dx / L * o.w / 2;
        const s = new T.Shape(); s.moveTo(x1 + nx, y1 + ny); s.lineTo(x2 + nx, y2 + ny); s.lineTo(x2 - nx, y2 - ny); s.lineTo(x1 - nx, y1 - ny); s.lineTo(x1 + nx, y1 + ny); add('zone', zone(s, k));
      } else if (o.ar) {
        const a = xy(o.ar[0]), b = xy(o.ar[1]);
        const pts = []; for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push(V(a[0] + (b[0] - a[0]) * u, 2 + Math.sin(u * Math.PI) * 3, a[1] + (b[1] - a[1]) * u)); }
        add('arrow', tubeAlong(pts, resolveColor(o.c || 'var(--ink)').hex, { dash: !!o.dash }), { dash: !!o.dash, path: [a, b], reach: 20 });
      } else if (o.arc) {
        const { r, a1, a2 } = o.arc; const n = Math.max(12, Math.ceil(Math.abs(a2 - a1) / 5)); const pts = [], path = [];
        for (let i = 0; i <= n; i++) { const q = P(a1 + (a2 - a1) * i / n, r); path.push(q); pts.push(W3(q, 2)); }
        add('arrow', tubeAlong(pts, resolveColor(o.c || 'var(--ink)').hex, { dash: !!o.dash }), { dash: !!o.dash, path, reach: 26 });
      } else if (o.te) {
        const a = xy(o.te[0]), b = xy(o.te[1]); const pts = [];
        for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(V(a[0] + (b[0] - a[0]) * u, 10 + Math.sin(u * Math.PI) * 8, a[1] + (b[1] - a[1]) * u)); }
        add('tether', tubeAlong(pts, resolveColor(o.c || '#27a35a').hex, { dash: true, head: false, radius: 0.7 }));
      } else if (o.b != null) {
        add('unit', boss(o.b, at(o), o));
      } else if (o.p) {
        add('pawn', pawn(o.p, at(o)), { role: o.p, p0: at(o) });
      } else if (o.t) {
        textItems.push(o);
      } else if (o.m) {
        add('unit', waymark(o.m, at(o)));
      }
    }
    textItems.forEach(o => {
      const s = label(o.t, { color: resolveColor(o.c || 'var(--ink)').hex, halo: pal.floor.hex, size: (o.fs || 9) * 0.85 });
      s.position.copy(W3(at(o), 6)); G.labels.add(s);
      add('label', s);
    });

    /* --- 재생 타임라인 ---
     * 기본(자동): ① 배치 → ② 장판 → ③ 이동(실선 화살표) → ④ 이동(점선 화살표)
     *   화살표 시작점/끝점 근처의 롤이 화살표를 따라 움직임.
     * 직접 작성: d 안에 {seq:[{s:'설명', mv:{D1:[x,y] 또는 pol(각도,거리)}}, ...]} 를 넣으면
     *   ① 배치 → ② 장판 → 각 seq 단계 순서로 롤이 이동함. 화살표는 마지막 단계에 보임. */
    const STEPS = [{ name: '배치', cap: '보스와 각 롤의 시작 위치' }, { name: '장판', cap: '장판 · 줄 · 표시가 깔림' }];
    const pawnsE = ENT.filter(e => e.kind === 'pawn');
    pawnsE.forEach(e => { e.pos = [e.p0, e.p0]; e.paths = []; });
    ENT.forEach(e => { e.at = e.kind === 'pawn' || e.kind === 'unit' ? 0 : 1; });
    const seq = (items.find(o => o && o.seq) || {}).seq;
    const extend = () => pawnsE.forEach(e => e.pos.push(e.pos[e.pos.length - 1]));
    if (seq && seq.length) {
      seq.forEach(f => {
        STEPS.push({ name: String(STEPS.length + 1), cap: strip(f.s || '') });
        extend();
        const i = STEPS.length - 1;
        Object.entries(f.mv || {}).forEach(([role, v]) => {
          const e = pawnsE.find(x => x.role === role); if (!e) return;
          e.pos[i] = !Array.isArray(v) && v.at ? at(v) : xy(v);
        });
      });
      ENT.forEach(e => { if (e.kind === 'arrow') e.at = STEPS.length - 1; });
    } else {
      const arrows = ENT.filter(e => e.kind === 'arrow');
      const groups = [arrows.filter(e => !e.dash), arrows.filter(e => e.dash)].filter(g => g.length);
      groups.forEach((grpA, gi) => {
        STEPS.push({ name: groups.length > 1 ? `이동 ${'①②'[gi]}` : '이동', cap: gi ? '점선 화살표: 다음 순서 이동' : '화살표 방향으로 이동' });
        extend();
        const i = STEPS.length - 1;
        grpA.forEach(a => { a.at = i; });
        pawnsE.forEach(e => {
          let best = null;
          grpA.forEach(a => {
            const S = a.path[0], E = a.path[a.path.length - 1];
            const dS = Math.hypot(e.p0[0] - S[0], e.p0[1] - S[1]), dE = Math.hypot(e.p0[0] - E[0], e.p0[1] - E[1]);
            const d = Math.min(dS, dE);
            if (d < a.reach && (!best || d < best.d)) best = { a, d, fromStart: dS <= dE, S, E };
          });
          if (!best) return;
          if (best.fromStart) {
            // 화살표 시작점에 서 있음 → 끝점 쪽으로 이동 (대형 유지)
            const off = [e.p0[0] - best.S[0], e.p0[1] - best.S[1]];
            e.paths[i] = best.a.path.map(q => [q[0] + off[0], q[1] + off[1]]);
            for (let j = i; j < e.pos.length; j++) e.pos[j] = e.paths[i][e.paths[i].length - 1];
          } else {
            // 화살표 끝점(도착 위치)에 그려져 있음 → 시작점에서 출발
            const off = [e.p0[0] - best.E[0], e.p0[1] - best.E[1]];
            e.paths[i] = best.a.path.map(q => [q[0] + off[0], q[1] + off[1]]);
            for (let j = 0; j < i; j++) e.pos[j] = e.paths[i][0];
          }
        });
      });
    }
    const LAST = STEPS.length - 1;
    while (pawnsE.length && pawnsE[0].pos.length < STEPS.length) extend();

    const easeO = t => 1 - Math.pow(1 - t, 3);
    const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const backO = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    function alongPath(path, u) {
      if (path.length < 2) return path[0];
      const seg = []; let tot = 0;
      for (let k = 1; k < path.length; k++) { const l = Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]); seg.push(l); tot += l; }
      let d = u * tot;
      for (let k = 0; k < seg.length; k++) {
        if (d <= seg[k] || k === seg.length - 1) { const f = seg[k] ? Math.min(1, d / seg[k]) : 1; return [path[k][0] + (path[k + 1][0] - path[k][0]) * f, path[k][1] + (path[k + 1][1] - path[k][1]) * f]; }
        d -= seg[k];
      }
    }
    function renderStep(i, u) {
      ENT.forEach(e => {
        const v = i > e.at ? 1 : i === e.at ? u : 0;
        if (e.kind === 'pawn') {
          e.g.visible = v > 0;
          e.g.scale.setScalar(Math.max(0.001, i > 0 ? 1 : backO(v)));
          let q;
          if (i === 0) q = e.pos[0];
          else if (e.paths[i]) q = alongPath(e.paths[i], easeIO(u));
          else { const a = e.pos[i - 1], b = e.pos[i], f = easeIO(u); q = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
          e.g.position.set(q[0], 0, q[1]);
        } else if (e.kind === 'unit') {
          e.g.visible = v > 0; e.g.scale.setScalar(Math.max(0.001, backO(v)));
        } else if (e.kind === 'zone') {
          e.g.visible = v > 0; e.g.scale.setScalar(0.08 + 0.92 * easeO(v));
        } else if (e.kind === 'arrow' || e.kind === 'tether') {
          e.g.visible = v > 0; e.g.userData.reveal(easeO(v));
        } else if (e.kind === 'label') {
          e.g.visible = v > 0; e.g.material.opacity = v;
        }
      });
    }

    /* --- 카메라 시점 --- */
    let tween = null;
    function moveCam(pos, target, instant) {
      if (instant || REDUCED) { camera.position.copy(pos); controls.target.copy(target); controls.update(); return; }
      tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, s: performance.now(), d: 700 };
    }
    // 세로로 긴 화면(모바일)에서는 필드가 잘리지 않게 카메라를 뒤로 뺌
    const fit = ([pos, tg]) => { const k = Math.max(1, 0.95 / camera.aspect); return [tg.clone().add(pos.clone().sub(tg).multiplyScalar(k)), tg]; };
    const VIEWS = {
      top: () => fit([V(0, 345, 0.01), V(0, 0, 0)]),
      quarter: () => fit([V(0, 185, 235), V(0, -6, 12)]),
      low: () => fit([V(-150, 55, 150), V(0, 8, 0)])
    };
    function roleView(role) {
      const p = pawns[role].g.position.clone();
      let d = V(p.x, 0, p.z); if (d.length() < 8) d = V(0, 0, 1); d.normalize();
      // 말 바로 뒤 위쪽에서, 필드 중앙 쪽을 내려다보는 시점
      return [p.clone().addScaledVector(d, 70).setY(125), p.clone().multiplyScalar(0.45).setY(0)];
    }

    /* --- 롤 강조 --- */
    let focus = null;
    function setFocus(role) {
      focus = focus === role ? null : role;
      Object.entries(pawns).forEach(([r, o]) => {
        const on = !focus || r === focus;
        o.mat.opacity = on ? 1 : 0.22;
        o.tag.material.opacity = on ? 1 : 0.3;
        o.ringMat.opacity = r === focus ? 0.9 : 0;
      });
      bar.querySelectorAll('button.role').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.role === focus)));
      if (focus) { const [p, t] = roleView(focus); moveCam(p, t); }
    }

    /* --- 툴바 --- */
    const btn = (txt, on, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; if (cls) b.className = cls; if (on != null) b.setAttribute('aria-pressed', String(on)); b.addEventListener('click', () => fn(b)); return b; };
    const grp = name => { const d = document.createElement('div'); d.className = 'a3d-grp'; d.innerHTML = `<span>${name}</span>`; bar.appendChild(d); return d; };
    /* 재생 */
    const STEP_MS = REDUCED ? 1 : 1500, HOLD_MS = REDUCED ? 900 : 800;
    let cur = LAST, anim = null, playing = false;
    const gp = grp('재생');
    const playBtn = btn('▶ 재생', null, () => {
      if (playing) { playing = false; if (anim) { renderStep(anim.i, 1); anim = null; } syncUI(); return; }
      playing = true; startStep(cur >= LAST ? 0 : cur + 1);
    }, 'play');
    gp.appendChild(playBtn);
    const stepBtns = STEPS.map((st, i) => {
      const b = btn(`${i + 1} ${st.name === String(i + 1) ? '' : st.name}`.trim(), i === cur, () => { playing = false; startStep(i); });
      b.title = st.cap; gp.appendChild(b); return b;
    });
    function startStep(i) {
      cur = i;
      if (i > 0) renderStep(i - 1, 1);
      anim = { i, s: performance.now() };
      syncUI();
    }
    function syncUI() {
      playBtn.textContent = playing ? '⏸ 멈춤' : (cur >= LAST && !anim ? '▶ 처음부터' : '▶ 재생');
      stepBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === cur)));
      const st = STEPS[cur];
      capEl.innerHTML = '';
      const box = document.createElement('div');
      const i1 = document.createElement('i'); i1.textContent = `${cur + 1} / ${STEPS.length}`;
      const b1 = document.createElement('b'); b1.textContent = st.name === String(cur + 1) ? '' : st.name;
      box.append(i1, b1, document.createTextNode(st.cap));
      capEl.appendChild(box);
    }
    function tickPlay(now) {
      if (!anim) return;
      const u = (now - anim.s) / STEP_MS;
      renderStep(anim.i, Math.min(1, u));
      progEl.style.width = ((anim.i + Math.min(1, u)) / STEPS.length * 100) + '%';
      if (u >= 1 + HOLD_MS / STEP_MS) {
        if (playing && anim.i < LAST) startStep(anim.i + 1);
        else { anim = null; playing = false; syncUI(); }
      }
    }
    renderStep(LAST, 1);
    progEl.style.width = '100%';
    syncUI();

    const gv = grp('시점');
    const viewBtns = [['위에서', 'top'], ['쿼터뷰', 'quarter'], ['낮게', 'low']].map(([t, k]) => btn(t, k === 'quarter', b => {
      viewBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      const [p, tg] = VIEWS[k](); moveCam(p, tg);
    }));
    viewBtns.forEach(b => gv.appendChild(b));
    const roles = ['T1', 'T2', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'].filter(r => pawns[r]).concat(Object.keys(pawns).filter(r => !/^[THD][1-4]$/.test(r)));
    if (roles.length) {
      const gr = grp('롤 시점');
      roles.forEach(r => { const b = btn(r, false, () => { viewBtns.forEach(x => x.setAttribute('aria-pressed', 'false')); setFocus(r); }, 'role'); b.dataset.role = r; b.style.background = RC[r[0]] || '#666'; gr.appendChild(b); });
    }
    const gl = grp('표시');
    [['장판', 'zones'], ['롤·보스', 'units'], ['화살표·줄', 'guides'], ['글자', 'labels']].forEach(([t, k]) => {
      if (!G[k].children.length) return;
      gl.appendChild(btn(t, true, b => { G[k].visible = !G[k].visible; b.setAttribute('aria-pressed', String(G[k].visible)); }));
    });
    gl.appendChild(btn('자동 회전', false, b => { controls.autoRotate = !controls.autoRotate; controls.autoRotateSpeed = 1.2; b.setAttribute('aria-pressed', String(controls.autoRotate)); }));

    /* --- 클릭으로 말 강조 --- */
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    let down = null;
    const onDown = e => { down = [e.clientX, e.clientY]; };
    const onUp = e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(G.units.children, true).find(h => h.object.userData.role);
      if (hit) { viewBtns.forEach(x => x.setAttribute('aria-pressed', 'false')); setFocus(hit.object.userData.role); }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    /* --- 시작 연출: 위에서 내려다보다가 쿼터뷰로 --- */
    const [qp, qt] = VIEWS.quarter();
    if (REDUCED) moveCam(qp, qt, true);
    else { camera.position.set(0, 330, 40); controls.target.set(0, 0, 0); controls.update(); moveCam(qp, qt); tween.d = 1100; }

    const ro = new ResizeObserver(() => { renderer.setSize(W(), H(), false); camera.aspect = W() / H(); camera.updateProjectionMatrix(); });
    ro.observe(stage);

    let raf = 0;
    const ease = t => 1 - Math.pow(1 - t, 3);
    const clock = new T.Clock();
    (function loop() {
      raf = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      if (tween) {
        const u = Math.min(1, (performance.now() - tween.s) / tween.d), e = ease(u);
        camera.position.lerpVectors(tween.p0, tween.p1, e);
        controls.target.lerpVectors(tween.t0, tween.t1, e);
        if (u >= 1) tween = null;
      }
      tickPlay(performance.now());
      if (!REDUCED) animators.forEach(f => f(t));
      if (focus && pawns[focus]) { const s = 1 + 0.15 * Math.sin(t * 4); pawns[focus].ring.scale.set(s, s, s); }
      controls.update();
      renderer.render(scene, camera);
    })();
    controls.addEventListener('start', () => { tween = null; });

    return {
      dispose() {
        cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
        renderer.domElement.removeEventListener('pointerdown', onDown);
        renderer.domElement.removeEventListener('pointerup', onUp);
        disposables.forEach(d => d.dispose && d.dispose());
        renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss();
        renderer.domElement.remove();
      }
    };
  }

  function teardown() { if (R) { R.dispose(); R = null; } }
})();
