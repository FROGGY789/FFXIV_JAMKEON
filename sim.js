/* sim.js — 전략 시뮬레이션 (상세 페이지 "전략 시뮬레이션" 탭)
 *
 * - 판 위에 롤·보스·장판(원형/도넛/부채꼴/직선)·화살표·줄·글자·필드 마커를 놓고 끌어서 배치.
 * - 백지에서 시작하거나, 기믹 노트의 특정 기믹을 불러와서 편집.
 * - 저장: 관리자는 저장소 strategies.json(부대 공유), 아니면 이 브라우저에만.
 * - 3D로 보기: arena3d.js 뷰어로 그대로 열림.
 * 그림은 기믹 노트와 같은 draw() 형식(좌표 xy, 필드 반지름 100)을 씀.
 */
(function () {
  'use strict';
  const FILE = 'strategies.json', LKEY = 'jamkeon.sim';
  const ROLES = ['T1', 'T2', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
  const RC = { T: '#2f6fe4', H: '#2e9e55', D: '#d24545' };
  const A = () => window.JamAdmin || { on: false };
  const P = (a, d) => { const r = a * Math.PI / 180; return [+(Math.sin(r) * d).toFixed(1), +(-Math.cos(r) * d).toFixed(1)]; };
  const XY = v => (Array.isArray(v) && v.length === 2 && v.pol ? P(v[0], v[1]) : [+v[0], +v[1]]);
  const r1 = v => Math.round(v * 2) / 2;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  let CLIP = null; // 복사한 안(plan) 또는 항목. 전략·안을 바꿔도 유지
  const blankPlans = () => [0, 1, 2].map(() => ({ items: [], memo: '' }));
  // 예전 형식(items/memo 하나) → 1안
  function upgrade(s) { if (!Array.isArray(s.plans)) { s.plans = blankPlans(); s.plans[0] = { items: s.items || [], memo: s.memo || '' }; } while (s.plans.length < 3) s.plans.push({ items: [], memo: '' }); delete s.items; delete s.memo; return s; }

  // 기믹 데이터 → 편집용(모든 좌표를 xy 로)
  function normalize(items) {
    return items.filter(o => o && typeof o === 'object' && !o.seq).map(o0 => {
      const o = {}; for (const k in o0) o[k] = o0[k];
      if (o.at) { o.xy = P(o.at[0], o.at[1]); delete o.at; }
      if (o.xy) o.xy = XY(o.xy);
      if (o.z === 'band') ['a', 'b'].forEach(k => { if (o[k]) o[k] = XY(o[k]); }); // 보스 이름도 키가 b 라서 직선 장판일 때만
      if (o.ar) o.ar = [XY(o.ar[0]), XY(o.ar[1])];
      if (o.te) o.te = [XY(o.te[0]), XY(o.te[1])];
      if (o.arc) o.arc = Object.assign({}, o.arc);
      delete o.step;
      return clone(o);
    });
  }

  /* ---------- 저장소 ---------- */
  let STORE = null; // { raidId: [ {id,name,memo,items,from,updated} ] }
  async function loadStore() {
    if (STORE) return STORE;
    let j = null;
    try {
      // 저장소에서 바로 읽음 (Pages 반영 1~2분을 안 기다림)
      const t = A().read ? await A().read(FILE) : await fetch(FILE, { cache: 'no-cache' }).then(r => r.ok ? r.text() : null);
      j = t ? JSON.parse(t) : {};
    } catch (e) { j = {}; }
    STORE = j && typeof j === 'object' ? j : {};
    if (!A().on) { try { const l = JSON.parse(localStorage.getItem(LKEY) || '{}'); for (const k in l) STORE[k] = (STORE[k] || []).concat(l[k].map(s => Object.assign(s, { local: 1 }))); } catch (e) {} }
    return STORE;
  }
  let saving = Promise.resolve();
  function persist(raid, list, msg) { const run = () => persistNow(raid, list, msg); saving = saving.then(run, run); return saving; }
  async function persistNow(raid, list, msg) {
    if (A().on) {
      let latest = {};
      try { const t = await A().get(FILE); latest = t ? JSON.parse(t) : {}; } catch (e) {}
      latest[raid] = list.filter(s => !s.local);
      await A().save(FILE, JSON.stringify(latest, null, 1), msg, '전략 저장됨 ✓');
    } else {
      const l = (() => { try { return JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch (e) { return {}; } })();
      l[raid] = list.filter(s => s.local);
      try { localStorage.setItem(LKEY, JSON.stringify(l)); } catch (e) {}
    }
  }

  /* ---------- 스타일 ---------- */
  const css = `
.sim{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,320px);gap:16px;margin-top:22px;align-items:start}
@media(max-width:980px){.sim{grid-template-columns:minmax(0,1fr)}}
.sim .card{background:var(--card,#ececef);border-radius:20px;padding:14px}
.sim .bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px}
.sim .bar select,.sim .bar input{font:inherit;font-size:13px;padding:7px 9px;border-radius:9px;border:1px solid var(--line,#dddbe2);background:var(--bg,#f6f5f8);color:var(--ink,#16151a);min-width:0}
.sim .bar input.nm{flex:1 1 160px}
.sim .plans{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:-2px 0 10px}
.sim .plans .pl{min-width:64px}
.sim .plans .pl[aria-pressed=true]{background:var(--ink,#16151a);color:var(--bg,#f6f5f8);border-color:transparent;outline:none}
.sim .plans .st{font-size:12px;color:var(--sub,#6f6c78);margin-left:auto}
.sim .plans .st.ok{color:#2e9e55}
.sim .pal .wm{color:#fff;border-color:transparent;min-width:34px;font-weight:900}
.sim .pal .wm.sq{border-radius:4px}.sim .pal .wm.ci{border-radius:999px}
.sim button{font:inherit;font-size:12.5px;font-weight:700;border:1px solid var(--line,#dddbe2);background:var(--bg,#f6f5f8);color:inherit;border-radius:9px;padding:7px 10px;cursor:pointer;min-height:34px}
.sim button.pri{background:var(--ink,#16151a);color:var(--bg,#f6f5f8);border-color:transparent}
.sim button.del{color:#c0392b}
.sim button[aria-pressed=true]{outline:2px solid var(--accent,#a597e3);outline-offset:1px}
.sim .board{position:relative;max-width:640px;margin:0 auto;touch-action:none;user-select:none}
.sim .board svg{width:100%;height:auto;display:block;color:var(--ink,#16151a)}
.sim .board .h{cursor:grab}.sim .board .h:hover{stroke-width:2.4}
.sim .pal{display:grid;gap:8px}
.sim .pal .g{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.sim .pal .g>span{font-size:11.5px;color:var(--sub,#6f6c78);width:100%}
.sim .pal .role{color:#fff;border-color:transparent;min-width:40px}
.sim .props{display:grid;gap:7px;font-size:12.5px}
.sim .props label{display:grid;grid-template-columns:70px minmax(0,1fr);align-items:center;gap:6px;color:var(--sub,#6f6c78)}
.sim .props input,.sim .props select{font:inherit;font-size:13px;padding:6px 8px;border-radius:8px;border:1px solid var(--line,#dddbe2);background:var(--bg,#f6f5f8);color:var(--ink,#16151a);width:100%;box-sizing:border-box}
.sim h4{margin:12px 0 6px;font-size:13px}
.sim .note{font-size:12px;color:var(--sub,#6f6c78);line-height:1.5;margin:6px 0 0}
.sim textarea{width:100%;box-sizing:border-box;min-height:60px;font:inherit;font-size:13px;padding:7px 9px;border-radius:9px;border:1px solid var(--line,#dddbe2);background:var(--bg,#f6f5f8);color:var(--ink,#16151a)}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- 마운트: <div id="sim-root" data-raid="uwu"> 가 생기면 ---------- */
  const mo = new MutationObserver(scan);
  function scan() { document.querySelectorAll('#sim-root').forEach(el => { if (el.getAttribute('data-on') !== el.getAttribute('data-raid')) mount(el); }); }
  if (document.body) { mo.observe(document.body, { childList: true, subtree: true }); scan(); }
  else addEventListener('DOMContentLoaded', () => { mo.observe(document.body, { childList: true, subtree: true }); scan(); });

  async function mount(root) {
    const raid = root.getAttribute('data-raid') || 'misc';
    root.setAttribute('data-on', raid);
    const store = await loadStore();
    let list = store[raid] = store[raid] || [];
    const fresh = () => ({ id: null, name: '', memo: '', items: [], from: '', plans: blankPlans() });
    let cur = fresh(), pi = 0;
    let sel = -1, kind = 'bad', dirty = false, autoT = 0;
    // 바뀌면 자동 저장 (이름 붙여 한 번 저장한 전략만)
    function touch() {
      dirty = true; status(cur.id ? '저장 대기…' : '저장 안 됨 · 이름 적고 저장', '');
      if (!cur.id) return;
      clearTimeout(autoT); autoT = setTimeout(() => save(false, true), A().on ? 1800 : 400);
    }
    function status(t, cls) { const e = root.querySelector('.plans .st'); if (e) { e.textContent = t; e.className = 'st ' + (cls || ''); } }
    // 되돌리기 / 다시 하기 (Ctrl+Z, Ctrl+Shift+Z 또는 Ctrl+Y)
    const hist = [], fut = [];
    const snap = () => JSON.stringify(cur.items);
    const record = pre => { hist.push(pre != null ? pre : snap()); if (hist.length > 150) hist.shift(); fut.length = 0; syncUndo(); };
    function undo() { if (!hist.length) return; fut.push(snap()); cur.items = JSON.parse(hist.pop()); sel = -1; touch(); render(); props(); syncUndo(); }
    function redo() { if (!fut.length) return; hist.push(snap()); cur.items = JSON.parse(fut.pop()); sel = -1; touch(); render(); props(); syncUndo(); }
    function syncUndo() { const u = root.querySelector('.undo'), r = root.querySelector('.redo'); if (u) u.disabled = !hist.length; if (r) r.disabled = !fut.length; }

    root.innerHTML = `<div class="sim">
  <div class="card">
    <div class="bar">
      <select class="load" aria-label="불러오기"></select>
      <input class="nm" placeholder="전략 이름" aria-label="전략 이름">
      <button type="button" class="pri save">저장</button>
      <button type="button" class="saveas">다른 이름으로</button>
      <button type="button" class="del rm">삭제</button>
      <button type="button" class="v3d">3D로 보기</button>
      <button type="button" class="undo" title="되돌리기 (Ctrl+Z)" aria-label="되돌리기">↶</button><button type="button" class="redo" title="다시 하기 (Ctrl+Shift+Z)" aria-label="다시 하기">↷</button>
    </div>
    <div class="plans" role="group" aria-label="처리 방식 1~3안">
      <button type="button" class="pl" data-p="0">1안</button><button type="button" class="pl" data-p="1">2안</button><button type="button" class="pl" data-p="2">3안</button>
      <button type="button" class="cp" title="지금 안을 통째로 복사">이 안 복사</button><button type="button" class="ps" title="복사한 안(또는 항목)을 붙여넣기">붙여넣기</button>
      <span class="st" aria-live="polite"></span>
    </div>
    <div class="board" aria-label="전략 판. 손잡이를 끌어서 옮김"></div>
    <p class="note">손잡이를 끌어서 옮김 · 부채꼴은 바깥 점으로 방향·길이 · 원은 테두리 점으로 크기 · Delete 지우기 · Ctrl+Z 되돌리기 · Ctrl+C/V 고른 항목 복사·붙여넣기</p>
    <textarea class="memo" placeholder="메모 (이 전략 설명, 콜 순서 등)" aria-label="메모"></textarea>
  </div>
  <div class="card pal"></div>
</div>`;
    const $ = s => root.querySelector(s);
    const board = $('.board'), pal = $('.pal'), loadSel = $('.load'), nm = $('.nm'), memo = $('.memo');

    /* --- 불러오기 목록 --- */
    function fillLoad() {
      const u = window.UWU;
      let h = `<option value="">＋ 새 전략 (백지)</option>`;
      if (list.length) h += `<optgroup label="저장된 전략">${list.map((s, i) => `<option value="s:${i}">${esc(s.name)}${s.local ? ' (이 브라우저)' : ''}</option>`).join('')}</optgroup>`;
      if (raid === 'uwu' && u && u.PH) u.PH.forEach(ph => { h += `<optgroup label="기믹 불러오기 · ${esc(ph.name)}">${ph.cards.map((c, ci) => `<option value="g:${ph.id}:${ci}">${esc(String(c.h).replace(/<[^>]+>/g, ''))}</option>`).join('')}</optgroup>`; });
      loadSel.innerHTML = h;
      loadSel.value = cur.id != null ? 's:' + list.findIndex(s => s.id === cur.id) : '';
    }
    loadSel.addEventListener('change', () => {
      if (dirty && !confirm('저장 안 한 변경이 있음. 버리고 불러올까?')) { fillLoad(); return; }
      const v = loadSel.value;
      clearTimeout(autoT);
      if (!v) cur = fresh();
      else if (v[0] === 's') { cur = upgrade(clone(list[+v.slice(2)])); }
      else { const [, pid, ci] = v.split(':'); const ph = window.UWU.PH.find(p => p.id === pid), c = ph.cards[+ci];
        cur = fresh(); cur.name = String(c.h).replace(/<[^>]+>/g, '') + ' (편집본)'; cur.from = `${ph.name} · ${String(c.h).replace(/<[^>]+>/g, '')}`; cur.plans[0].items = normalize(c.d); }
      dirty = false; nm.value = cur.name; loadPlan(0); status(cur.id ? '저장된 전략 · 바꾸면 자동 저장' : '', '');
    });
    nm.addEventListener('input', () => { cur.name = nm.value; touch(); });
    /* --- 1~3안 --- */
    function storePlan() { cur.plans[pi] = { items: clone(cur.items), memo: cur.memo || '' }; }
    function loadPlan(i) {
      pi = i; cur.items = clone((cur.plans[i] || {}).items || []); cur.memo = (cur.plans[i] || {}).memo || ''; memo.value = cur.memo;
      sel = -1; hist.length = 0; fut.length = 0; syncUndo(); render(); props(); syncPlans();
    }
    function syncPlans() {
      root.querySelectorAll('.plans .pl').forEach(b => {
        const i = +b.dataset.p, n = i === pi ? cur.items.length : ((cur.plans[i] || {}).items || []).length;
        b.setAttribute('aria-pressed', String(i === pi)); b.textContent = `${i + 1}안${n ? ' · ' + n : ''}`;
      });
      const ps = root.querySelector('.plans .ps'); ps.disabled = !CLIP;
      ps.textContent = CLIP ? (CLIP.type === 'plan' ? `붙여넣기 (${CLIP.label})` : '붙여넣기 (항목)') : '붙여넣기';
    }
    root.querySelectorAll('.plans .pl').forEach(b => b.addEventListener('click', () => { if (+b.dataset.p === pi) return; storePlan(); loadPlan(+b.dataset.p); }));
    root.querySelector('.plans .cp').addEventListener('click', () => { CLIP = { type: 'plan', items: clone(cur.items), memo: cur.memo || '', label: `${pi + 1}안` }; syncPlans(); status(`${pi + 1}안 복사함 · 다른 안에서 붙여넣기`, 'ok'); });
    root.querySelector('.plans .ps').addEventListener('click', paste);
    function paste() {
      if (!CLIP) return;
      if (CLIP.type === 'item') { record(); const o = clone(CLIP.item); nudge(o); cur.items.push(o); sel = cur.items.length - 1; touch(); render(); props(); syncPlans(); return; }
      if (cur.items.length && !confirm(`${pi + 1}안을 ${CLIP.label} 내용으로 바꿀까? (Ctrl+Z로 되돌릴 수 있음)`)) return;
      record(); cur.items = clone(CLIP.items); if (CLIP.memo && !cur.memo) { cur.memo = CLIP.memo; memo.value = cur.memo; }
      sel = -1; touch(); render(); props(); syncPlans();
    }
    // 붙여넣은 항목은 살짝 옆으로
    function nudge(o) { const m = q => [r1(q[0] + 6), r1(q[1] + 6)]; if (o.xy) o.xy = m(o.xy); if (o.a && o.z === 'band') { o.a = m(o.a); o.b = m(o.b); } if (o.ar) o.ar = o.ar.map(m); if (o.te) o.te = o.te.map(m); }
    memo.addEventListener('input', () => { cur.memo = memo.value; touch(); });

    /* --- 저장 --- */
    let warnedLocal = false;
    async function save(asNew, silent) {
      const name = (nm.value || '').trim(); if (!name) { if (!silent) { nm.focus(); alert('전략 이름을 적을 것'); } return; }
      clearTimeout(autoT);
      storePlan();
      cur.name = name; cur.updated = new Date().toISOString();
      const out = () => ({ id: cur.id, name: cur.name, from: cur.from, updated: cur.updated, plans: clone(cur.plans), local: cur.local });
      if (asNew || !cur.id) { cur.id = 's' + Date.now().toString(36); cur.local = A().on ? undefined : 1; list.push(out()); }
      else { const i = list.findIndex(s => s.id === cur.id); if (i >= 0) list[i] = out(); else list.push(out()); }
      status('저장 중…', '');
      try {
        await persist(raid, list, `전략 저장: ${name}`); dirty = false; fillLoad();
        status(A().on ? '저장됨 ✓ · 부대원에게 바로 보임' : '이 브라우저에 저장됨 ✓', 'ok');
        if (!A().on && !silent && !warnedLocal) { warnedLocal = true; alert('이 브라우저에만 저장됨. 관리자로 로그인하면 부대 공유로 저장됨.'); }
      } catch (e) { status('저장 실패', ''); if (!silent) alert('저장 실패: ' + e.message); }
    }
    $('.save').addEventListener('click', () => save(false));
    $('.saveas').addEventListener('click', () => save(true));
    $('.rm').addEventListener('click', async () => {
      if (!cur.id) { cur = fresh(); nm.value = ''; loadPlan(0); return; }
      if (!confirm(`"${cur.name}" 전략을 삭제할까?`)) return;
      list = store[raid] = list.filter(s => s.id !== cur.id);
      try { await persist(raid, list, `전략 삭제: ${cur.name}`); } catch (e) { alert('삭제 실패: ' + e.message); }
      cur = fresh(); nm.value = ''; fillLoad(); loadPlan(0); status('삭제함', '');
    });
    $('.v3d').addEventListener('click', () => {
      if (!window.Arena3D) return;
      window.Arena3D.open(clone(cur.items), {
        title: `${cur.name || '전략 시뮬레이션'} · ${pi + 1}안`, steps: cur.memo ? cur.memo.split('\n').filter(Boolean) : [],
        // 3D에서 편집하면 판에도 바로 반영 (Ctrl+Z 로 되돌리기 가능)
        onEdit: its => { record(); cur.items = clone(its); sel = -1; touch(); render(); props(); }
      });
    });

    /* --- 팔레트 --- */
    // 놓고 나서 이름·글자 칸에 바로 커서 (따로 묻는 창 없이 오른쪽에서 고침)
    const add = (o, focusKey) => {
      record(); cur.items.push(o); sel = cur.items.length - 1; touch(); render(); props();
      if (focusKey) { const i = pal.querySelector(`.props [data-key="${focusKey}"]`); if (i) { i.focus(); i.select && i.select(); } }
    };
    // 새로 놓는 위치: 가운데를 피해 고리 모양으로 흩어 놓음
    const off = () => { const a = Math.random() * 360, d = 25 + Math.random() * 45; return P(a, d).map(r1); };
    function buildPalette() {
      pal.innerHTML = '';
      const g = (label) => { const d = document.createElement('div'); d.className = 'g'; d.innerHTML = `<span>${label}</span>`; pal.appendChild(d); return d; };
      const b = (parent, t, fn, cls, style) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = t; if (cls) x.className = cls; if (style) x.style.cssText = style; x.addEventListener('click', fn); parent.appendChild(x); return x; };
      const gr = g('롤 (누르면 판에 놓임)');
      ROLES.forEach(r => b(gr, r, () => { const ex = cur.items.findIndex(o => o.p === r); if (ex >= 0) { sel = ex; render(); props(); return; } add({ p: r, xy: off() }); }, 'role', `background:${RC[r[0]]}`));
      const gk = g('장판 종류');
      const kinds = [['bad', '위험'], ['safe', '안전'], ['buf', '기믹']];
      const kb = kinds.map(([k, t]) => b(gk, t, () => { kind = k; kb.forEach((x, i) => x.setAttribute('aria-pressed', String(kinds[i][0] === k))); if (sel >= 0 && cur.items[sel].z) { record(); cur.items[sel].k = k; touch(); render(); } }));
      kb[0].setAttribute('aria-pressed', 'true');
      const gz = g('장판');
      b(gz, '● 원형', () => add({ z: 'c', xy: off(), r: 20, k: kind }));
      b(gz, '◎ 도넛', () => add({ z: 'donut', xy: [0, 0], r1: 30, r2: 100, k: kind }));
      b(gz, '◤ 부채꼴', () => add({ z: 'cone', xy: [0, 0], dir: 0, w: 90, len: 90, k: kind }));
      b(gz, '▬ 직선', () => add({ z: 'band', a: [0, -100], b: [0, 100], w: 30, k: kind }));
      const go = g('그 밖');
      b(go, '보스', () => add({ b: '보스', xy: off() }, 'b'));
      b(go, '몬스터', () => add({ b: '몬스터', xy: off(), r: 8, c: '#b0662a' }, 'b'));
      b(go, '애드', () => add({ b: '애드', xy: off(), r: 5.5, c: '#7a5fb0' }, 'b'));
      b(go, '◆ 오브젝트', () => add({ b: '오브젝트', xy: off(), r: 5, c: '#9bbf6a', sh: 'd' }, 'b'));
      b(go, '→ 화살표', () => { const [x, y] = off(); add({ ar: [[x - 20, y], [x + 20, y]] }); });
      b(go, '⇢ 점선 화살표', () => { const [x, y] = off(); add({ ar: [[x - 20, y], [x + 20, y]], dash: 1 }); });
      b(go, '줄(테더)', () => { const [x, y] = off(); add({ te: [[x - 20, y], [x + 20, y]] }); });
      b(go, '글자', () => add({ t: '글자', xy: off() }, 't'));
      b(go, '징표', () => add({ t: '징표', xy: off(), c: '#2e9e55' }));
      const gm = g('필드 마커');
      // 게임과 같은 색: A·1 빨강, B·2 노랑, C·3 파랑, D·4 보라 / 글자는 원, 숫자는 사각. 기본 자리: A북 B동 C남 D서, 1북동 2남동 3남서 4북서
      const WMC = { A: '#e8474d', B: '#f0b92c', C: '#3d8fe0', D: '#a65ee0', 1: '#e8474d', 2: '#f0b92c', 3: '#3d8fe0', 4: '#a65ee0' };
      const WMA = { A: 0, B: 90, C: 180, D: 270, 1: 45, 2: 135, 3: 225, 4: 315 };
      ['A', 'B', 'C', 'D', '1', '2', '3', '4'].forEach(m => b(gm, m, () => { const ex = cur.items.findIndex(o => o.m === m); if (ex >= 0) { sel = ex; render(); props(); return; } add({ m, xy: P(WMA[m], 82) }); }, 'wm ' + (/\d/.test(m) ? 'sq' : 'ci'), `background:${WMC[m]}`));
      const h = document.createElement('h4'); h.textContent = '선택한 항목'; pal.appendChild(h);
      const pp = document.createElement('div'); pp.className = 'props'; pal.appendChild(pp);
      const cl = document.createElement('div'); cl.className = 'g';
      b(cl, '전체 지우기', () => { if (cur.items.length && confirm('판을 모두 지울까? (Ctrl+Z로 되돌릴 수 있음)')) { record(); cur.items = []; sel = -1; touch(); render(); props(); } }, 'del');
      pal.appendChild(cl);
    }

    /* --- 선택 항목 속성 --- */
    function props() {
      const pp = pal.querySelector('.props'); if (!pp) return;
      pp.innerHTML = '';
      const o = cur.items[sel];
      if (!o) { pp.innerHTML = '<p class="note">판에서 손잡이를 누르면 여기서 크기·방향·글자를 고칠 수 있음</p>'; return; }
      const field = (label, key, type, opts) => {
        const l = document.createElement('label'); l.textContent = label;
        let i;
        if (type === 'select') { i = document.createElement('select'); opts.forEach(([v, t]) => { const op = document.createElement('option'); op.value = v; op.textContent = t; i.appendChild(op); }); i.value = o[key] || opts[0][0]; }
        else { i = document.createElement('input'); i.type = type; if (type === 'number') { i.step = 1; Object.assign(i, opts || {}); } i.value = o[key] == null ? '' : o[key]; }
        let rec = false; i.addEventListener('focus', () => { rec = false; });
        i.addEventListener('input', () => { if (!rec) { record(); rec = true; } o[key] = type === 'number' ? +i.value : i.value; if (key === 'dash') o.dash = i.value === '1' ? 1 : undefined; touch(); render(); });
        i.dataset.key = key;
        l.appendChild(i); pp.appendChild(l);
      };
      const name = o.p ? `롤 ${o.p}` : o.b != null ? (o.sh === 'd' ? '오브젝트' : o.r && o.r < 7 ? '애드' : o.r && o.r < 10 ? '몬스터' : '보스') : o.z === 'c' ? '원형 장판' : o.z === 'donut' ? '도넛 장판' : o.z === 'cone' ? '부채꼴 장판' : o.z === 'band' ? '직선 장판' : o.ar ? '화살표' : o.te ? '줄' : o.t ? '글자' : o.m ? '필드 마커' : o.arc ? '원호 화살표' : '항목';
      const t = document.createElement('div'); t.style.cssText = 'font-weight:800;color:var(--ink,#16151a)'; t.textContent = name; pp.appendChild(t);
      if (o.z) field('종류', 'k', 'select', [['bad', '위험'], ['safe', '안전'], ['buf', '기믹']]);
      if (o.z === 'c') field('반지름', 'r', 'number', { min: 2, max: 120 });
      if (o.z === 'donut') { field('안쪽', 'r1', 'number', { min: 0, max: 120 }); field('바깥', 'r2', 'number', { min: 2, max: 140 }); }
      if (o.z === 'cone') { field('방향(°)', 'dir', 'number', { min: 0, max: 359 }); field('각도(°)', 'w', 'number', { min: 5, max: 360 }); field('길이', 'len', 'number', { min: 5, max: 200 }); }
      if (o.z === 'band') field('폭', 'w', 'number', { min: 2, max: 200 });
      if (o.b != null) { field('이름', 'b', 'text'); field('모양', 'sh', 'select', [['', '● 원 (보스·몬스터·애드)'], ['d', '◆ 마름모 (오브젝트)']]); field('크기', 'r', 'number', { min: 3, max: 30 }); field('색', 'c', 'color'); }
      if (o.t != null) { field('글자', 't', 'text'); field('크기', 'fs', 'number', { min: 6, max: 20 }); }
      if (o.ar) field('모양', 'dash', 'select', [['', '실선'], ['1', '점선']]);
      if (o.p) field('롤', 'p', 'select', ROLES.map(r => [r, r]));
      const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = '이 항목 삭제';
      del.addEventListener('click', () => { record(); cur.items.splice(sel, 1); sel = -1; touch(); render(); props(); });
      pp.appendChild(del);
    }

    /* --- 판 그리기 + 손잡이 --- */
    const handlesOf = (o, i) => {
      const H = [];
      if (o.xy && !o.z) H.push({ i, k: 'xy', p: o.xy, r: o.p ? 9 : o.b != null ? (o.r || 11) + 1 : 7 });
      if (o.z === 'c') { H.push({ i, k: 'xy', p: o.xy, r: 5 }); H.push({ i, k: 'r', p: [o.xy[0] + o.r, o.xy[1]], r: 3.5, ring: 1 }); }
      if (o.z === 'donut') { H.push({ i, k: 'xy', p: o.xy, r: 5 }); H.push({ i, k: 'r1', p: [o.xy[0] + o.r1, o.xy[1]], r: 3.5, ring: 1 }); H.push({ i, k: 'r2', p: [o.xy[0] + o.r2, o.xy[1]], r: 3.5, ring: 1 }); }
      if (o.z === 'cone') { H.push({ i, k: 'xy', p: o.xy, r: 5 }); const d = P(o.dir, o.len); H.push({ i, k: 'dir', p: [o.xy[0] + d[0], o.xy[1] + d[1]], r: 4, ring: 1 }); }
      if (o.z === 'band') { H.push({ i, k: 'a', p: o.a, r: 4.5 }); H.push({ i, k: 'b', p: o.b, r: 4.5 }); H.push({ i, k: 'mid', p: [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2], r: 5 }); }
      if (o.ar) { H.push({ i, k: 'ar0', p: o.ar[0], r: 4 }); H.push({ i, k: 'ar1', p: o.ar[1], r: 4 }); }
      if (o.te) { H.push({ i, k: 'te0', p: o.te[0], r: 4 }); H.push({ i, k: 'te1', p: o.te[1], r: 4 }); }
      if (o.arc) { const m = P((o.arc.a1 + o.arc.a2) / 2, o.arc.r); H.push({ i, k: 'sel', p: m, r: 4 }); }
      return H;
    };
    function render() {
      const u = window.UWU;
      if (!u || !u.draw) { board.innerHTML = '<p class="note">불러오는 중…</p>'; setTimeout(render, 200); return; }
      board.innerHTML = u.draw(cur.items);
      const svg = board.querySelector('svg'); if (!svg) return;
      svg.setAttribute('data-a3d', '1'); // 자동 "3D로 보기" 버튼 안 붙게
      const ns = 'http://www.w3.org/2000/svg', g = document.createElementNS(ns, 'g');
      cur.items.forEach((o, i) => handlesOf(o, i).forEach(h => {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', h.p[0]); c.setAttribute('cy', h.p[1]); c.setAttribute('r', h.r);
        c.setAttribute('class', 'h'); c.dataset.i = h.i; c.dataset.k = h.k;
        const on = h.i === sel;
        c.setAttribute('fill', h.ring ? (on ? '#a597e3' : '#fff') : 'transparent');
        c.setAttribute('stroke', on ? '#a597e3' : h.ring ? '#7a7590' : 'rgba(0,0,0,0)');
        c.setAttribute('stroke-width', on ? 2 : 1.2);
        if (on && !h.ring) c.setAttribute('stroke-dasharray', '3 2');
        g.appendChild(c);
      }));
      svg.appendChild(g);
      if (root.querySelector('.plans .pl')) syncPlans();
    }
    let drag = null;
    const svgPt = e => { const svg = board.querySelector('svg'); const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y]; };
    board.addEventListener('pointerdown', e => {
      const h = e.target.closest && e.target.closest('.h');
      if (!h) { if (sel >= 0) { sel = -1; render(); props(); } return; }
      e.preventDefault();
      sel = +h.dataset.i; drag = { k: h.dataset.k, p0: svgPt(e), o0: clone(cur.items[sel]), pre: snap() };
      board.setPointerCapture(e.pointerId); render(); props();
    });
    board.addEventListener('pointermove', e => {
      if (!drag) return;
      const p = svgPt(e), dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1], o = cur.items[sel], o0 = drag.o0;
      const mv = q => [r1(q[0] + dx), r1(q[1] + dy)];
      switch (drag.k) {
        case 'xy': o.xy = mv(o0.xy); break;
        case 'r': o.r = Math.max(2, r1(Math.hypot(p[0] - o.xy[0], p[1] - o.xy[1]))); break;
        case 'r1': o.r1 = Math.max(0, r1(Math.hypot(p[0] - o.xy[0], p[1] - o.xy[1]))); break;
        case 'r2': o.r2 = Math.max(2, r1(Math.hypot(p[0] - o.xy[0], p[1] - o.xy[1]))); break;
        case 'dir': { const vx = p[0] - o.xy[0], vy = p[1] - o.xy[1]; o.dir = Math.round(((Math.atan2(vx, -vy) * 180 / Math.PI) + 360) % 360 / 5) * 5; o.len = Math.max(5, r1(Math.hypot(vx, vy))); break; }
        case 'a': o.a = mv(o0.a); break;
        case 'b': o.b = mv(o0.b); break;
        case 'mid': o.a = mv(o0.a); o.b = mv(o0.b); break;
        case 'ar0': o.ar = [mv(o0.ar[0]), o0.ar[1]]; break;
        case 'ar1': o.ar = [o0.ar[0], mv(o0.ar[1])]; break;
        case 'te0': o.te = [mv(o0.te[0]), o0.te[1]]; break;
        case 'te1': o.te = [o0.te[0], mv(o0.te[1])]; break;
      }
      touch(); render();
    });
    const end = () => { if (drag) { if (snap() !== drag.pre) record(drag.pre); drag = null; props(); } };
    board.addEventListener('pointerup', end); board.addEventListener('pointercancel', end);
    root.addEventListener('keydown', e => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel >= 0 && !e.target.closest('input,textarea,select')) { e.preventDefault(); record(); cur.items.splice(sel, 1); sel = -1; touch(); render(); props(); }
    });
    board.tabIndex = 0;
    root.querySelector('.undo').addEventListener('click', undo);
    root.querySelector('.redo').addEventListener('click', redo);
    const onKey = e => {
      if (!root.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.target.closest && e.target.closest('input, textarea, select, dialog')) return; // 글자 칸은 브라우저 기본 되돌리기
      const k = e.key.toLowerCase();
      if (k === 'c' && sel >= 0) { e.preventDefault(); CLIP = { type: 'item', item: clone(cur.items[sel]) }; syncPlans(); status('항목 복사함 · Ctrl+V 로 붙여넣기', 'ok'); }
      else if (k === 'v' && CLIP) { e.preventDefault(); paste(); }
      else if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    };
    if (root._simKey) document.removeEventListener('keydown', root._simKey); // 같은 자리에 다시 붙을 때 이전 것 제거
    root._simKey = onKey;
    document.addEventListener('keydown', onKey);
    syncUndo();

    buildPalette(); fillLoad(); loadPlan(0);
  }
})();
