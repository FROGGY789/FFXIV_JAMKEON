/* raids.js — 랜딩 카드(절 목록) 관리
 *
 * - 저장소 gh-pages 의 raids.json 에서 카드 목록을 읽어서 화면의 카드 배열(window.JAM_RAIDS)을 바꿈.
 * - 관리자는 오른쪽 아래 "카드 관리"에서 이름·부제·영문·코드·페이즈 수 수정, 순서 변경, 추가, 삭제 가능.
 * - 카드 id 는 사진(raid-<id>)과 트라이 일지의 열쇠라서 한 번 만들면 바뀌지 않음.
 */
(function () {
  'use strict';
  const FILE = 'raids.json';
  const A = () => window.JamAdmin || { on: false };
  const fire = () => dispatchEvent(new Event('jam-raids'));
  const clean = list => list.map((r, i) => ({
    id: String(r.id), no: String(i + 1).padStart(2, '0'), code: String(r.code || '').trim(), name: String(r.name || '').trim() || '이름 없음',
    tag: String(r.tag || '').trim() || undefined, en: String(r.en || '').trim(), ph: String(r.name || '').trim() + ' 사진', n: Math.max(1, Math.min(12, +r.n || 5))
  }));
  function apply(list) {
    const R = window.JAM_RAIDS; if (!R || !Array.isArray(list) || !list.length) return;
    R.length = 0; clean(list).forEach(r => R.push(r)); fire();
  }

  async function load() {
    let txt = null;
    try {
      if (A().on && A().get) txt = await A().get(FILE);
      else { const r = await fetch(FILE, { cache: 'no-cache' }); if (r.ok) txt = await r.text(); }
    } catch (e) {}
    if (!txt) return;
    try { apply(JSON.parse(txt)); } catch (e) {}
  }
  (function wait(n) { if (window.JAM_RAIDS) load(); else if (n < 150) setTimeout(() => wait(n + 1), 100); })(0);

  /* ---------- 관리 창 ---------- */
  const css = `
.rm-fab{position:fixed;right:150px;bottom:14px;z-index:50;font:600 12px/1 "Pretendard Variable",Pretendard,system-ui,sans-serif;padding:8px 12px;min-height:34px;border-radius:999px;border:1px solid var(--line,#dddbe2);background:color-mix(in srgb,var(--bg,#f6f5f8) 88%,transparent);color:var(--ink,#16151a);cursor:pointer;backdrop-filter:blur(6px)}
dialog.rm{border:0;border-radius:18px;padding:0;width:min(980px,calc(100vw - 24px));max-height:calc(100dvh - 24px);background:var(--bg,#f6f5f8);color:var(--ink,#16151a);font:14px/1.5 "Pretendard Variable",Pretendard,system-ui,sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.3)}
dialog.rm::backdrop{background:rgba(10,12,20,.45)}
.rm form{display:grid;grid-template-rows:auto minmax(0,1fr) auto;max-height:calc(100dvh - 24px)}
.rm .hd{padding:16px 18px 10px}.rm h2{margin:0;font-size:18px;font-weight:800}.rm .hd p{margin:4px 0 0;font-size:12.5px;color:var(--sub,#6f6c78)}
.rm .list{overflow:auto;padding:4px 18px 10px;display:grid;gap:8px}
.rm .row{display:grid;grid-template-columns:34px minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.4fr) 80px 64px auto;gap:6px;align-items:end;background:var(--card,#ececef);border-radius:12px;padding:8px 10px}
.rm .row .no{font:700 12px 'JetBrains Mono',monospace;color:var(--sub,#6f6c78);align-self:center}
.rm label{display:grid;gap:2px;font-size:11px;color:var(--sub,#6f6c78)}
.rm input{width:100%;box-sizing:border-box;padding:7px 8px;border-radius:8px;border:1px solid var(--line,#dddbe2);background:var(--bg,#f6f5f8);color:var(--ink,#16151a);font:inherit;font-size:13px}
.rm .ops{display:flex;gap:4px}
.rm button{font:inherit;font-size:12.5px;font-weight:700;border:1px solid var(--line,#dddbe2);background:transparent;color:inherit;border-radius:8px;padding:6px 9px;cursor:pointer}
.rm button.del{color:#c0392b;border-color:color-mix(in srgb,#c0392b 40%,transparent)}
.rm button.pri{background:var(--ink,#16151a);color:var(--bg,#f6f5f8);border-color:transparent;padding:9px 14px}
.rm .ft{display:flex;gap:8px;justify-content:space-between;align-items:center;padding:12px 18px;border-top:1px solid var(--line,#dddbe2)}
.rm .err{color:#c0392b;font-size:12.5px}
@media(max-width:760px){.rm .row{grid-template-columns:28px 1fr 1fr}.rm .row .ops{grid-column:1/-1;justify-content:flex-end}}
`;
  function boot() {
    if (!A().on) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rm-fab'; b.textContent = '카드 관리';
    b.title = '랜딩 카드 이름 수정 · 추가 · 삭제 · 순서';
    b.addEventListener('click', openManager);
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => setTimeout(boot, 0)); else setTimeout(boot, 0);

  function openManager() {
    const R = window.JAM_RAIDS; if (!R) { alert('아직 불러오는 중. 잠시 후 다시'); return; }
    let rows = R.map(r => Object.assign({}, r));
    const d = document.createElement('dialog'); d.className = 'rm';
    d.innerHTML = `<form method="dialog"><div class="hd"><h2>카드 관리</h2><p>이름·부제·영문·코드를 고치고, 순서를 바꾸거나 추가·삭제할 수 있음. 저장하면 모두에게 반영(1~2분). 카드를 지워도 그 카드의 사진·일지 기록은 저장소에 남아 있음.</p></div>
<div class="list"></div>
<div class="ft"><button type="button" class="add">＋ 카드 추가</button><span class="err" aria-live="polite"></span><span><button type="button" class="cancel">취소</button> <button type="submit" class="pri">저장</button></span></div></form>`;
    document.body.appendChild(d);
    const list = d.querySelector('.list'), err = d.querySelector('.err');
    const field = (r, k, label, ph, type) => {
      const l = document.createElement('label'); l.textContent = label;
      const i = document.createElement('input'); i.value = r[k] == null ? '' : r[k]; if (ph) i.placeholder = ph; if (type) { i.type = type; i.min = 1; i.max = 12; }
      i.setAttribute('aria-label', label); i.addEventListener('input', () => { r[k] = i.value; });
      l.appendChild(i); return l;
    };
    function render() {
      list.innerHTML = '';
      rows.forEach((r, i) => {
        const row = document.createElement('div'); row.className = 'row';
        const no = document.createElement('span'); no.className = 'no'; no.textContent = '#' + String(i + 1).padStart(2, '0');
        row.append(no, field(r, 'name', '이름', '절 OOO'), field(r, 'tag', '부제 (선택)', '상세 페이지 둘째 줄'), field(r, 'en', '영문', 'English name'), field(r, 'code', '코드', 'UWU'), field(r, 'n', '페이즈', '', 'number'));
        const ops = document.createElement('div'); ops.className = 'ops';
        const mk = (t, title, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = title; b.setAttribute('aria-label', title); if (cls) b.className = cls; b.addEventListener('click', fn); return b; };
        ops.append(
          mk('↑', '위로', () => { if (i > 0) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; render(); } }),
          mk('↓', '아래로', () => { if (i < rows.length - 1) { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; render(); } }),
          mk('삭제', '이 카드 삭제', () => {
            const extra = r.id === 'uwu' ? '\n(절테마 기믹 노트가 연결된 카드임)' : '';
            if (confirm(`"${r.name}" 카드를 지울까?${extra}`)) { rows.splice(i, 1); render(); }
          }, 'del'));
        row.appendChild(ops);
        list.appendChild(row);
      });
    }
    render();
    d.querySelector('.add').addEventListener('click', () => {
      rows.push({ id: 'r' + Date.now().toString(36), code: '', name: '', en: '', n: 5 });
      render(); const last = list.lastElementChild; last && last.querySelector('input').focus();
    });
    d.querySelector('.cancel').addEventListener('click', () => d.close());
    d.addEventListener('close', () => d.remove());
    d.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      if (!rows.length) { err.textContent = '카드가 하나는 있어야 함'; return; }
      if (rows.some(r => !String(r.name || '').trim())) { err.textContent = '이름이 빈 카드가 있음'; return; }
      const out = clean(rows);
      const btn = d.querySelector('.pri'); btn.disabled = true; err.textContent = '저장 중…';
      try {
        await A().save(FILE, JSON.stringify(out, null, 1), '카드 목록 수정');
        apply(out); d.close();
      } catch (ex) { err.textContent = '저장 실패: ' + ex.message; btn.disabled = false; }
    });
    d.showModal();
  }
})();
