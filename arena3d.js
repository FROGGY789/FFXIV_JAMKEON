/* arena3d.js — 기믹 도식 3D 뷰어 + 편집기
 *
 * 평면도(SVG)를 그리는 draw(items) 와 같은 데이터를 받아서 Three.js 로 입체 필드를 그림.
 * - draw() 가 만든 <svg data-arena="N"> 옆에 "3D로 보기" 버튼을 자동으로 붙임.
 * - window.UWU({PH, RL, RN, raid}) 가 있으면 카드 정보(페이즈, 롤별 할 일, 시전 기술)를 같이 씀.
 * - 관리자(admin.js 로그인)는 3D 안에서 말·장판을 끌어서 옮기고 저장할 수 있음.
 *   편집 내용은 gh-pages 의 gimmick-edits.json 에 저장되고, 이력에서 이전 버전으로 되돌릴 수 있음.
 *
 * 좌표: SVG (x, y) → 3D (x, 0, y). 북쪽 = -z, 필드 반지름 = 100.
 *
 * 카드 데이터에 넣을 수 있는 추가 항목 (평면도에는 영향 없음)
 *   {seq:[{s:'설명', mv:{D1:[x,y]}, cast:'기술명', aggro:'T2'}, ...]}  재생 순서 직접 쓰기
 *   {aggro:'T2'}   어그로 잡는 탱커 (기본 T1). 머리 위 별 표시
 *   카드 자체의 cast:'기술명'  재생 때 시전 바에 뜨는 이름 (기본: 카드 영문 이름)
 */
(function () {
  'use strict';
  if (window.Arena3D) return;

  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
  const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm';
  const EDITS_FILE = 'gimmick-edits.json';

  const RC = { T: '#2f6fe4', H: '#2e9e55', D: '#d24545' };
  const BC = { '가루다': '#2f7d5b', '이프리트': '#d2552b', '타이탄': '#a07228', '알테마': '#14868c', '라하브레아': '#6b4bb0' };
  const RN0 = ['T1', 'T2', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
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
  const htmlText = s => { const d = document.createElement('div'); d.innerHTML = String(s == null ? '' : s); return d.textContent.trim(); };
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const r1 = v => Math.round(v * 2) / 2;
  // 나침반 각도(북 0°, 시계방향). dx 동쪽+, dy 남쪽+
  const compass = (dx, dy) => (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;

  /* ---------- 로딩 멘트 ---------- */
  const MEMBERS = ['로살리아', '키오레', '팔콘', '말랑찰떡', '홀가분', '피토', 'Ember'];
  // 받침 있으면 a, 없으면 b (이/가, 을/를, 과/와). 영문 이름은 읽는 소리 기준
  const LATIN_BATCHIM = { ember: false };
  function josa(w, a, b) {
    const ch = w.charCodeAt(w.length - 1);
    let has;
    if (ch >= 0xAC00 && ch <= 0xD7A3) has = (ch - 0xAC00) % 28 !== 0;
    else has = !!LATIN_BATCHIM[w.toLowerCase()];
    return w + (has ? a : b);
  }
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const LINES = [
    (m, r) => `${josa(m, '이', '가')} ${r}에게 따귀를 때렸습니다!`,
    (m, r) => `${josa(m, '이', '가')} ${r} 장판을 밟고 누웠습니다!`,
    (m, r) => `${josa(m, '이', '가')} ${josa(r, '을', '를')} 보고 생존기를 전부 눌렀습니다!`,
    (m, r) => `${josa(m, '이', '가')} ${r} 앞에서 탱교를 까먹었습니다!`,
    (m, r) => `${josa(m, '이', '가')} ${r}에게 도발을 걸었습니다! (탱커 아님)`,
    (m, r) => `${josa(m, '이', '가')} 벽에 박혔습니다. ${josa(r, '이', '가')} 웃고 있습니다.`,
    (m, r) => `${josa(m, '이', '가')} ${r} 쉐어에서 혼자 도망쳤습니다!`,
    (m, r) => `${josa(m, '이', '가')} ${r} 전멸기 직전에 LB를 아꼈습니다!`,
    (m, r) => `${josa(m, '이', '가')} 오늘도 ${r}에게 전멸했습니다!`,
    (m, r, m2) => `${josa(m, '이', '가')} ${m2}에게 ${r} 장판을 넘겨줬습니다!`,
    (m, r, m2) => `${josa(m, '과', '와')} ${josa(m2, '이', '가')} ${r} 앞에서 같은 쪽으로 피했습니다!`
  ];
  function loadingLine() {
    const raid = (window.UWU && window.UWU.raid) || '보스';
    const m = pick(MEMBERS); let m2 = pick(MEMBERS); while (m2 === m) m2 = pick(MEMBERS);
    return pick(LINES)(m, raid, m2);
  }

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
  window.Arena3D = { open: (items, opts) => open(items, opts), register: items => REG.push(items) - 1 };

  /* ---------- 카드 정보 (window.UWU) ---------- */
  const U = () => window.UWU && window.UWU.PH ? window.UWU : null;
  function metaOf(items) {
    const u = U(); if (!u) return null;
    for (const ph of u.PH) {
      const ci = ph.cards.findIndex(c => c.d === items);
      if (ci >= 0) return { ph, ci, c: ph.cards[ci], key: ph.id + ':' + ci, roles: ((u.RL || {})[ph.id] || [])[ci] || null, rn: u.RN || RN0 };
    }
    return null;
  }
  const allCards = () => { const u = U(); return u ? u.PH.flatMap(ph => ph.cards.map(c => c.d)) : []; };

  /* ---------- 편집 저장 (gimmick-edits.json) ----------
   * { "garuda:0": { "3": {xy:[x,y]}, "5": {a:[x,y], b:[x,y]}, "7": {ar:[[x,y],[x,y]]} } }
   * 키 = 페이즈id:카드번호, 그 안의 키 = d 배열 안의 항목 번호. 원본 데이터 위에 덮어씀. */
  let EDITS = {}, SAVED = {};
  const ORIG = new Map();
  const cloneItems = v => {
    if (Array.isArray(v)) { const a = v.map(cloneItems); if (v.pol) a.pol = 1; return a; }
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = cloneItems(v[k]); return o; }
    return v;
  };
  function snapshotOrig() {
    const u = U(); if (!u) return false;
    u.PH.forEach(ph => ph.cards.forEach((c, ci) => { const k = ph.id + ':' + ci; if (!ORIG.has(k)) ORIG.set(k, cloneItems(c.d)); }));
    return true;
  }
  function applyCard(ph, ci) {
    const k = ph.id + ':' + ci, d = ph.cards[ci].d, base = ORIG.get(k); if (!base) return;
    const patch = EDITS[k] || {};
    d.length = 0;
    cloneItems(base).forEach((o, i) => {
      const p = patch[i];
      if (p) {
        if (p.xy) { delete o.at; o.xy = p.xy.slice(); }
        if (p.a) { o.a = p.a.slice(); o.b = p.b.slice(); }
        if (p.ar) o.ar = p.ar.map(q => q.slice());
        if (p.dir != null) o.dir = p.dir;
      }
      d.push(o);
    });
  }
  function applyAll() { const u = U(); if (!u) return; u.PH.forEach(ph => ph.cards.forEach((c, ci) => applyCard(ph, ci))); }
  // 평면도 다시 그리기
  function refresh2D() {
    const u = U(); if (!u || !u.draw) return;
    document.querySelectorAll('svg[data-arena]').forEach(svg => {
      const items = REG[+svg.getAttribute('data-arena')]; if (!items || !metaOf(items)) return;
      const t = document.createElement('template'); t.innerHTML = u.draw(items).trim();
      const n = t.content.firstElementChild; if (!n) return;
      const style = svg.getAttribute('style'); if (style) n.setAttribute('style', style);
      n.setAttribute('data-a3d', '1');
      svg.replaceWith(n);
    });
  }
  async function loadEdits() {
    try {
      const A = window.JamAdmin;
      let txt = null;
      if (A && A.on) txt = await A.get(EDITS_FILE);
      else { const r = await fetch(EDITS_FILE, { cache: 'no-cache' }); if (r.ok) txt = await r.text(); }
      const j = txt ? JSON.parse(txt) : {};
      EDITS = j && typeof j === 'object' ? j : {};
    } catch (e) { EDITS = {}; }
    SAVED = JSON.parse(JSON.stringify(EDITS));
    if (Object.keys(EDITS).length) { applyAll(); refresh2D(); }
  }
  (function bootEdits(n) {
    if (snapshotOrig()) loadEdits();
    else if (n < 100) setTimeout(() => bootEdits(n + 1), 100);
  })(0);

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
.a3d-hd{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--a3d-line)}
.a3d-hd h2{font-size:17px;line-height:1.3;margin:0;font-weight:800;flex:1;min-width:0}
.a3d-hd small{display:block;font-size:12px;font-weight:500;color:var(--a3d-sub)}
.a3d-x{flex:none;width:40px;height:40px;border-radius:10px;border:1px solid var(--a3d-line);background:transparent;color:inherit;font-size:20px;cursor:pointer}
.a3d-stage{position:relative;min-height:0;touch-action:none}
.a3d-stage canvas{display:block;width:100%!important;height:100%!important;outline:none}
.a3d-stage.editing canvas{cursor:grab}
.a3d-hint{position:absolute;left:12px;bottom:10px;font-size:12px;color:var(--a3d-sub);pointer-events:none;background:color-mix(in srgb,var(--a3d-bg) 75%,transparent);padding:3px 8px;border-radius:6px}
.a3d-load{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:10px;font-size:15px;font-weight:700;color:var(--a3d-ink);text-align:center;padding:24px;background:var(--a3d-bg);z-index:3}
.a3d-load small{display:block;font-size:12px;font-weight:500;color:var(--a3d-sub)}
.a3d-cap{position:absolute;left:12px;top:12px;right:12px;display:flex;gap:10px;align-items:center;pointer-events:none}
.a3d-cap>div{background:color-mix(in srgb,var(--a3d-bg) 88%,transparent);border:1px solid var(--a3d-line);border-radius:12px;padding:8px 12px;font-size:14px;line-height:1.45;max-width:560px;box-shadow:0 4px 16px rgba(0,0,0,.08)}
.a3d-cap b{display:inline-block;margin-right:8px;font-weight:800}
.a3d-cap i{font-style:normal;color:var(--a3d-sub);font-size:12px;font-weight:700;margin-right:6px}
.a3d-cast{position:absolute;left:50%;top:64px;translate:-50% 0;width:min(360px,calc(100% - 24px));pointer-events:none;display:none;text-align:center;
  font-weight:800;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8),0 0 8px rgba(0,0,0,.5)}
.a3d-cast small{display:block;font-size:12px;font-weight:700;opacity:.9}
.a3d-cast .nm{font-size:16px;margin-top:2px}
.a3d-cast .bar{height:9px;margin-top:5px;border-radius:5px;background:rgba(20,20,30,.55);border:1px solid rgba(255,255,255,.55);overflow:hidden}
.a3d-cast .bar>i{display:block;height:100%;width:0;background:linear-gradient(90deg,#f5b547,#ffe08a)}
.a3d-cast.done .bar>i{background:#fff}
.a3d-role{position:absolute;left:12px;bottom:12px;width:min(380px,calc(100% - 24px));background:var(--a3d-bg);border:1px solid var(--a3d-line);border-radius:14px;padding:10px 12px;font-size:14px;line-height:1.55;box-shadow:0 10px 30px rgba(0,0,0,.15);display:none}
.a3d-role.on{display:block}
.a3d-role b.t{display:inline-grid;place-items:center;min-width:34px;height:24px;border-radius:999px;color:#fff;font-size:12px;margin-right:6px}
.a3d-role .ph{font-size:12px;color:var(--a3d-sub);font-weight:700}
.a3d-role p{margin:6px 0 0}.a3d-role .w{color:#c0392b;font-size:13px;margin-top:4px}
.a3d-prog{position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--a3d-line)}
.a3d-prog>i{display:block;height:100%;width:0;background:var(--a3d-ink)}
.a3d-side{position:absolute;top:12px;right:12px;bottom:12px;width:min(340px,calc(100% - 24px));overflow:auto;background:var(--a3d-bg);border:1px solid var(--a3d-line);border-radius:14px;padding:12px 14px;font-size:14px;line-height:1.55;box-shadow:0 10px 30px rgba(0,0,0,.15);display:none;z-index:2}
.a3d-side.on{display:block}
.a3d-side h3{font-size:14px;margin:0 0 6px;font-weight:800}
.a3d-side ol{margin:0;padding-inline-start:20px}.a3d-side li{margin:4px 0}
.a3d-side .hist{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:6px}
.a3d-side .hist li{border:1px solid var(--a3d-line);border-radius:10px;padding:8px 10px;margin:0}
.a3d-side .hist small{display:block;color:var(--a3d-sub);font-size:12px}
.a3d-side .hist button,.a3d-side .sbtn{margin-top:6px;font:inherit;font-size:12px;font-weight:700;padding:5px 10px;border-radius:8px;border:1px solid var(--a3d-line);background:transparent;color:inherit;cursor:pointer}
.a3d-hb{flex:none;min-height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--a3d-line);background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.a3d-hb[aria-pressed=true]{background:var(--a3d-ink);color:var(--a3d-bg)}
.a3d-hb:disabled{opacity:.35;cursor:default}
.a3d-bar button.play{min-width:92px}
.a3d-bar{display:flex;flex-wrap:wrap;gap:10px 18px;padding:10px 16px 12px;border-top:1px solid var(--a3d-line);font-size:13px}
.a3d-grp{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.a3d-grp>span{color:var(--a3d-sub);font-weight:700;margin-right:2px}
.a3d-bar button{font:inherit;font-size:13px;font-weight:700;min-height:34px;padding:4px 11px;border-radius:999px;border:1px solid var(--a3d-line);background:transparent;color:inherit;cursor:pointer}
.a3d-bar button[aria-pressed=true]{background:var(--a3d-ink);color:var(--a3d-bg);border-color:var(--a3d-ink)}
.a3d-bar button.role{color:#fff;border-color:transparent;min-width:42px}
.a3d-bar button.role[aria-pressed=true]{box-shadow:0 0 0 2px var(--a3d-bg),0 0 0 4px var(--a3d-ink)}
.a3d-bar button.warn{border-color:#c0392b;color:#c0392b}
.a3d-bar button:focus-visible,.a3d-x:focus-visible,.a3d-hb:focus-visible{outline:3px solid var(--a3d-sub);outline-offset:2px}
.a3d-dirty{color:#c0392b;font-weight:800}
@media(max-width:640px){dialog.a3d{width:100vw;height:100dvh;border-radius:0}.a3d-hint{display:none}.a3d-bar{display:grid;gap:8px;padding:8px 12px 10px}.a3d-grp{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.a3d-grp>*{flex:none}.a3d-hd .a3d-hb.nav{display:none}}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const CUBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>';

  /* ---------- 버튼 자동 부착 ---------- */
  function attach() {
    document.querySelectorAll('svg[data-arena]:not([data-a3d])').forEach(svg => {
      svg.setAttribute('data-a3d', '1');
      const items = REG[+svg.getAttribute('data-arena')];
      if (!items) return;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'a3d-btn';
      btn.innerHTML = CUBE + '3D로 보기';
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (metaOf(items)) { open(items); return; }
        // 카드 정보가 없는 페이지: 화면에서 제목·공략 순서를 읽음
        let card = svg.parentElement, n = 0;
        while (card && n++ < 8 && !card.querySelector('ol li')) card = card.parentElement;
        if (!card || n > 8) card = svg.closest('article, .card');
        const h = card && card.querySelector('h3, h2');
        const steps = card ? [...card.querySelectorAll('ol li')].map(li => li.textContent.trim()).filter(Boolean) : [];
        open(items, { title: h ? strip(h.textContent) : '기믹 3D 보기', steps });
      });
      const after = svg.nextElementSibling && svg.nextElementSibling.classList.contains('cap') ? svg.nextElementSibling : svg;
      after.insertAdjacentElement('afterend', btn);
    });
  }
  const mo = new MutationObserver(attach);
  const boot = () => { attach(); mo.observe(document.body, { childList: true, subtree: true }); };
  if (document.body) boot(); else addEventListener('DOMContentLoaded', boot);

  /* ---------- 다이얼로그 ---------- */
  let dlg, stage, bar, titleEl, subEl, loadEl, capEl, sideEl, sideBtn, progEl, castEl, roleEl, prevBtn, nextBtn;
  function ensureDialog() {
    if (dlg) return;
    dlg = document.createElement('dialog');
    dlg.className = 'a3d';
    dlg.setAttribute('aria-labelledby', 'a3d-title');
    dlg.innerHTML = `<div class="a3d-in">
  <div class="a3d-hd"><h2 id="a3d-title"><span></span><small></small></h2>
    <button class="a3d-hb nav" type="button" data-nav="-1" aria-label="이전 기믹">◀</button><button class="a3d-hb nav" type="button" data-nav="1" aria-label="다음 기믹">▶</button>
    <button class="a3d-hb side" type="button" aria-pressed="false" hidden>공략 순서</button><button class="a3d-x" type="button" aria-label="닫기">✕</button></div>
  <div class="a3d-stage"><div class="a3d-load"></div><div class="a3d-cap" aria-live="polite"></div>
    <div class="a3d-cast" aria-live="polite"><small></small><div class="nm"></div><div class="bar"><i></i></div></div>
    <div class="a3d-hint">드래그: 회전 · 휠/핀치: 확대 · 우클릭/두 손가락: 이동 · 말 클릭: 강조 + 할 일</div>
    <div class="a3d-role" aria-live="polite"></div><aside class="a3d-side"></aside><div class="a3d-prog"><i></i></div></div>
  <div class="a3d-bar"></div></div>`;
    document.body.appendChild(dlg);
    const q = s => dlg.querySelector(s);
    stage = q('.a3d-stage'); bar = q('.a3d-bar'); titleEl = q('#a3d-title span'); subEl = q('#a3d-title small');
    loadEl = q('.a3d-load'); capEl = q('.a3d-cap'); sideEl = q('.a3d-side'); sideBtn = q('.a3d-hb.side');
    progEl = q('.a3d-prog>i'); castEl = q('.a3d-cast'); roleEl = q('.a3d-role');
    prevBtn = q('[data-nav="-1"]'); nextBtn = q('[data-nav="1"]');
    sideBtn.addEventListener('click', () => { if (sideEl.dataset.mode !== 'steps') showSteps(); const on = !sideEl.classList.contains('on'); sideEl.classList.toggle('on', on); sideBtn.setAttribute('aria-pressed', String(on)); });
    [prevBtn, nextBtn].forEach(b => b.addEventListener('click', () => { CONT = false; go(+b.dataset.nav, false); }));
    q('.a3d-x').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('cancel', e => { if (EDIT && dirty() && !confirm('저장 안 한 편집이 있음. 닫을까?')) e.preventDefault(); });
    dlg.addEventListener('close', () => { CONT = false; EDIT = false; camState = null; CUR = null; if (dirty()) { EDITS = JSON.parse(JSON.stringify(SAVED)); applyAll(); refresh2D(); } teardown(); });
  }

  let libs, libsReady = false;
  function loadLibs() {
    if (!libs) libs = Promise.all([import(THREE_URL), import(ORBIT_URL)]).then(([T, O]) => { libsReady = true; return { T, OrbitControls: O.OrbitControls }; });
    return libs;
  }

  /* ---------- 상태 (카드를 넘겨도 유지) ---------- */
  let R = null;            // 현재 장면
  let CUR = null;          // 현재 카드 items
  let OPTS = {};           // 메타 없을 때 넘겨받은 제목 등
  let FOCUS = null;        // 강조 중인 롤
  let CONT = false;        // 전체 연속 재생 중
  let SPEED = 1;           // 재생 배속
  let EDIT = false;        // 편집 모드
  let camState = null;     // 카드 넘길 때 카메라 유지
  const dirty = () => JSON.stringify(EDITS) !== JSON.stringify(SAVED);

  function go(delta, autoplay) {
    const list = allCards(), i = list.indexOf(CUR);
    if (i < 0 || !list[i + delta]) return false;
    open(list[i + delta], { autoplay, keepCam: true });
    return true;
  }

  async function open(items, opts = {}) {
    ensureDialog();
    if (EDIT && dirty() && items !== CUR && !confirm('저장 안 한 편집이 있음. 버리고 넘어갈까?')) return;
    if (items !== CUR && dirty()) { EDITS = JSON.parse(JSON.stringify(SAVED)); applyAll(); refresh2D(); }
    if (items !== CUR) EDIT = EDIT && !!metaOf(items);
    if (!opts.keepCam) camState = null;
    else if (R) camState = R.cam();
    CUR = items; OPTS = opts;
    const meta = metaOf(items);
    const pal = palette();
    dlg.style.setProperty('--a3d-bg', pal.card.hex);
    dlg.style.setProperty('--a3d-ink', pal.ink.hex);
    dlg.style.setProperty('--a3d-sub', pal.sub.hex);
    dlg.style.setProperty('--a3d-line', pal.line.css);
    const list = allCards(), idx = list.indexOf(items);
    titleEl.textContent = meta ? htmlText(meta.c.h) : (opts.title || '기믹 3D 보기');
    subEl.textContent = meta ? `${meta.ph.name} · ${idx + 1}/${list.length}${meta.c.en ? ' · ' + htmlText(meta.c.en) : ''}` : '';
    prevBtn.hidden = nextBtn.hidden = idx < 0;
    prevBtn.disabled = idx <= 0; nextBtn.disabled = idx < 0 || idx >= list.length - 1;
    const steps = meta ? (meta.c.steps || []).map(htmlText) : (opts.steps || []);
    sideBtn.hidden = !steps.length;
    if (sideEl.classList.contains('on') && sideEl.dataset.mode === 'steps') showSteps();
    else if (sideEl.dataset.mode !== 'hist') { sideEl.classList.remove('on'); sideBtn.setAttribute('aria-pressed', 'false'); }
    capEl.innerHTML = ''; castEl.style.display = 'none';
    if (!dlg.open) dlg.showModal();
    let L;
    if (!libsReady) {
      // 첫 로딩: 부대원 멘트를 돌려가며 보여줌 (최소 1.4초)
      const say = () => { loadEl.innerHTML = ''; const d = document.createElement('div'); d.textContent = loadingLine(); const s = document.createElement('small'); s.textContent = '3D 필드 준비 중…'; loadEl.append(d, s); };
      say(); loadEl.style.display = '';
      const tm = setInterval(say, 1600);
      try { [L] = await Promise.all([loadLibs(), new Promise(r => setTimeout(r, 1400))]); }
      catch (e) { clearInterval(tm); loadEl.textContent = '3D 엔진을 불러오지 못함. 인터넷 연결을 확인 바람.'; libs = null; return; }
      clearInterval(tm);
    } else L = await loadLibs();
    if (!dlg.open || CUR !== items) return;
    loadEl.style.display = 'none';
    teardown();
    bar.innerHTML = '';
    R = build(L, items, pal, { meta, autoplay: !!opts.autoplay });
  }
  function showSteps() {
    const meta = metaOf(CUR);
    const steps = meta ? (meta.c.steps || []).map(htmlText) : (OPTS.steps || []);
    sideEl.dataset.mode = 'steps'; sideEl.innerHTML = '';
    const h = document.createElement('h3'); h.textContent = '공략 순서'; sideEl.appendChild(h);
    const ol = document.createElement('ol');
    steps.forEach(t => { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); });
    sideEl.appendChild(ol);
    if (meta && meta.c.tip) { const p = document.createElement('p'); p.style.cssText = 'margin:8px 0 0;font-size:13px;color:var(--a3d-sub)'; p.textContent = htmlText(meta.c.tip); sideEl.appendChild(p); }
  }

  function palette() {
    const g = k => resolveColor(`var(${k})`, FALLBACK[k]);
    return { card: g('--card'), ink: g('--ink'), sub: g('--sub'), line: g('--line'), floor: g('--floor'), rim: g('--rim'),
      bad: g('--bad'), badS: g('--badS'), safe: g('--safe'), safeS: g('--safeS'), buf: g('--buf'), bufS: g('--bufS') };
  }

  /* ---------- 장면 만들기 ---------- */
  function build({ T, OrbitControls }, items, pal, { meta, autoplay }) {
    const W = () => stage.clientWidth || 800, H = () => stage.clientHeight || 600;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(W(), H(), false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', '기믹 3D 필드. 드래그해서 회전');
    stage.prepend(renderer.domElement);
    stage.classList.toggle('editing', EDIT);

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
      vertexShader: 'varying float vH;void main(){vH=uv.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
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
      const baseOp = Math.min(0.75, fill.a * 1.9);
      const geo = track(new T.ShapeGeometry(shape, 48)); geo.rotateX(Math.PI / 2);
      const m = new T.Mesh(geo, track(new T.MeshBasicMaterial({ color: fill.hex, transparent: true, opacity: baseOp, depthWrite: false, side: T.DoubleSide })));
      m.position.y = y; m.renderOrder = 1;
      g.add(m);
      const ex = shape.extractPoints(48);
      const loops = [ex.shape, ...ex.holes];
      const lineOp = Math.max(0.6, stroke.a);
      const lineMat = track(new T.LineBasicMaterial({ color: stroke.hex, transparent: true, opacity: lineOp }));
      loops.forEach(pts => {
        const lg = track(new T.BufferGeometry().setFromPoints(pts.concat([pts[0]]).map(p => V(p.x, y + 0.05, p.y))));
        const l = new T.Line(lg, lineMat); l.renderOrder = 2; g.add(l);
      });
      const wm = wallMat(stroke, kind === 'bad' ? 0.55 : 0.4);
      const wall = new T.Mesh(wallGeo(loops, ZH[kind] || 8), wm);
      wall.position.y = y; wall.renderOrder = 3;
      g.add(wall);
      if (kind === 'bad') animators.push(t => { wm.uniforms.uPulse.value = 0.75 + 0.25 * Math.sin(t * 3); });
      // 재생 때 장판 중심에서 퍼지도록 그룹 원점을 장판 중심으로 옮김
      const c = new T.Box3().setFromObject(g).getCenter(V(0, 0, 0));
      g.children.forEach(ch => { ch.position.x -= c.x; ch.position.z -= c.z; });
      g.position.set(c.x, 0, c.z);
      g.userData.z = { fill: m, baseOp, lineMat, lineOp, wall, home: g.position.clone() };
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
      g.userData.reveal = u => {
        g.children.forEach(m => {
          if (m.userData.head) { m.visible = u >= 0.98; return; }
          const [u0, u1] = m.userData.u, f = clamp01((u - u0) / (u1 - u0 || 1));
          m.visible = f > 0;
          m.geometry.setDrawRange(0, f >= 1 ? Infinity : Math.floor(m.geometry.index.count * f / 6) * 6);
        });
      };
      G.guides.add(g);
      return g;
    }

    /* --- 머리 위 표시: 보석(징표), 별(어그로) --- */
    function gem(color) {
      const g = new T.Group();
      const m = new T.Mesh(track(new T.OctahedronGeometry(2.6)), track(new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.3 })));
      m.scale.set(1, 1.5, 1); m.castShadow = true; g.add(m);
      const halo = new T.Mesh(track(new T.RingGeometry(3.2, 4, 32)), track(new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false })));
      g.add(halo);
      animators.push(t => { m.rotation.y = t * 2.2; g.position.y = g.userData.y + Math.sin(t * 3) * 0.6; halo.lookAt(camera.position); halo.scale.setScalar(1 + 0.15 * Math.sin(t * 4)); });
      return g;
    }
    function star() {
      const s = new T.Shape();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 1.1 : 2.6, a = i / 10 * Math.PI * 2 - Math.PI / 2; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const geo = track(new T.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false })); geo.center();
      const m = new T.Mesh(geo, track(new T.MeshStandardMaterial({ color: '#f5c542', emissive: '#f5a623', emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.4 })));
      m.castShadow = true;
      m.scale.setScalar(1.35);
      const g = new T.Group(); g.add(m);
      animators.push(t => { m.rotation.y = t * 1.8; });
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
      pawns[role] = { g, mat, ring, ringMat, tag, topY: 27 };
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
        const gm = new T.Mesh(track(new T.OctahedronGeometry(r * 0.55)), track(new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.2 })));
        gm.position.y = h + r * 0.75; gm.castShadow = true; g.add(gm);
        animators.push(t => { gm.rotation.y = t * 0.8; gm.position.y = h + r * 0.75 + Math.sin(t * 1.6) * 0.7; });
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
    const floorDisc = (function floor() {
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
        const s = label(t, { color: pal.sub.hex, halo: pal.card.hex, size: 8 }); s.position.copy(W3(P(a, 114), 4)); G.floor.add(s);
      });
      return disc;
    })();

    /* --- 데이터 → 오브젝트 --- */
    const ENT = []; // {kind, g, idx, at, delay, span, ...}
    const textItems = [];
    const add = (kind, g, extra) => { const e = Object.assign({ kind, g, delay: 0, span: 1 }, extra); g.userData.ent = e; ENT.push(e); return e; };
    items.forEach((o, idx) => {
      if (!o || typeof o !== 'object') return;
      const k = o.k || 'bad';
      if (o.z === 'c') {
        const [x, y] = at(o); const s = new T.Shape(); s.absarc(x, y, o.r, 0, Math.PI * 2, false); add('zone', zone(s, k), { idx });
      } else if (o.z === 'donut') {
        const [x, y] = at(o); const s = new T.Shape(); s.absarc(x, y, o.r2, 0, Math.PI * 2, false);
        const hole = new T.Path(); hole.absarc(x, y, o.r1, 0, Math.PI * 2, true); s.holes.push(hole); add('zone', zone(s, k), { idx });
      } else if (o.z === 'cone') {
        const [x, y] = at(o); const s = new T.Shape(); s.moveTo(x, y);
        const n = Math.max(8, Math.ceil(o.w / 4));
        for (let i = 0; i <= n; i++) { const [dx, dy] = P(o.dir - o.w / 2 + o.w * i / n, o.len); s.lineTo(x + dx, y + dy); }
        s.lineTo(x, y); add('zone', zone(s, k), { idx });
      } else if (o.z === 'band') {
        const [x1, y1] = xy(o.a), [x2, y2] = xy(o.b); const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), nx = -dy / L * o.w / 2, ny = dx / L * o.w / 2;
        const s = new T.Shape(); s.moveTo(x1 + nx, y1 + ny); s.lineTo(x2 + nx, y2 + ny); s.lineTo(x2 - nx, y2 - ny); s.lineTo(x1 - nx, y1 - ny); s.lineTo(x1 + nx, y1 + ny); add('zone', zone(s, k), { idx });
      } else if (o.ar) {
        const a = xy(o.ar[0]), b = xy(o.ar[1]);
        const pts = []; for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push(V(a[0] + (b[0] - a[0]) * u, 2 + Math.sin(u * Math.PI) * 3, a[1] + (b[1] - a[1]) * u)); }
        add('arrow', tubeAlong(pts, resolveColor(o.c || 'var(--ink)').hex, { dash: !!o.dash }), { idx, dash: !!o.dash, path: [a, b], reach: 20 });
      } else if (o.arc) {
        const { r, a1, a2 } = o.arc; const n = Math.max(12, Math.ceil(Math.abs(a2 - a1) / 5)); const pts = [], path = [];
        for (let i = 0; i <= n; i++) { const q = P(a1 + (a2 - a1) * i / n, r); path.push(q); pts.push(W3(q, 2)); }
        add('arrow', tubeAlong(pts, resolveColor(o.c || 'var(--ink)').hex, { dash: !!o.dash }), { idx, dash: !!o.dash, path, reach: 26, fixed: 1 });
      } else if (o.te) {
        const a = xy(o.te[0]), b = xy(o.te[1]); const pts = [];
        for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(V(a[0] + (b[0] - a[0]) * u, 10 + Math.sin(u * Math.PI) * 8, a[1] + (b[1] - a[1]) * u)); }
        add('tether', tubeAlong(pts, resolveColor(o.c || '#27a35a').hex, { dash: true, head: false, radius: 0.7 }), { idx, fixed: 1 });
      } else if (o.b != null) {
        add('unit', boss(o.b, at(o), o), { idx });
      } else if (o.p) {
        add('pawn', pawn(o.p, at(o)), { idx, role: o.p, p0: at(o) });
      } else if (o.t) {
        textItems.push([o, idx]);
      } else if (o.m) {
        add('unit', waymark(o.m, at(o)), { idx });
      }
    });
    // 글자: "징표"는 가장 가까운 롤 머리 위 보석으로 바꿈
    textItems.forEach(([o, idx]) => {
      const txt = strip(o.t), p = at(o);
      if (/징표|표식/.test(txt)) {
        let best = null;
        ENT.forEach(e => { if (e.kind !== 'pawn') return; const d = Math.hypot(e.p0[0] - p[0], e.p0[1] - p[1]); if (d < 40 && (!best || d < best.d)) best = { e, d }; });
        const gm = gem('#c13cff');
        if (best) { const pw = pawns[best.e.role]; gm.userData.y = pw.topY; pw.topY += 7; best.e.g.add(gm); }
        else { gm.userData.y = 10; gm.position.copy(W3(p)); G.labels.add(gm); add('label', gm, { idx, gem: 1 }); }
        return;
      }
      const s = label(o.t, { color: resolveColor(o.c || 'var(--ink)').hex, halo: pal.floor.hex, size: (o.fs || 9) * 0.85 });
      s.position.copy(W3(p, 6)); G.labels.add(s);
      add('label', s, { idx });
    });
    // 어그로 탱커 별
    const aggroOf = f => (f && f.aggro) || (items.find(o => o && o.aggro) || {}).aggro || 'T1';
    const starG = star();
    function setAggro(role) {
      const pw = pawns[role];
      if (!pw) { starG.visible = false; return; }
      starG.visible = true;
      if (starG.parent !== pw.g) { pw.g.add(starG); starG.position.y = pw.topY + 0.5; }
    }
    setAggro(aggroOf());

    /* --- 재생 타임라인 ---
     * 기본(자동): ① 배치 → ② 장판(시전 바 → 장판 퍼짐) → ③ 이동(실선 화살표) → ④ 이동(점선 화살표)
     * 직접 작성: d 안에 {seq:[{s, mv, cast, aggro}, ...]} */
    const castName = (meta && (meta.c.cast || htmlText(meta.c.en))) || '';
    const bossName = (items.find(o => o && o.b && (BC[o.b] || (o.r || 11) >= 9)) || {}).b || '';
    const STEPS = [
      { name: '배치', cap: '보스와 각 롤의 시작 위치', dur: 0.8 },
      { name: '장판', cap: '시전 → 장판 · 줄 · 표시가 깔림', dur: 2.6, cast: castName ? { boss: bossName, name: castName } : null }
    ];
    const pawnsE = ENT.filter(e => e.kind === 'pawn');
    pawnsE.forEach(e => { e.pos = [e.p0, e.p0]; e.paths = []; });
    ENT.forEach(e => { e.at = e.kind === 'pawn' || e.kind === 'unit' ? 0 : 1; });
    // 장판 단계: 시전 바가 먼저 차고(0~40%), 장판이 하나씩 이어서 퍼짐
    const CAST_END = STEPS[1].cast ? 0.4 : 0;
    let zj = 0;
    ENT.forEach(e => {
      if (e.at !== 1) return;
      if (e.kind === 'zone') { e.delay = CAST_END + Math.min(0.3, zj++ * 0.07); e.span = 0.3; }
      else { e.delay = CAST_END + 0.25; e.span = 0.3; }
    });
    const seq = (items.find(o => o && o.seq) || {}).seq;
    const extend = () => pawnsE.forEach(e => e.pos.push(e.pos[e.pos.length - 1]));
    if (seq && seq.length) {
      seq.forEach(f => {
        STEPS.push({ name: String(STEPS.length + 1), cap: strip(f.s || ''), dur: f.cast ? 2 : 1.3, cast: f.cast ? { boss: bossName, name: f.cast } : null, aggro: f.aggro });
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
        STEPS.push({ name: groups.length > 1 ? `이동 ${'①②'[gi]}` : '이동', cap: gi ? '점선 화살표: 다음 순서 이동' : '화살표 방향으로 이동', dur: 1.2 });
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
            const off = [e.p0[0] - best.S[0], e.p0[1] - best.S[1]];
            e.paths[i] = best.a.path.map(q => [q[0] + off[0], q[1] + off[1]]);
            for (let j = i; j < e.pos.length; j++) e.pos[j] = e.paths[i][e.paths[i].length - 1];
          } else {
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
        const v = i > e.at ? 1 : i === e.at ? clamp01((u - e.delay) / e.span) : 0;
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
          // 장판: 테두리가 먼저 번쩍 → 바닥이 중심에서 퍼지며 차오름 → 벽이 솟음
          const z = e.g.userData.z, w = easeO(v);
          e.g.visible = v > 0;
          e.g.scale.set(0.12 + 0.88 * w, 1, 0.12 + 0.88 * w);
          z.lineMat.opacity = z.lineOp * Math.min(1, v * 4);
          z.fill.material.opacity = z.baseOp * (w + 0.7 * Math.sin(Math.PI * v));
          z.wall.scale.y = Math.max(0.001, clamp01((v - 0.35) / 0.65));
        } else if (e.kind === 'arrow' || e.kind === 'tether') {
          e.g.visible = v > 0; e.g.userData.reveal(easeO(v));
        } else if (e.kind === 'label') {
          e.g.visible = v > 0; if (e.g.material) e.g.material.opacity = v;
        }
      });
      // 어그로: 그 단계까지 마지막으로 지정된 탱커
      let ag = aggroOf();
      for (let j = 0; j <= i; j++) if (STEPS[j].aggro) ag = STEPS[j].aggro;
      setAggro(ag);
    }
    function renderCast(i, u, active) {
      const c = active && STEPS[i] && STEPS[i].cast;
      if (!c) { castEl.style.display = 'none'; return; }
      const end = i === 1 ? CAST_END || 0.4 : 0.45;
      const f = clamp01(u / end);
      castEl.style.display = 'block';
      castEl.classList.toggle('done', f >= 1);
      castEl.querySelector('small').textContent = c.boss ? `${c.boss} 시전` : '시전';
      castEl.querySelector('.nm').textContent = c.name;
      castEl.querySelector('.bar>i').style.width = (f * 100) + '%';
      castEl.style.opacity = f >= 1 ? String(clamp01(1 - (u - end) / 0.5)) : '1';
    }

    /* --- 카메라 시점 --- */
    let tween = null;
    function moveCam(pos, target, instant) {
      if (instant || REDUCED) { camera.position.copy(pos); controls.target.copy(target); controls.update(); return; }
      tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, s: performance.now(), d: 700 };
    }
    const fit = ([pos, tg]) => { const k = Math.max(1, 0.95 / camera.aspect); return [tg.clone().add(pos.clone().sub(tg).multiplyScalar(k)), tg]; };
    const VIEWS = {
      top: () => fit([V(0, 345, 0.01), V(0, 0, 0)]),
      quarter: () => fit([V(0, 185, 235), V(0, -6, 12)]),
      low: () => fit([V(-150, 55, 150), V(0, 8, 0)])
    };

    /* --- 롤 강조 (시점은 그대로) + 할 일 --- */
    function applyFocus() {
      Object.entries(pawns).forEach(([r, o]) => {
        const on = !FOCUS || r === FOCUS;
        o.mat.opacity = on ? 1 : 0.22;
        o.tag.material.opacity = on ? 1 : 0.3;
        o.ringMat.opacity = r === FOCUS ? 0.9 : 0;
      });
      bar.querySelectorAll('button.role').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.role === FOCUS)));
      roleEl.innerHTML = '';
      roleEl.classList.toggle('on', !!FOCUS);
      stage.querySelector('.a3d-hint').style.visibility = FOCUS ? 'hidden' : '';
      if (!FOCUS) return;
      const head = document.createElement('div');
      const t = document.createElement('b'); t.className = 't'; t.textContent = FOCUS; t.style.background = RC[FOCUS[0]] || '#666';
      const ph = document.createElement('span'); ph.className = 'ph'; ph.textContent = meta ? `${meta.ph.name} · 이 기믹에서 할 일` : '할 일';
      head.append(t, ph); roleEl.appendChild(head);
      const ri = meta ? meta.rn.indexOf(FOCUS) : -1;
      const row = meta && meta.roles && ri >= 0 ? meta.roles[ri] : null;
      const p = document.createElement('p'); p.textContent = row && htmlText(row[0]) ? htmlText(row[0]) : '이 기믹에 따로 적힌 역할 없음';
      roleEl.appendChild(p);
      if (row && row[1]) { const w = document.createElement('div'); w.className = 'w'; w.textContent = '⚠ ' + htmlText(row[1]); roleEl.appendChild(w); }
    }
    function setFocus(role) { FOCUS = FOCUS === role ? null : role; applyFocus(); }

    /* --- 툴바 --- */
    const btn = (txt, on, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; if (cls) b.className = cls; if (on != null) b.setAttribute('aria-pressed', String(on)); b.addEventListener('click', () => fn(b)); return b; };
    const grp = name => { const d = document.createElement('div'); d.className = 'a3d-grp'; d.innerHTML = `<span>${name}</span>`; bar.appendChild(d); return d; };

    /* 재생 */
    const BASE_MS = REDUCED ? 1 : 1000, HOLD_MS = REDUCED ? 700 : 450;
    let cur = LAST, anim = null, playing = false;
    const stepMs = i => BASE_MS * (STEPS[i].dur || 1) / SPEED;
    const gp = grp('재생');
    const playBtn = btn('▶ 재생', null, () => {
      if (playing) { playing = false; CONT = false; if (anim) { renderStep(anim.i, 1); anim = null; renderCast(0, 0, false); } syncUI(); return; }
      playing = true; startStep(cur >= LAST ? 0 : cur + 1);
    }, 'play');
    gp.appendChild(playBtn);
    const stepBtns = STEPS.map((stp, i) => {
      const b = btn(`${i + 1} ${stp.name === String(i + 1) ? '' : stp.name}`.trim(), i === cur, () => { playing = false; CONT = false; startStep(i); });
      b.title = stp.cap; gp.appendChild(b); return b;
    });
    const speedBtn = btn(`속도 ${SPEED}x`, null, b => { SPEED = SPEED === 1 ? 1.5 : SPEED === 1.5 ? 2 : SPEED === 2 ? 0.75 : 1; b.textContent = `속도 ${SPEED}x`; if (anim) anim.s = performance.now() - anim.el / SPEED; });
    gp.appendChild(speedBtn);
    let contBtn = null;
    if (allCards().length && meta) {
      contBtn = btn(CONT ? '■ 연속 재생 중지' : '▶▶ 전체 연속 재생', CONT, () => {
        if (CONT) { CONT = false; playing = false; anim = null; syncUI(); return; }
        CONT = true;
        const first = allCards()[0];
        if (first === items) { playing = true; startStep(0); syncUI(); }
        else open(first, { autoplay: true, keepCam: true });
      });
      contBtn.title = '처음 기믹부터 마지막까지 이어서 재생';
      gp.appendChild(contBtn);
    }
    function startStep(i) {
      cur = i;
      anim = { i, s: performance.now(), el: 0 };
      syncUI();
    }
    function syncUI() {
      playBtn.textContent = playing ? '⏸ 멈춤' : (cur >= LAST && !anim ? '▶ 처음부터' : '▶ 재생');
      if (contBtn) { contBtn.textContent = CONT ? '■ 연속 재생 중지' : '▶▶ 전체 연속 재생'; contBtn.setAttribute('aria-pressed', String(CONT)); }
      stepBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === cur)));
      const stp = STEPS[cur];
      capEl.innerHTML = '';
      const box = document.createElement('div');
      const i1 = document.createElement('i'); i1.textContent = `${cur + 1} / ${STEPS.length}`;
      const b1 = document.createElement('b'); b1.textContent = stp.name === String(cur + 1) ? '' : stp.name;
      box.append(i1, b1, document.createTextNode(stp.cap));
      if (EDIT) { const d = document.createElement('span'); d.className = 'a3d-dirty'; d.textContent = dirty() ? '  · 저장 안 됨' : ''; box.appendChild(d); }
      capEl.appendChild(box);
    }
    function tickPlay(now) {
      if (!anim) return;
      const ms = stepMs(anim.i);
      anim.el = (now - anim.s) * SPEED;
      const u = (now - anim.s) / ms;
      renderStep(anim.i, Math.min(1, u));
      renderCast(anim.i, Math.min(1.5, u), true);
      progEl.style.width = ((anim.i + Math.min(1, u)) / STEPS.length * 100) + '%';
      if (u >= 1 + HOLD_MS / ms) {
        if (playing && anim.i < LAST) startStep(anim.i + 1);
        else {
          anim = null; playing = false; renderCast(0, 0, false); syncUI();
          if (CONT && !go(1, true)) { CONT = false; syncUI(); }
        }
      }
    }

    const gv = grp('시점');
    const viewBtns = [['위에서', 'top'], ['쿼터뷰', 'quarter'], ['낮게', 'low']].map(([t, k]) => btn(t, false, b => {
      viewBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      const [p, tg] = VIEWS[k](); moveCam(p, tg);
    }));
    viewBtns.forEach(b => gv.appendChild(b));
    const roles = RN0.filter(r => pawns[r]).concat(Object.keys(pawns).filter(r => !RN0.includes(r)));
    if (roles.length) {
      const gr = grp('롤');
      roles.forEach(r => { const b = btn(r, false, () => setFocus(r), 'role'); b.dataset.role = r; b.style.background = RC[r[0]] || '#666'; gr.appendChild(b); });
    }
    const gl = grp('표시');
    [['장판', 'zones'], ['롤·보스', 'units'], ['화살표·줄', 'guides'], ['글자', 'labels']].forEach(([t, k]) => {
      if (!G[k].children.length) return;
      gl.appendChild(btn(t, true, b => { G[k].visible = !G[k].visible; b.setAttribute('aria-pressed', String(G[k].visible)); }));
    });

    /* --- 편집 (관리자) --- */
    const A = window.JamAdmin;
    if (A && A.on && meta) {
      const ge = grp('편집');
      ge.appendChild(btn(EDIT ? '편집 끝내기' : '✎ 편집', EDIT, () => {
        if (EDIT && dirty() && !confirm('저장 안 한 편집이 있음. 편집 취소하고 끝낼까?')) return;
        if (EDIT && dirty()) { EDITS = JSON.parse(JSON.stringify(SAVED)); applyAll(); refresh2D(); }
        EDIT = !EDIT; rebuild();
      }));
      if (EDIT) {
        ge.appendChild(btn('저장', null, async b => {
          b.disabled = true; b.textContent = '저장 중…';
          try {
            const latestTxt = await A.get(EDITS_FILE);
            const latest = latestTxt ? JSON.parse(latestTxt) : {};
            if (EDITS[meta.key]) latest[meta.key] = EDITS[meta.key]; else delete latest[meta.key];
            await A.save(EDITS_FILE, JSON.stringify(latest, null, 1), `기믹 편집: ${meta.ph.name} · ${htmlText(meta.c.h)}`);
            EDITS = latest; SAVED = JSON.parse(JSON.stringify(latest)); applyAll(); refresh2D();
            b.textContent = '저장됨'; syncUI();
            setTimeout(() => { b.textContent = '저장'; b.disabled = false; }, 1500);
          } catch (e) { alert('저장 실패: ' + e.message); b.textContent = '저장'; b.disabled = false; }
        }));
        ge.appendChild(btn('편집 취소', null, () => { EDITS = JSON.parse(JSON.stringify(SAVED)); applyAll(); refresh2D(); rebuild(); }));
        ge.appendChild(btn('이 기믹 원래대로', null, () => {
          if (!EDITS[meta.key]) { alert('이 기믹은 편집한 적 없음 (원래 상태)'); return; }
          if (!confirm('이 기믹의 위치 편집을 모두 지우고 처음 데이터로 돌림. 저장을 눌러야 반영됨.')) return;
          delete EDITS[meta.key]; applyCard(meta.ph, meta.ci); refresh2D(); rebuild();
        }, 'warn'));
        ge.appendChild(btn('편집 이력', null, () => showHistory()));
      }
    }
    function rebuild() { open(items, { keepCam: true }); }

    async function showHistory() {
      sideEl.dataset.mode = 'hist'; sideEl.classList.add('on'); sideBtn.setAttribute('aria-pressed', 'false');
      sideEl.innerHTML = '<h3>편집 이력</h3><p style="margin:0;font-size:13px;color:var(--a3d-sub)">불러오는 중…</p>';
      let list;
      try { list = await A.history(EDITS_FILE); } catch (e) { sideEl.innerHTML = '<h3>편집 이력</h3>'; sideEl.append('불러오지 못함: ' + e.message); return; }
      sideEl.innerHTML = '';
      const h = document.createElement('h3'); h.textContent = '편집 이력 (전체 기믹)'; sideEl.appendChild(h);
      const note = document.createElement('p'); note.style.cssText = 'margin:0;font-size:12px;color:var(--a3d-sub)';
      note.textContent = '"이 버전으로 되돌리기"는 그 시점 상태로 모든 기믹 편집을 되돌려서 바로 저장함.'; sideEl.appendChild(note);
      const close = document.createElement('button'); close.type = 'button'; close.className = 'sbtn'; close.textContent = '닫기';
      close.addEventListener('click', () => { sideEl.classList.remove('on'); sideEl.dataset.mode = ''; }); sideEl.appendChild(close);
      const ul = document.createElement('ul'); ul.className = 'hist'; sideEl.appendChild(ul);
      if (!list.length) { const li = document.createElement('li'); li.textContent = '아직 저장된 편집 없음'; ul.appendChild(li); }
      list.forEach((c, i) => {
        const li = document.createElement('li');
        const m = document.createElement('div'); m.textContent = c.msg;
        const s = document.createElement('small'); s.textContent = new Date(c.date).toLocaleString('ko-KR') + (i === 0 ? ' · 현재' : '');
        li.append(m, s);
        if (i > 0) {
          const b = document.createElement('button'); b.type = 'button'; b.textContent = '이 버전으로 되돌리기';
          b.addEventListener('click', async () => {
            if (!confirm(`${s.textContent} 버전으로 모든 기믹 편집을 되돌림. 진행?`)) return;
            b.disabled = true; b.textContent = '되돌리는 중…';
            try {
              const txt = await A.get(EDITS_FILE, c.sha);
              const j = txt ? JSON.parse(txt) : {};
              await A.save(EDITS_FILE, JSON.stringify(j, null, 1), `되돌림: ${new Date(c.date).toLocaleString('ko-KR')} 버전`);
              EDITS = j; SAVED = JSON.parse(JSON.stringify(j)); applyAll(); refresh2D(); rebuild();
              setTimeout(showHistory, 600);
            } catch (e) { alert('되돌리기 실패: ' + e.message); b.disabled = false; b.textContent = '이 버전으로 되돌리기'; }
          });
          li.appendChild(b);
        }
        ul.appendChild(li);
      });
      const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'sbtn'; reset.textContent = '모든 편집 지우기 (전부 원래 데이터로)';
      reset.addEventListener('click', async () => {
        if (!confirm('모든 기믹의 편집을 지우고 처음 데이터로 돌림. 진행?')) return;
        try { await A.save(EDITS_FILE, '{}', '모든 기믹 편집 초기화'); EDITS = {}; SAVED = {}; applyAll(); refresh2D(); rebuild(); setTimeout(showHistory, 600); }
        catch (e) { alert('실패: ' + e.message); }
      });
      sideEl.appendChild(reset);
    }

    /* --- 마우스: 클릭 = 롤 강조 / 편집 모드에서 드래그 = 옮기기 --- */
    const hintEl = stage.querySelector('.a3d-hint');
    const HINT = EDIT
      ? '편집 중: 끌어서 옮김 · 부채꼴 장판은 끌면 시전자 기준 회전(Shift+끌기: 이동) · 직선 장판은 Shift+끌기로 회전 · 다 했으면 저장'
      : '드래그: 회전 · 휠/핀치: 확대 · 우클릭/두 손가락: 이동 · 말 클릭: 강조 + 할 일';
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    const ground = new T.Plane(new T.Vector3(0, 1, 0), 0);
    const setRay = e => { const r = renderer.domElement.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); };
    const groundAt = e => { setRay(e); const p = new T.Vector3(); return ray.ray.intersectPlane(ground, p) ? p : null; };
    const entOf = obj => { while (obj) { if (obj.userData && obj.userData.ent) return obj.userData.ent; obj = obj.parent; } return null; };
    let down = null, drag = null;
    const onDown = e => {
      down = [e.clientX, e.clientY];
      if (!EDIT) return;
      setRay(e);
      const hits = ray.intersectObjects([G.units, G.labels, G.guides, G.zones], true);
      for (const h of hits) {
        const ent = entOf(h.object);
        if (!ent || ent.fixed || ent.kind === 'tether') continue;
        const p0 = groundAt(e); if (!p0) break;
        const o = items[ent.idx] || {};
        drag = { ent, p0, home: ent.g.position.clone(), mode: 'move' };
        // 부채꼴: 그냥 끌면 시전 위치(꼭짓점) 기준 회전 / 직선 장판: Shift+끌기로 가운데 기준 회전
        const rotCone = o.z === 'cone' && !e.shiftKey, rotBand = o.z === 'band' && e.shiftKey;
        if (rotCone || rotBand) {
          const piv = rotCone ? at(o) : (() => { const a = xy(o.a), b = xy(o.b); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; })();
          drag.mode = 'rot'; drag.piv = piv; drag.a0 = compass(p0.x - piv[0], p0.z - piv[1]); drag.delta = 0;
        }
        controls.enabled = false; stage.style.cursor = 'grabbing';
        renderer.domElement.setPointerCapture(e.pointerId);
        break;
      }
    };
    const onMove = e => {
      if (!drag) return;
      const p = groundAt(e); if (!p) return;
      if (drag.mode === 'rot') {
        let d = compass(p.x - drag.piv[0], p.z - drag.piv[1]) - drag.a0;
        d = Math.round(((d + 540) % 360 - 180) / 5) * 5; // -180~180, 5도 단위
        drag.delta = d;
        const th = -d * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
        const hx = drag.home.x - drag.piv[0], hz = drag.home.z - drag.piv[1];
        drag.ent.g.position.set(drag.piv[0] + hx * c + hz * sn, drag.home.y, drag.piv[1] - hx * sn + hz * c);
        drag.ent.g.rotation.y = th;
        const o = items[drag.ent.idx];
        hintEl.textContent = o.z === 'cone' ? `방향 ${((o.dir + d) % 360 + 360) % 360}° (${d > 0 ? '+' : ''}${d}°)` : `회전 ${d > 0 ? '+' : ''}${d}°`;
        return;
      }
      drag.ent.g.position.set(drag.home.x + (p.x - drag.p0.x), drag.home.y, drag.home.z + (p.z - drag.p0.z));
    };
    const onUp = e => {
      if (drag) {
        const ent = drag.ent, dx = r1(ent.g.position.x - drag.home.x), dz = r1(ent.g.position.z - drag.home.z);
        const dd = drag;
        drag = null; controls.enabled = true; stage.style.cursor = ''; hintEl.textContent = HINT;
        if (dd.mode === 'rot') { if (dd.delta) commitRotate(ent, dd.delta, dd.piv); }
        else if (Math.abs(dx) + Math.abs(dz) >= 0.5) commitMove(ent, dx, dz);
        return;
      }
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      setRay(e);
      const hit = ray.intersectObjects(G.units.children, true).find(h => h.object.userData.role);
      if (hit) setFocus(hit.object.userData.role);
    };
    // 옮긴 결과를 데이터(EDITS)에 반영하고 다시 그림
    function commitMove(ent, dx, dz) {
      const o = items[ent.idx]; if (!o) return;
      const patch = Object.assign({}, (EDITS[meta.key] || {})[ent.idx]);
      const mv = q => { const v = xy(q); return [r1(v[0] + dx), r1(v[1] + dz)]; };
      if (o.ar) patch.ar = [mv(o.ar[0]), mv(o.ar[1])];
      else if (o.z === 'band') { patch.a = mv(o.a); patch.b = mv(o.b); }
      else if (o.xy || o.at) { const c = at(o); patch.xy = [r1(c[0] + dx), r1(c[1] + dz)]; }
      else return;
      EDITS[meta.key] = Object.assign({}, EDITS[meta.key], { [ent.idx]: patch });
      applyCard(meta.ph, meta.ci); refresh2D(); rebuild();
    }
    function commitRotate(ent, deg, piv) {
      const o = items[ent.idx]; if (!o) return;
      const patch = Object.assign({}, (EDITS[meta.key] || {})[ent.idx]);
      if (o.z === 'cone') patch.dir = ((o.dir + deg) % 360 + 360) % 360;
      else if (o.z === 'band') {
        const th = deg * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
        // 나침반 시계방향 회전: x' = x cos - y sin, y' = x sin + y cos (y 아래가 남쪽)
        const rot = q => { const v = xy(q), x = v[0] - piv[0], y = v[1] - piv[1]; return [r1(piv[0] + x * c - y * sn), r1(piv[1] + x * sn + y * c)]; };
        patch.a = rot(o.a); patch.b = rot(o.b);
      } else return;
      EDITS[meta.key] = Object.assign({}, EDITS[meta.key], { [ent.idx]: patch });
      applyCard(meta.ph, meta.ci); refresh2D(); rebuild();
    }
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);

    /* --- 처음 상태 --- */
    applyFocus();
    if (autoplay) { playing = true; startStep(0); renderStep(0, 0); }
    else { renderStep(LAST, 1); progEl.style.width = '100%'; syncUI(); }
    renderCast(0, 0, false);
    if (camState) { camera.position.copy(camState.pos); controls.target.copy(camState.target); controls.update(); }
    else {
      const [qp, qt] = VIEWS.quarter();
      if (REDUCED) moveCam(qp, qt, true);
      else { camera.position.set(0, 330, 40); controls.target.set(0, 0, 0); controls.update(); moveCam(qp, qt); tween.d = 1100; }
    }
    hintEl.textContent = HINT;

    const ro = new ResizeObserver(() => { renderer.setSize(W(), H(), false); camera.aspect = W() / H(); camera.updateProjectionMatrix(); });
    ro.observe(stage);

    let raf = 0, viewOff = 0;
    const clock = new T.Clock();
    (function loop() {
      raf = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      if (tween) {
        const u = Math.min(1, (performance.now() - tween.s) / tween.d), e = easeO(u);
        camera.position.lerpVectors(tween.p0, tween.p1, e);
        controls.target.lerpVectors(tween.t0, tween.t1, e);
        if (u >= 1) tween = null;
      }
      // 오른쪽 패널(공략 순서·편집 이력)이 열리면 화면을 왼쪽으로 밀어서 안 겹치게
      const wantOff = sideEl.classList.contains('on') && W() > 640 ? (sideEl.offsetWidth + 24) / 2 : 0;
      viewOff += (wantOff - viewOff) * (REDUCED ? 1 : 0.15);
      if (Math.abs(wantOff - viewOff) < 0.5) viewOff = wantOff;
      if (viewOff > 0.5) camera.setViewOffset(W(), H(), viewOff, 0, W(), H()); else if (camera.view && camera.view.enabled) camera.clearViewOffset();
      castEl.style.marginLeft = viewOff ? (-viewOff) + 'px' : '';
      tickPlay(performance.now());
      if (!REDUCED) animators.forEach(f => f(t));
      if (FOCUS && pawns[FOCUS]) { const s = 1 + 0.15 * Math.sin(t * 4); pawns[FOCUS].ring.scale.set(s, s, s); }
      controls.update();
      renderer.render(scene, camera);
    })();
    controls.addEventListener('start', () => { tween = null; });
    void floorDisc;

    return {
      cam: () => ({ pos: camera.position.clone(), target: controls.target.clone() }),
      dispose() {
        cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
        renderer.domElement.removeEventListener('pointerdown', onDown);
        renderer.domElement.removeEventListener('pointermove', onMove);
        renderer.domElement.removeEventListener('pointerup', onUp);
        disposables.forEach(d => d.dispose && d.dispose());
        renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss();
        renderer.domElement.remove();
        castEl.style.display = 'none'; castEl.style.marginLeft = '';
      }
    };
  }

  function teardown() { if (R) { R.dispose(); R = null; } }
})();
