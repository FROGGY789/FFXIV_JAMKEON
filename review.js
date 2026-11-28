/* review.js — 회초리(반성노트)
 *
 * 관리자 전용. 오른쪽 아래 "회초리" 버튼으로 엶.
 * 1) FFLogs API(v2)로 내 캐릭터의 최근 로그 → 전투 목록을 가져옴
 * 2) 전투 하나를 고르면 사망·실수(피해 증가 디버프)·나만 맞은 기술·업타임·순위를 뽑아서 "피드백 요약"을 만듦
 * 3) xivanalysis 결과는 그 전투 주소로 바로 열거나 창 안에서 봄 (xivanalysis 는 결과를 API로 주지 않음)
 * 4) 요약 + 내 메모를 저장소 gh-pages 의 reviews.json 에 저장
 *
 * FFLogs 로그인: fflogs.com/api/clients 에서 클라이언트를 만들고(Redirect URL = 이 사이트 주소)
 *  - Client ID 만 넣으면 PKCE 로그인(비밀 키 없이, 내 계정으로 → 비공개 로그도 됨)
 *  - Client Secret 까지 넣으면 그 키로 바로 토큰(공개 로그만). 키는 이 브라우저(localStorage)에만 저장
 */
(function () {
  'use strict';
  const A = () => window.JamAdmin || { on: false };
  const LS = 'jamkeon.review.cfg', TOK = 'jamkeon.review.tok', PK = 'jamkeon.review.pkce';
  const FILE = 'reviews.json';
  const FF = 'https://www.fflogs.com';
  const SERVERS = [['moogle', '모그리'], ['chocobo', '초코보'], ['carbuncle', '카벙클'], ['tonberry', '톤베리'], ['fenrir', '펜리르']];
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let cfg = lsGet(LS, { id: '', secret: '', name: '', server: 'moogle', region: 'KR' });
  const redirect = () => location.origin + location.pathname;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const JOB = { Paladin: '나이트', Warrior: '전사', DarkKnight: '암흑기사', Gunbreaker: '건브레이커', WhiteMage: '백마도사', Scholar: '학자', Astrologian: '점성술사', Sage: '현자', Monk: '몽크', Dragoon: '용기사', Ninja: '닌자', Samurai: '사무라이', Reaper: '리퍼', Viper: '바이퍼', Bard: '음유시인', Machinist: '기공사', Dancer: '무도가', BlackMage: '흑마도사', Summoner: '소환사', RedMage: '적마도사', Pictomancer: '픽토맨서', BlueMage: '청마도사' };
  const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  /* ---------- FFLogs 인증 ---------- */
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function startPkce() {
    const v = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const ch = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));
    const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
    lsSet(PK, { v, state });
    const q = new URLSearchParams({ client_id: cfg.id, code_challenge: ch, code_challenge_method: 'S256', state, redirect_uri: redirect(), response_type: 'code' });
    location.href = FF + '/oauth/authorize?' + q;
  }
  async function finishPkce(code, state) {
    const pk = lsGet(PK, null); lsSet(PK, null);
    if (!pk || pk.state !== state) throw new Error('로그인 확인값이 맞지 않음. 다시 시도');
    const r = await fetch(FF + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: cfg.id, code_verifier: pk.v, redirect_uri: redirect(), code }) });
    if (!r.ok) throw new Error('FFLogs 토큰 발급 실패 (' + r.status + ')');
    const j = await r.json();
    lsSet(TOK, { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000, user: 1 });
  }
  async function token() {
    const t = lsGet(TOK, null);
    if (t && t.exp > Date.now()) return t;
    if (cfg.id && cfg.secret) {
      const r = await fetch(FF + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + btoa(cfg.id + ':' + cfg.secret) }, body: 'grant_type=client_credentials' });
      if (!r.ok) throw new Error('FFLogs 키 확인 실패 (' + r.status + ')');
      const j = await r.json(); const nt = { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000, user: 0 };
      lsSet(TOK, nt); return nt;
    }
    return null;
  }
  async function gql(query, variables) {
    const t = await token(); if (!t) throw new Error('NEED_LOGIN');
    const r = await fetch(FF + (t.user ? '/api/v2/user' : '/api/v2/client'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t.t }, body: JSON.stringify({ query, variables }) });
    if (r.status === 401) { lsSet(TOK, null); throw new Error('NEED_LOGIN'); }
    const j = await r.json();
    if (j.errors && j.errors.length) throw new Error(j.errors.map(e => e.message).join(' / '));
    return j.data;
  }

  /* ---------- 데이터 ---------- */
  const Q_CHAR = `query($n:String,$s:String,$r:String){characterData{character(name:$n,serverSlug:$s,serverRegion:$r){id name recentReports(limit:40){data{code title startTime zone{name} fights(killType:Encounters){id name kill fightPercentage startTime endTime difficulty encounterID gameZone{id name}}}}}}}`;
  const Q_MINE = `query{userData{currentUser{id}}}`;
  const Q_UREP = `query($u:Int){reportData{reports(userID:$u,limit:40){data{code title startTime zone{name} fights(killType:Encounters){id name kill fightPercentage startTime endTime difficulty encounterID gameZone{id name}}}}}}`;
  const Q_REPORT = `query($c:String){reportData{report(code:$c){code title startTime zone{name} fights(killType:Encounters){id name kill fightPercentage startTime endTime difficulty encounterID gameZone{id name}}}}}`;
  const entries = t => { const d = t && (t.data || t); return (d && (d.entries || d.auras || d.damageTaken)) || []; };

  /* ---------- 저장 ---------- */
  let notes = null;
  async function loadNotes() {
    if (notes) return notes;
    try { const t = await (A().get ? A().get(FILE) : A().read(FILE)); notes = t ? JSON.parse(t) : []; } catch (e) { notes = []; }
    return notes;
  }
  async function saveNote(n) {
    const list = await loadNotes(); const i = list.findIndex(x => x.id === n.id);
    if (i >= 0) list[i] = n; else list.unshift(n);
    await A().save(FILE, JSON.stringify(list, null, 1), '회초리 노트 저장', '회초리 노트 저장됨');
  }

  /* ---------- UI ---------- */
  const css = `
.rv-fab{position:fixed;right:150px;bottom:14px;z-index:50;font:600 12px/1 "Pretendard Variable",Pretendard,system-ui,sans-serif;padding:8px 12px;min-height:34px;border-radius:999px;border:1px solid var(--line,#dddbe2);background:color-mix(in srgb,var(--bg,#f6f5f8) 88%,transparent);color:var(--ink,#16151a);cursor:pointer;backdrop-filter:blur(6px)}
html.rv-on .rm-fab{right:220px}
dialog.rv{width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;border-radius:0;background:var(--bg,#f6f5f8);color:var(--ink,#16151a);font:14px/1.5 "Pretendard Variable",Pretendard,system-ui,sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.3)}
dialog.rv::backdrop{background:rgba(20,18,26,.45)}
.rv-in{display:grid;grid-template-rows:auto 1fr;height:100%}
.rv-hd{display:flex;align-items:center;gap:12px;padding:14px clamp(16px,3vw,40px);border-bottom:1px solid var(--line,#dddbe2)}
.rv-hd h2{margin:0;font-size:19px;font-weight:900;letter-spacing:-.01em}
.rv-hd .tabs{display:flex;gap:4px;margin-left:8px}
.rv button{font:inherit;border:0;border-radius:10px;padding:8px 12px;font-weight:700;cursor:pointer;background:var(--card,#ececef);color:inherit}
.rv button.pri{background:var(--ink,#16151a);color:var(--bg,#f6f5f8)}
.rv button[aria-pressed=true]{background:var(--ink,#16151a);color:var(--bg,#f6f5f8)}
.rv button:disabled{opacity:.5;cursor:default}
.rv a{color:inherit;text-decoration:none}.rv .hint a{text-decoration:underline}
.rv .x{margin-left:auto;width:36px;height:36px;padding:0;font-size:18px}
.rv-bd{overflow:auto;padding:20px clamp(16px,3vw,40px) 60px}
.rv input,.rv select,.rv textarea{font:inherit;padding:9px 11px;border-radius:10px;border:1px solid var(--line,#dddbe2);background:var(--card,#ececef);color:inherit;box-sizing:border-box}
.rv textarea{width:100%;min-height:120px;resize:vertical}
.rv .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.rv label{display:grid;gap:4px;font-size:12.5px;color:var(--sub,#6f6c78);font-weight:700}
.rv .hint{font-size:12.5px;color:var(--sub,#6f6c78);margin:6px 0 0}
.rv .err{color:#c0392b;font-size:13px;margin:8px 0}
.rv .rep{border:1px solid var(--line,#dddbe2);border-radius:14px;padding:12px 14px;margin-bottom:10px;background:color-mix(in srgb,var(--card,#ececef) 50%,transparent)}
.rv .rep h4{margin:0 0 6px;font-size:14.5px}
.rv .rep .meta{font-size:12px;color:var(--sub,#6f6c78)}
.rv .fights{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.rv .fights button{font-size:12.5px;padding:6px 10px;background:var(--bg,#f6f5f8);border:1px solid var(--line,#dddbe2)}
.rv .fights button.kill{border-color:#3fbf7f;color:#1f8a55}
.rv .fights button span{color:var(--sub,#6f6c78);font-weight:500;margin-left:4px}
.rv .tabs2{display:flex;gap:4px}
.rv details.zone summary{display:flex;gap:10px;align-items:baseline;cursor:pointer;list-style:none}
.rv details.zone summary::-webkit-details-marker{display:none}
.rv details.zone summary::before{content:'▸';transition:transform .2s;display:inline-block}
.rv details.zone[open] summary::before{transform:rotate(90deg)}
.rv details.zone h4{margin:0}
.rv .boss{margin-top:10px;padding-top:10px;border-top:1px dashed var(--line,#dddbe2)}
.rv .boss .bh{display:flex;gap:8px;align-items:baseline}
.rv details.byurl{margin-top:14px}.rv details.byurl summary{cursor:pointer}
.rv .stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:12px 0}
.rv .stat{border-radius:14px;padding:12px;background:var(--card,#ececef)}
.rv .stat b{display:block;font-size:22px;font-weight:900;letter-spacing:-.02em}
.rv .stat span{font-size:12px;color:var(--sub,#6f6c78);font-weight:700}
.rv .fb{border-radius:16px;padding:14px 16px;background:#fff3f5;border:1.5px solid #ffb3c0;color:#2a1b20;margin:12px 0}
.rv .fb h3{margin:0 0 8px;font-size:15px;font-weight:900;color:#c8103a}
.rv .fb ul.sv{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.rv .fb li{display:grid;grid-template-columns:auto auto 1fr;gap:8px;align-items:baseline;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.6)}
.rv .fb li i{font-style:normal;font-size:11px;font-weight:800;padding:2px 7px;border-radius:999px;color:#fff;background:#8a8796}
.rv .fb li.s3 i{background:#d6113f}.rv .fb li.s2 i{background:#e58a00}.rv .fb li.s1 i{background:#3f7fd6}
.rv .fb li b{color:#c8103a;white-space:nowrap}
.rv .good{border-radius:16px;padding:12px 16px;background:#effaf3;border:1.5px solid #9fdcb6;color:#163a24;margin:12px 0}
.rv .good h3{margin:0 0 6px;font-size:14px;font-weight:900;color:#1f8a55}
.rv table{width:100%;border-collapse:collapse;font-size:13px}.rv td,.rv th{padding:6px 8px;border-bottom:1px solid var(--line,#dddbe2);text-align:left}
.rv .xa{margin-top:12px;border-radius:14px;overflow:hidden;border:1px solid var(--line,#dddbe2);height:min(70vh,700px)}
.rv .xa iframe{width:100%;height:100%;border:0;background:#fff}
.rv .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.rv .note{border:1px solid var(--line,#dddbe2);border-radius:14px;padding:12px 14px;margin-bottom:10px}
.rv .note .meta{font-size:12px;color:var(--sub,#6f6c78)}
.rv .note p{white-space:pre-wrap;margin:6px 0 0}
@media(prefers-color-scheme:dark){.rv .fb li{background:rgba(0,0,0,.25)}.rv .fb{background:#3a1820;color:#ffe3e8;border-color:#7a2a3a}.rv .fb h3,.rv .fb li b{color:#ff8fa3}.rv .good{background:#16301f;color:#d9f5e3;border-color:#2c6a43}.rv .good h3{color:#7fe0a6}}
`;
  let dlg, bd, tab = 'logs', cur = null;
  function boot() {
    if (!A().on) return;
    document.documentElement.classList.add('rv-on');
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rv-fab'; b.textContent = '회초리';
    b.title = 'FFLogs 기록으로 반성노트'; b.addEventListener('click', () => open());
    document.body.appendChild(b);
    // FFLogs 로그인에서 돌아온 경우
    const q = new URLSearchParams(location.search);
    if (q.get('code') && q.get('state') && lsGet(PK, null)) {
      history.replaceState(null, '', location.pathname + location.hash);
      finishPkce(q.get('code'), q.get('state')).then(() => open('logs')).catch(e => { open('set'); setErr(e.message); });
    }
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => setTimeout(boot, 0)); else setTimeout(boot, 0);

  function open(t) {
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.className = 'rv';
      dlg.innerHTML = `<div class="rv-in"><div class="rv-hd"><h2>회초리</h2><div class="tabs" role="tablist">
        <button type="button" data-t="logs">내 기록</button><button type="button" data-t="notes">반성노트</button><button type="button" data-t="set">설정</button></div>
        <button type="button" class="x" aria-label="닫기">✕</button></div><div class="rv-bd"></div></div>`;
      document.body.appendChild(dlg);
      bd = dlg.querySelector('.rv-bd');
      const shut = () => { if (dlg.open) dlg.close(); };
      dlg.querySelector('.x').addEventListener('click', () => { if (history.state && history.state.rv) history.back(); else shut(); });
      dlg.addEventListener('close', () => { document.documentElement.style.overflow = ''; if (history.state && history.state.rv) history.back(); });
      addEventListener('popstate', () => { if (dlg.open && !(history.state && history.state.rv)) shut(); });
      dlg.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => show(b.dataset.t)));
    }
    if (!dlg.open) { dlg.showModal(); document.documentElement.style.overflow = 'hidden'; try { history.pushState({ rv: 1 }, '', '#회초리'); } catch (e) {} }
    show(t || (cfg.id && cfg.name ? tab : 'set'));
  }
  function setErr(m) { const e = bd && bd.querySelector('.err'); if (e) e.textContent = m; }
  function show(t) {
    tab = t; dlg.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
    if (t === 'set') renderSet(); else if (t === 'notes') renderNotes(); else renderLogs();
  }

  function renderSet() {
    const t = lsGet(TOK, null);
    bd.innerHTML = `<h3 style="margin:0 0 4px">FFLogs 연결</h3>
      <p class="hint">① <a href="${FF}/api/clients" target="_blank" rel="noopener">fflogs.com/api/clients</a> 에서 클라이언트 만들기 · Redirect URL 에 <code>${esc(redirect())}</code> 그대로 넣기<br>
      ② 비공개 로그도 보려면 <b>Public Client</b>(PKCE) 체크 → Client ID 만 넣고 "FFLogs 로그인"<br>
      ③ 공개 로그만이면 Client ID + Secret 을 넣어도 됨(이 브라우저에만 저장)</p>
      <div class="grid" style="margin-top:12px">
        <label>Client ID<input name="id" value="${esc(cfg.id)}" autocomplete="off"></label>
        <label>Client Secret (선택)<input name="secret" type="password" value="${esc(cfg.secret)}" autocomplete="off"></label>
        <label>캐릭터 이름<input name="name" value="${esc(cfg.name)}" placeholder="예: 우연히살았네"></label>
        <label>서버<select name="server">${SERVERS.map(([v, n]) => `<option value="${v}" ${cfg.server === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <div class="row"><button type="button" class="pri save">저장</button><button type="button" class="login">FFLogs 로그인</button><button type="button" class="out">연결 끊기</button>
      <span class="hint">${t && t.exp > Date.now() ? (t.user ? '내 계정으로 연결됨' : '키로 연결됨') : '연결 안 됨'}</span></div>
      <div class="err" aria-live="polite"></div>`;
    const val = n => bd.querySelector(`[name=${n}]`).value.trim();
    const keep = () => { cfg = { id: val('id'), secret: val('secret'), name: val('name'), server: val('server'), region: 'KR' }; lsSet(LS, cfg); };
    bd.querySelector('.save').addEventListener('click', () => { keep(); lsSet(TOK, null); show('logs'); });
    bd.querySelector('.login').addEventListener('click', () => { keep(); if (!cfg.id) { setErr('Client ID 를 넣어야 함'); return; } startPkce(); });
    bd.querySelector('.out').addEventListener('click', () => { lsSet(TOK, null); renderSet(); });
  }

  let view = lsGet('jamkeon.review.view', 'zone'), reps = null;
  async function renderLogs(force) {
    bd.innerHTML = `<div class="row" style="margin:0 0 12px"><div class="tabs2"><button type="button" data-v="zone">던전·레이드별</button><button type="button" data-v="rep">로그별</button></div>
      <button type="button" class="re" style="margin-left:auto">새로고침</button></div>
      <div class="err" aria-live="polite"></div><div class="list"><p class="hint">최근 전투 불러오는 중…</p></div>
      <details class="byurl"><summary class="hint">목록에 없는 로그를 주소로 열기</summary><div class="row"><input class="url" placeholder="https://www.fflogs.com/reports/AbCd1234#fight=5" style="flex:1;min-width:240px"><button type="button" class="go">열기</button></div></details>`;
    bd.querySelectorAll('[data-v]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.v === view)); b.addEventListener('click', () => { view = b.dataset.v; lsSet('jamkeon.review.view', view); renderLogs(); }); });
    bd.querySelector('.re').addEventListener('click', () => renderLogs(true));
    bd.querySelector('.go').addEventListener('click', async () => {
      const u = bd.querySelector('.url').value.trim(); const m = u.match(/reports\/([A-Za-z0-9]+)/) || u.match(/^([A-Za-z0-9]{12,})$/);
      if (!m) { setErr('로그 주소에서 코드를 못 찾음'); return; }
      const f = u.match(/fight=(\d+)/);
      if (f) { openFight(m[1], +f[1]); return; }
      try { const r = (await gql(Q_REPORT, { c: m[1] })).reportData.report; reps = [r].concat((reps || []).filter(x => x.code !== r.code)); draw(); } catch (e) { fail(e); }
    });
    if (reps && !force) { draw(); return; }
    try {
      // 캐릭터의 최근 로그 + (FFLogs 로그인이면) 내가 올린 로그를 합침
      const all = new Map();
      if (cfg.name) {
        const c = (await gql(Q_CHAR, { n: cfg.name, s: cfg.server, r: cfg.region })).characterData.character;
        ((c && c.recentReports && c.recentReports.data) || []).forEach(r => all.set(r.code, r));
        if (!c) setErr(`FFLogs 에서 "${cfg.name}" (${cfg.server}) 캐릭터를 못 찾음. 설정에서 이름·서버 확인.`);
      }
      const t = lsGet(TOK, null);
      if (t && t.user) {
        try { const u = (await gql(Q_MINE)).userData.currentUser; if (u) ((await gql(Q_UREP, { u: u.id })).reportData.reports.data || []).forEach(r => { if (!all.has(r.code)) all.set(r.code, r); }); } catch (e) {}
      }
      reps = [...all.values()].sort((a, b) => b.startTime - a.startTime);
      draw();
    } catch (e) { fail(e); }
  }
  function draw() { if (view === 'rep') drawReports(reps); else drawZones(reps); }
  function fightBtn(r, f) {
    const b = document.createElement('button'); b.type = 'button'; b.className = f.kill ? 'kill' : '';
    b.innerHTML = `<b>${f.kill ? '클리어' : (f.fightPercentage != null ? f.fightPercentage.toFixed(1) + '%' : '와이프')}</b> · ${mmss(f.endTime - f.startTime)} <span>${new Date(r.startTime + f.startTime).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>`;
    b.title = f.name; b.addEventListener('click', () => openFight(r.code, f.id)); return b;
  }
  // 던전·레이드(전투 지역) → 보스 → 트라이
  function drawZones(list) {
    const l = bd.querySelector('.list');
    const zones = new Map();
    (list || []).forEach(r => (r.fights || []).forEach(f => {
      const zn = (f.gameZone && f.gameZone.name) || (r.zone && r.zone.name) || '기타';
      if (!zones.has(zn)) zones.set(zn, { name: zn, last: 0, bosses: new Map() });
      const z = zones.get(zn), at = r.startTime + f.startTime; z.last = Math.max(z.last, at);
      if (!z.bosses.has(f.name)) z.bosses.set(f.name, []);
      z.bosses.get(f.name).push({ r, f, at });
    }));
    if (!zones.size) { l.innerHTML = '<p class="hint">최근 전투 기록 없음. FFLogs 에 로그가 올라가 있는지, 설정의 캐릭터 이름·서버를 확인.</p>'; return; }
    l.innerHTML = '';
    [...zones.values()].sort((a, b) => b.last - a.last).forEach(z => {
      const pulls = [...z.bosses.values()].flat(), kills = pulls.filter(x => x.f.kill).length;
      const d = document.createElement('details'); d.className = 'rep zone';
      if (l.children.length < 2) d.open = true;
      d.innerHTML = `<summary><h4>${esc(z.name)}</h4><span class="meta">전투 ${pulls.length}번 · 클리어 ${kills}번 · 마지막 ${new Date(z.last).toLocaleDateString('ko-KR')}</span></summary>`;
      [...z.bosses.entries()].forEach(([bn, arr]) => {
        arr.sort((a, b) => b.at - a.at);
        const best = arr.some(x => x.f.kill) ? '클리어' : '최고 ' + Math.min(...arr.map(x => x.f.fightPercentage != null ? x.f.fightPercentage : 100)).toFixed(1) + '%';
        const box = document.createElement('div'); box.className = 'boss';
        box.innerHTML = `<div class="bh"><b>${esc(bn)}</b><span class="meta">${arr.length}번 · ${best}</span></div><div class="fights"></div>`;
        const fw = box.querySelector('.fights'); arr.forEach(x => fw.appendChild(fightBtn(x.r, x.f)));
        d.appendChild(box);
      });
      l.appendChild(d);
    });
  }
  function fail(e) {
    if (e.message === 'NEED_LOGIN') { bd.querySelector('.list').innerHTML = '<p class="hint">FFLogs 연결이 필요함 → 설정 탭에서 로그인.</p>'; return; }
    setErr('불러오기 실패: ' + e.message + ' (네트워크나 FFLogs 설정 확인)'); const l = bd.querySelector('.list'); if (l) l.innerHTML = '';
  }
  function drawReports(reps) {
    const l = bd.querySelector('.list');
    if (!reps || !reps.length) { l.innerHTML = '<p class="hint">최근 기록 없음.</p>'; return; }
    l.innerHTML = '';
    reps.forEach(r => {
      const d = document.createElement('div'); d.className = 'rep';
      d.innerHTML = `<h4>${esc(r.title || r.code)}</h4><div class="meta">${new Date(r.startTime).toLocaleString('ko-KR')} · ${esc(r.zone ? r.zone.name : '')} · <a href="${FF}/reports/${esc(r.code)}" target="_blank" rel="noopener">FFLogs</a></div><div class="fights"></div>`;
      const fw = d.querySelector('.fights');
      (r.fights || []).forEach(f => { const b = fightBtn(r, f); b.insertAdjacentText('afterbegin', f.name + ' '); fw.appendChild(b); });
      if (!(r.fights || []).length) fw.innerHTML = '<span class="meta">보스 전투 없음</span>';
      l.appendChild(d);
    });
  }

  function openFight(code, fid) {
    tab = 'fight'; dlg.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    bd.scrollTop = 0;
    window.JamFight.open(bd, { code, fid, gql, cfg, back: () => show('logs'), saveNote, loadNotes });
  }

  async function renderNotes() {
    bd.innerHTML = '<p class="hint">불러오는 중…</p>';
    const list = await loadNotes();
    if (!list.length) { bd.innerHTML = '<p class="hint">아직 저장한 반성노트가 없음. "내 기록"에서 전투를 열고 저장.</p>'; return; }
    bd.innerHTML = '';
    list.forEach(n => {
      const d = document.createElement('div'); d.className = 'note';
      d.innerHTML = `<div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><b>${esc(n.boss)}</b><span class="meta">${n.kill ? '클리어' : (n.pct != null ? Number(n.pct).toFixed(1) + '%' : '와이프')} · ${new Date(n.at).toLocaleString('ko-KR')}${n.job ? ' · ' + esc(n.job) : ''}${n.rank != null ? ' · 순위 ' + Math.round(n.rank) + '%' : ''} · 사망 ${n.deaths || 0}</span>
        <span style="margin-left:auto;display:flex;gap:6px"><button type="button" class="op">열기</button><button type="button" class="del">삭제</button></span></div>
        ${n.fb && n.fb.length ? `<ol style="margin:8px 0 0;padding-left:20px;font-size:13px">${n.fb.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}${n.memo ? `<p>${esc(n.memo)}</p>` : ''}`;
      d.querySelector('.op').addEventListener('click', () => openFight(n.code, n.fid));
      d.querySelector('.del').addEventListener('click', async () => {
        if (!confirm('이 반성노트를 지울까?')) return;
        list.splice(list.indexOf(n), 1); await A().save(FILE, JSON.stringify(list, null, 1), '회초리 노트 삭제', '삭제됨'); renderNotes();
      });
      bd.appendChild(d);
    });
  }
})();
