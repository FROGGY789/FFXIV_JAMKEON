/* raids.js — 랜딩 카드(절 목록) 관리
 *
 * - 저장소 gh-pages 의 raids.json 에서 카드 목록을 읽어서 화면의 카드 배열(window.JAM_RAIDS)을 바꿈.
 * - 관리자는 오른쪽 아래 "카드 관리"에서 이름·부제·영문·코드·페이즈 수 수정, 순서 변경, 추가, 삭제 가능.
 * - 카드 id 는 사진(raid-<id>)과 트라이 일지의 열쇠라서 한 번 만들면 바뀌지 않음.
 */
(function () {
  'use strict';
  const FILE = 'raids.json';
  // 카드 이름 자동완성: 절 · 영식(영웅) 레이드 · 극 토벌전. [이름, 영문, 코드, 페이즈 수]
  const DUTIES = [
    ['절 바하무트', 'The Unending Coil of Bahamut', 'UCoB', 5], ['절 알테마', "The Weapon's Refrain", 'UWU', 5], ['절 알렉산더', 'The Epic of Alexander', 'TEA', 4],
    ['절 용시전쟁', "Dragonsong's Reprise", 'DSR', 7], ['절 오메가', 'The Omega Protocol', 'TOP', 6], ['절 에덴', 'Futures Rewritten', 'FRU', 5],
    ['알렉산더 기동편 영식', 'Alexander: Gordias (Savage)', 'A1S-A4S', 4], ['알렉산더 율동편 영식', 'Alexander: Midas (Savage)', 'A5S-A8S', 4], ['알렉산더 천동편 영식', 'Alexander: The Creator (Savage)', 'A9S-A12S', 4],
    ['오메가 델타편 영식', 'Omega: Deltascape (Savage)', 'O1S-O4S', 4], ['오메가 시그마편 영식', 'Omega: Sigmascape (Savage)', 'O5S-O8S', 4], ['오메가 알파편 영식', 'Omega: Alphascape (Savage)', 'O9S-O12S', 4],
    ['에덴 각성편 영식', "Eden's Gate (Savage)", 'E1S-E4S', 4], ['에덴 공명편 영식', "Eden's Verse (Savage)", 'E5S-E8S', 4], ['에덴 재생편 영식', "Eden's Promise (Savage)", 'E9S-E12S', 4],
    ['판데모니움 변옥편 영식', 'Pandæmonium: Asphodelos (Savage)', 'P1S-P4S', 4], ['판데모니움 연옥편 영식', 'Pandæmonium: Abyssos (Savage)', 'P5S-P8S', 4], ['판데모니움 천옥편 영식', 'Pandæmonium: Anabaseios (Savage)', 'P9S-P12S', 4],
    ['아르카디아 라이트헤비급 영식', 'AAC Light-heavyweight (Savage)', 'M1S-M4S', 4], ['아르카디아 크루저급 영식', 'AAC Cruiserweight (Savage)', 'M5S-M8S', 4], ['아르카디아 헤비급 영식', 'AAC Heavyweight (Savage)', 'M9S-M12S', 4],
    ['극 스사노오', 'The Pool of Tribute (Extreme)', 'EX', 2], ['극 락슈미', 'Emanation (Extreme)', 'EX', 2], ['극 신룡', 'The Minstrel\'s Ballad: Shinryu\'s Domain', 'EX', 3], ['극 백호', 'The Jade Stoa (Extreme)', 'EX', 2],
    ['극 츠쿠요미', 'The Minstrel\'s Ballad: Tsukuyomi\'s Pain', 'EX', 2], ['극 주작', 'Hells\' Kier (Extreme)', 'EX', 2], ['극 청룡', 'The Wreath of Snakes (Extreme)', 'EX', 2],
    ['극 티타니아', 'The Dancing Plague (Extreme)', 'EX', 2], ['극 이노센스', 'The Crown of the Immaculate (Extreme)', 'EX', 2], ['극 하데스', 'The Minstrel\'s Ballad: Hades\'s Elegy', 'EX', 2],
    ['극 루비 웨폰', 'Cinder Drift (Extreme)', 'EX', 2], ['극 바르바리시아? (ShB 워리어 오브 라이트)', 'The Seat of Sacrifice (Extreme)', 'EX', 2], ['극 에메랄드 웨폰', 'Castrum Marinum (Extreme)', 'EX', 2], ['극 다이아몬드 웨폰', 'The Cloud Deck (Extreme)', 'EX', 2],
    ['극 조디아크', 'The Minstrel\'s Ballad: Zodiark\'s Fall', 'EX', 2], ['극 하이델린', 'The Minstrel\'s Ballad: Hydaelyn\'s Call', 'EX', 2], ['극 종언을 노래하는 자', 'The Minstrel\'s Ballad: Endsinger\'s Aria', 'EX', 2],
    ['극 바르바리시아', 'Storm\'s Crown (Extreme)', 'EX', 2], ['극 루비칸테', 'Mount Ordeals (Extreme)', 'EX', 2], ['극 골베자', 'The Voidcast Dais (Extreme)', 'EX', 2], ['극 제로무스', 'The Abyssal Fracture (Extreme)', 'EX', 2],
    ['극 발리가르만다', 'Worqor Lar Dor (Extreme)', 'EX', 2], ['극 졸랄 자', 'Everkeep (Extreme)', 'EX', 2], ['극 스페네', 'The Minstrel\'s Ballad: Sphene\'s Burden', 'EX', 2], ['극 네크론', 'The Minstrel\'s Ballad: Necron\'s Embrace', 'EX', 2]
  ].filter(d => !/\?/.test(d[0]));
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
.rm .row{display:grid;grid-template-columns:52px minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.4fr) 80px 64px auto;gap:6px;align-items:end;background:var(--card,#ececef);border-radius:12px;padding:8px 10px}
.rm .row .no{font:700 12px 'JetBrains Mono',monospace;color:var(--sub,#6f6c78);align-self:center;cursor:grab;user-select:none;display:flex;gap:4px;align-items:center}
.rm .row .no::before{content:'⠿';font-size:16px;line-height:1;color:var(--sub,#6f6c78)}
.rm .row.drag{opacity:.4}
.rm .row.over-top{box-shadow:inset 0 3px 0 #a597e3}.rm .row.over-bot{box-shadow:inset 0 -3px 0 #a597e3}
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
<div class="list"></div><datalist id="rm-duties"></datalist>
<div class="ft"><button type="button" class="add">＋ 카드 추가</button><span class="err" aria-live="polite"></span><span><button type="button" class="cancel">취소</button> <button type="submit" class="pri">저장</button></span></div></form>`;
    document.body.appendChild(d);
    const list = d.querySelector('.list'), err = d.querySelector('.err');
    const dl = d.querySelector('#rm-duties');
    DUTIES.forEach(([n, en, code]) => { const o = document.createElement('option'); o.value = n; o.label = `${en} · ${code}`; dl.appendChild(o); });
    const field = (r, k, label, ph, type) => {
      const l = document.createElement('label'); l.textContent = label;
      const i = document.createElement('input'); i.value = r[k] == null ? '' : r[k]; if (ph) i.placeholder = ph; if (type) { i.type = type; i.min = 1; i.max = 12; }
      i.setAttribute('aria-label', label); i.dataset.k = k;
      i.addEventListener('input', () => {
        r[k] = i.value;
        // 이름을 목록에서 고르면 영문·코드·페이즈 수도 채움
        if (k === 'name') { const m = DUTIES.find(x => x[0] === i.value.trim()); if (m) { r.en = m[1]; r.code = m[2]; r.n = m[3]; const row = i.closest('.row'); row.querySelector('[data-k=en]').value = m[1]; row.querySelector('[data-k=code]').value = m[2]; row.querySelector('[data-k=n]').value = m[3]; } }
      });
      if (k === 'name') { i.setAttribute('list', 'rm-duties'); i.placeholder = '이름 (극·영식·절 치면 목록)'; }
      l.appendChild(i); return l;
    };
    let dragFrom = -1;
    function render() {
      list.innerHTML = '';
      rows.forEach((r, i) => {
        const row = document.createElement('div'); row.className = 'row';
        // 왼쪽 ⠿ 손잡이를 끌어서 순서 바꾸기
        row.addEventListener('dragstart', e => { if (!e.target.classList || !e.target.classList.contains('row')) return; dragFrom = i; row.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); });
        row.addEventListener('dragend', () => { row.draggable = false; row.classList.remove('drag'); list.querySelectorAll('.over-top,.over-bot').forEach(x => x.classList.remove('over-top', 'over-bot')); });
        row.addEventListener('dragover', e => { if (dragFrom < 0) return; e.preventDefault(); const r2 = row.getBoundingClientRect(), top = e.clientY < r2.top + r2.height / 2; row.classList.toggle('over-top', top); row.classList.toggle('over-bot', !top); });
        row.addEventListener('dragleave', () => row.classList.remove('over-top', 'over-bot'));
        row.addEventListener('drop', e => {
          e.preventDefault(); if (dragFrom < 0) return;
          const r2 = row.getBoundingClientRect(); let to = e.clientY < r2.top + r2.height / 2 ? i : i + 1;
          const [m] = rows.splice(dragFrom, 1); if (dragFrom < to) to--; rows.splice(to, 0, m); dragFrom = -1; render();
        });
        const no = document.createElement('span'); no.className = 'no'; no.textContent = '#' + String(i + 1).padStart(2, '0'); no.title = '끌어서 순서 바꾸기';
        no.addEventListener('pointerdown', () => { row.draggable = true; });
        row.append(no, field(r, 'name', '이름', '절 OOO'), field(r, 'tag', '부제 (선택)', '상세 페이지 둘째 줄'), field(r, 'en', '영문', 'English name'), field(r, 'code', '코드', 'UWU'), field(r, 'n', '페이즈', '', 'number'));
        const ops = document.createElement('div'); ops.className = 'ops';
        const mk = (t, title, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = title; b.setAttribute('aria-label', title); if (cls) b.className = cls; b.addEventListener('click', fn); return b; };
        ops.append(
          mk('⤒', '맨 위로', () => { if (i > 0) { rows.unshift(rows.splice(i, 1)[0]); render(); } }),
          mk('↑', '위로', () => { if (i > 0) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; render(); } }),
          mk('↓', '아래로', () => { if (i < rows.length - 1) { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; render(); } }),
          mk('⤓', '맨 아래로', () => { if (i < rows.length - 1) { rows.push(rows.splice(i, 1)[0]); render(); } }),
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
