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
  const Q_CHAR = `query($n:String,$s:String,$r:String){characterData{character(name:$n,serverSlug:$s,serverRegion:$r){id name recentReports(limit:15){data{code title startTime zone{name} fights(killType:Encounters){id name kill fightPercentage startTime endTime difficulty}}}}}}`;
  const Q_REPORT = `query($c:String){reportData{report(code:$c){code title startTime zone{name} fights(killType:Encounters){id name kill fightPercentage startTime endTime difficulty}}}}`;
  const Q_FIGHT = `query($c:String,$f:[Int]){reportData{report(code:$c){code title startTime masterData{actors(type:"Player"){id name server subType}}
    fights(fightIDs:$f){id name kill fightPercentage startTime endTime}
    dmg:table(fightIDs:$f,dataType:DamageDone) deaths:table(fightIDs:$f,dataType:Deaths) taken:table(fightIDs:$f,dataType:DamageTaken,viewBy:Ability)
    rankings(fightIDs:$f)}}}`;
  const Q_ME = `query($c:String,$f:[Int],$me:Int){reportData{report(code:$c){
    takenMe:table(fightIDs:$f,dataType:DamageTaken,viewBy:Ability,sourceID:$me) debuffMe:table(fightIDs:$f,dataType:Debuffs,hostilityType:Friendlies,sourceID:$me)}}}`;
  const entries = t => { const d = t && (t.data || t); return (d && (d.entries || d.auras || d.damageTaken)) || []; };

  async function analyze(code, fid) {
    const d = (await gql(Q_FIGHT, { c: code, f: [fid] })).reportData.report;
    const fight = d.fights[0], dur = fight.endTime - fight.startTime;
    const actors = (d.masterData && d.masterData.actors) || [];
    const lc = s => String(s || '').trim().toLowerCase();
    const me = actors.find(a => lc(a.name) === lc(cfg.name)) || null;
    const res = { code, fid, title: d.title, date: d.startTime, fight, dur, me, actors, fb: [], good: [] };
    if (!me) { res.fb.push(['이름 확인', `이 전투에 "${cfg.name}" 캐릭터가 없음. 설정의 캐릭터 이름을 확인.`]); return res; }
    const m = (await gql(Q_ME, { c: code, f: [fid], me: me.id })).reportData.report;
    // 업타임 · 딜
    const dd = entries(d.dmg).find(e => e.id === me.id || lc(e.name) === lc(me.name));
    const total = (d.dmg && d.dmg.data && d.dmg.data.totalTime) || dur;
    res.job = JOB[me.subType] || me.subType || (dd && dd.type) || '';
    if (dd) { res.dps = dd.total / (total / 1000); res.uptime = dd.activeTime != null ? dd.activeTime / total : null; }
    // 순위
    try {
      const rk = d.rankings && (d.rankings.data || d.rankings);
      const f0 = Array.isArray(rk) ? rk[0] : null;
      if (f0 && f0.roles) Object.values(f0.roles).forEach(role => (role.characters || []).forEach(c => { if (lc(c.name) === lc(me.name)) { res.rank = c.rankPercent; res.rdps = c.amount; } }));
    } catch (e) {}
    // 사망
    res.deaths = entries(d.deaths).filter(e => e.id === me.id || lc(e.name) === lc(me.name)).map(e => ({ t: (e.timestamp || 0) - fight.startTime, by: (e.killingBlow && e.killingBlow.name) || (e.ability && e.ability.name) || '알 수 없음' }));
    res.partyDeaths = entries(d.deaths).length;
    // 실수 디버프
    const VULN = /(받는\s*피해(량)?\s*증가|주는\s*피해(량)?\s*감소|Vulnerability Up|Damage Down|피해 증가|Doom|선고)/i;
    res.vulns = entries(m.debuffMe).filter(a => VULN.test(a.name || '')).map(a => ({ name: a.name, n: a.totalUses || a.totalUptime && 1 || 1 }));
    // 나만(또는 거의 나만) 맞은 기술 = 피할 수 있었던 공격일 가능성
    const party = new Map(entries(d.taken).map(e => [e.name, e.hitCount || 0]));
    const mine = entries(m.takenMe).map(e => ({ name: e.name, hits: e.hitCount || 0, total: e.total || 0, party: party.get(e.name) || 0 }));
    res.topTaken = mine.slice().sort((a, b) => b.total - a.total).slice(0, 5);
    res.onlyMe = mine.filter(e => e.hits > 0 && e.party > 0 && e.party <= e.hits + 1 && !/공격|attack/i.test(e.name));
    // ---- 피드백 요약 ----
    res.deaths.forEach(x => res.fb.push(['사망', `${mmss(x.t)}에 「${x.by}」로 사망. 그 기믹 카드의 내 롤 위치를 다시 확인.`]));
    res.onlyMe.slice(0, 4).forEach(x => res.fb.push(['피할 수 있던 공격', `「${x.name}」을 ${x.hits}번 맞음(파티 전체 ${x.party}번). 혼자 맞은 공격은 대부분 위치·타이밍 실수.`]));
    res.vulns.forEach(x => res.fb.push(['실수 디버프', `「${x.name}」 ${x.n}번. 기믹 실패로 붙는 디버프라 원인 기믹을 찾아볼 것.`]));
    if (res.uptime != null) {
      if (res.uptime < 0.9) res.fb.push(['업타임', `공격한 시간이 전투의 ${(res.uptime * 100).toFixed(1)}%. 이동하면서도 쓸 수 있는 기술로 GCD를 이어 가기(목표 95% 이상).`]);
      else res.good.push(`업타임 ${(res.uptime * 100).toFixed(1)}% — 공격을 잘 이어 감.`);
    }
    if (res.rank != null) {
      if (res.rank < 25) res.fb.push(['딜', `순위 ${Math.round(res.rank)}%. 시너지 타이밍·버스트 정렬을 xivanalysis 에서 확인.`]);
      else if (res.rank >= 75) res.good.push(`순위 ${Math.round(res.rank)}% — 상위권.`);
    }
    if (!res.deaths.length) res.good.push('사망 없음.');
    if (!res.onlyMe.length && !res.vulns.length) res.good.push('혼자 맞은 공격·실수 디버프 없음.');
    if (!fight.kill && fight.fightPercentage != null) res.fb.unshift(['결과', `와이프 · 보스 ${(fight.fightPercentage).toFixed(1)}% 남음. ${res.partyDeaths ? `파티 사망 ${res.partyDeaths}번.` : ''}`]);
    return res;
  }

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
dialog.rv{width:min(1100px,calc(100vw - 24px));height:min(860px,calc(100vh - 24px));padding:0;border:0;border-radius:20px;background:var(--bg,#f6f5f8);color:var(--ink,#16151a);font:14px/1.5 "Pretendard Variable",Pretendard,system-ui,sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.3)}
dialog.rv::backdrop{background:rgba(20,18,26,.45)}
.rv-in{display:grid;grid-template-rows:auto 1fr;height:100%}
.rv-hd{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line,#dddbe2)}
.rv-hd h2{margin:0;font-size:19px;font-weight:900;letter-spacing:-.01em}
.rv-hd .tabs{display:flex;gap:4px;margin-left:8px}
.rv button{font:inherit;border:0;border-radius:10px;padding:8px 12px;font-weight:700;cursor:pointer;background:var(--card,#ececef);color:inherit}
.rv button.pri{background:var(--ink,#16151a);color:var(--bg,#f6f5f8)}
.rv button[aria-pressed=true]{background:var(--ink,#16151a);color:var(--bg,#f6f5f8)}
.rv button:disabled{opacity:.5;cursor:default}
.rv a{color:inherit;text-decoration:none}.rv .hint a{text-decoration:underline}
.rv .x{margin-left:auto;width:36px;height:36px;padding:0;font-size:18px}
.rv-bd{overflow:auto;padding:18px 20px}
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
.rv .stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:12px 0}
.rv .stat{border-radius:14px;padding:12px;background:var(--card,#ececef)}
.rv .stat b{display:block;font-size:22px;font-weight:900;letter-spacing:-.02em}
.rv .stat span{font-size:12px;color:var(--sub,#6f6c78);font-weight:700}
.rv .fb{border-radius:16px;padding:14px 16px;background:#fff3f5;border:1.5px solid #ffb3c0;color:#2a1b20;margin:12px 0}
.rv .fb h3{margin:0 0 8px;font-size:15px;font-weight:900;color:#c8103a}
.rv .fb ol{margin:0;padding-left:20px}.rv .fb li{margin:4px 0}.rv .fb li b{color:#c8103a;margin-right:6px}
.rv .good{border-radius:16px;padding:12px 16px;background:#effaf3;border:1.5px solid #9fdcb6;color:#163a24;margin:12px 0}
.rv .good h3{margin:0 0 6px;font-size:14px;font-weight:900;color:#1f8a55}
.rv table{width:100%;border-collapse:collapse;font-size:13px}.rv td,.rv th{padding:6px 8px;border-bottom:1px solid var(--line,#dddbe2);text-align:left}
.rv .xa{margin-top:12px;border-radius:14px;overflow:hidden;border:1px solid var(--line,#dddbe2);height:min(70vh,700px)}
.rv .xa iframe{width:100%;height:100%;border:0;background:#fff}
.rv .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.rv .note{border:1px solid var(--line,#dddbe2);border-radius:14px;padding:12px 14px;margin-bottom:10px}
.rv .note .meta{font-size:12px;color:var(--sub,#6f6c78)}
.rv .note p{white-space:pre-wrap;margin:6px 0 0}
@media(prefers-color-scheme:dark){.rv .fb{background:#3a1820;color:#ffe3e8;border-color:#7a2a3a}.rv .fb h3,.rv .fb li b{color:#ff8fa3}.rv .good{background:#16301f;color:#d9f5e3;border-color:#2c6a43}.rv .good h3{color:#7fe0a6}}
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
      dlg.querySelector('.x').addEventListener('click', () => dlg.close());
      dlg.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => show(b.dataset.t)));
    }
    if (!dlg.open) dlg.showModal();
    show(t || (cfg.id && cfg.name ? tab : 'set'));
  }
  function setErr(m) { const e = bd && bd.querySelector('.err'); if (e) e.textContent = m; }
  function show(t) {
    tab = t; dlg.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
    if (t === 'set') renderSet(); else if (t === 'notes') renderNotes(); else if (t === 'fight') renderFight(); else renderLogs();
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

  async function renderLogs() {
    bd.innerHTML = `<div class="row" style="margin:0 0 12px"><input class="url" placeholder="FFLogs 로그 주소 붙여넣기 (예: https://www.fflogs.com/reports/AbCd1234#fight=5)" style="flex:1;min-width:240px"><button type="button" class="go">열기</button><button type="button" class="re">새로고침</button></div>
      <div class="err" aria-live="polite"></div><div class="list"><p class="hint">불러오는 중…</p></div>`;
    bd.querySelector('.re').addEventListener('click', renderLogs);
    bd.querySelector('.go').addEventListener('click', async () => {
      const u = bd.querySelector('.url').value.trim(); const m = u.match(/reports\/([A-Za-z0-9]+)/) || u.match(/^([A-Za-z0-9]{12,})$/);
      if (!m) { setErr('로그 주소에서 코드를 못 찾음'); return; }
      const f = u.match(/fight=(\d+)/);
      if (f && f[1] !== 'last') { openFight(m[1], +f[1]); return; }
      try { const r = (await gql(Q_REPORT, { c: m[1] })).reportData.report; drawReports([r]); } catch (e) { fail(e); }
    });
    if (!cfg.name) { bd.querySelector('.list').innerHTML = '<p class="hint">설정에서 캐릭터 이름을 넣으면 최근 기록이 자동으로 뜸. 아니면 위에 로그 주소를 붙여넣기.</p>'; return; }
    try {
      const c = (await gql(Q_CHAR, { n: cfg.name, s: cfg.server, r: cfg.region })).characterData.character;
      if (!c) { bd.querySelector('.list').innerHTML = `<p class="hint">FFLogs 에서 "${esc(cfg.name)}" (${esc(cfg.server)}) 캐릭터를 못 찾음. 이름·서버 확인, 또는 로그 주소 붙여넣기.</p>`; return; }
      drawReports((c.recentReports && c.recentReports.data) || []);
    } catch (e) { fail(e); }
  }
  function fail(e) {
    if (e.message === 'NEED_LOGIN') { bd.querySelector('.list').innerHTML = '<p class="hint">FFLogs 연결이 필요함 → 설정 탭에서 로그인.</p>'; return; }
    setErr('불러오기 실패: ' + e.message + ' (네트워크나 FFLogs 설정 확인)'); const l = bd.querySelector('.list'); if (l) l.innerHTML = '';
  }
  function drawReports(reps) {
    const l = bd.querySelector('.list');
    if (!reps.length) { l.innerHTML = '<p class="hint">최근 기록 없음.</p>'; return; }
    l.innerHTML = '';
    reps.forEach(r => {
      const d = document.createElement('div'); d.className = 'rep';
      d.innerHTML = `<h4>${esc(r.title || r.code)}</h4><div class="meta">${new Date(r.startTime).toLocaleString('ko-KR')} · ${esc(r.zone ? r.zone.name : '')} · <a href="${FF}/reports/${esc(r.code)}" target="_blank" rel="noopener">FFLogs</a></div><div class="fights"></div>`;
      const fw = d.querySelector('.fights');
      (r.fights || []).forEach(f => {
        const b = document.createElement('button'); b.type = 'button'; b.className = f.kill ? 'kill' : '';
        b.textContent = `${f.name} ${f.kill ? '클리어' : (f.fightPercentage != null ? f.fightPercentage.toFixed(1) + '%' : '와이프')} · ${mmss(f.endTime - f.startTime)}`;
        b.addEventListener('click', () => openFight(r.code, f.id)); fw.appendChild(b);
      });
      if (!(r.fights || []).length) fw.innerHTML = '<span class="meta">보스 전투 없음</span>';
      l.appendChild(d);
    });
  }

  async function openFight(code, fid) {
    tab = 'fight'; cur = { loading: true, code, fid }; renderFight();
    try { cur = await analyze(code, fid); } catch (e) { cur = { err: e.message === 'NEED_LOGIN' ? 'FFLogs 연결이 필요함 → 설정 탭' : e.message, code, fid }; }
    renderFight();
  }
  function xaUrl(r) { return `https://xivanalysis.com/fflogs/${r.code}/${r.fid}` + (r.me ? '/' + r.me.id : ''); }
  function renderFight() {
    dlg.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    const r = cur;
    if (!r || r.loading) { bd.innerHTML = '<p class="hint">분석하는 중…</p>'; return; }
    if (r.err) { bd.innerHTML = `<button type="button" class="back">← 기록으로</button><div class="err">${esc(r.err)}</div>`; bd.querySelector('.back').addEventListener('click', () => show('logs')); return; }
    const f = r.fight;
    const stat = (v, k) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`;
    bd.innerHTML = `<div class="row" style="margin:0"><button type="button" class="back">← 기록으로</button>
        <a href="${FF}/reports/${esc(r.code)}#fight=${r.fid}" target="_blank" rel="noopener"><button type="button">FFLogs 원본</button></a>
        <a href="${esc(xaUrl(r))}" target="_blank" rel="noopener"><button type="button">xivanalysis 새 창</button></a>
        <button type="button" class="xab">xivanalysis 여기서 보기</button></div>
      <h3 style="margin:14px 0 0;font-size:18px">${esc(f.name)} · ${f.kill ? '클리어' : '와이프'} <span class="hint" style="font-weight:600">${esc(r.title || '')} · ${new Date(r.date + f.startTime).toLocaleString('ko-KR')}</span></h3>
      <div class="stats">${stat(mmss(r.dur), '전투 시간')}${f.kill ? '' : stat((f.fightPercentage || 0).toFixed(1) + '%', '보스 남은 HP')}
        ${r.job ? stat(esc(r.job), '직업') : ''}${r.rdps != null ? stat(Math.round(r.rdps).toLocaleString(), 'rDPS') : r.dps != null ? stat(Math.round(r.dps).toLocaleString(), 'DPS') : ''}
        ${r.rank != null ? stat(Math.round(r.rank) + '%', '순위') : ''}${r.uptime != null ? stat((r.uptime * 100).toFixed(1) + '%', '업타임') : ''}
        ${r.deaths ? stat(r.deaths.length, '내 사망') : ''}${r.onlyMe ? stat(r.onlyMe.reduce((a, x) => a + x.hits, 0), '혼자 맞은 공격') : ''}</div>
      <div class="fb"><h3>이번 판 피드백</h3>${r.fb.length ? '<ol>' + r.fb.map(([k, t]) => `<li><b>${esc(k)}</b>${esc(t)}</li>`).join('') + '</ol>' : '<p style="margin:0">눈에 띄는 실수 없음. xivanalysis 에서 스킬 순서·버프 정렬만 확인.</p>'}</div>
      ${r.good.length ? `<div class="good"><h3>잘한 점</h3>${r.good.map(esc).join('<br>')}</div>` : ''}
      ${r.topTaken && r.topTaken.length ? `<h4 style="margin:16px 0 6px">많이 맞은 공격</h4><table><tr><th>기술</th><th>내가 맞은 횟수</th><th>파티 전체</th><th>피해</th></tr>${r.topTaken.map(x => `<tr><td>${esc(x.name)}</td><td>${x.hits}</td><td>${x.party}</td><td>${Math.round(x.total).toLocaleString()}</td></tr>`).join('')}</table>` : ''}
      <h4 style="margin:18px 0 6px">반성 메모</h4>
      <textarea class="memo" placeholder="다음 트라이에서 고칠 것"></textarea>
      <div class="row"><button type="button" class="pri savebtn">반성노트에 저장</button><span class="hint">피드백 요약과 메모가 같이 저장됨</span></div>
      <div class="xaw"></div>`;
    bd.querySelector('.back').addEventListener('click', () => show('logs'));
    bd.querySelector('.xab').addEventListener('click', e => {
      const w = bd.querySelector('.xaw');
      if (w.firstChild) { w.innerHTML = ''; e.target.textContent = 'xivanalysis 여기서 보기'; return; }
      w.innerHTML = `<div class="xa"><iframe src="${esc(xaUrl(r))}" title="xivanalysis" loading="lazy" referrerpolicy="no-referrer"></iframe></div><p class="hint">창 안에 안 뜨면 "xivanalysis 새 창" 버튼으로.</p>`;
      e.target.textContent = 'xivanalysis 닫기'; w.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const id = r.code + ':' + r.fid;
    loadNotes().then(list => { const n = list.find(x => x.id === id); if (n) bd.querySelector('.memo').value = n.memo || ''; });
    bd.querySelector('.savebtn').addEventListener('click', async e => {
      e.target.disabled = true;
      try {
        await saveNote({ id, code: r.code, fid: r.fid, at: r.date + f.startTime, boss: f.name, kill: !!f.kill, pct: f.fightPercentage, job: r.job || '', rank: r.rank, uptime: r.uptime, deaths: (r.deaths || []).length,
          fb: r.fb.map(([k, t]) => k + ': ' + t), memo: bd.querySelector('.memo').value.trim(), saved: Date.now() });
        e.target.textContent = '저장됨';
      } catch (err) { setErr('저장 실패: ' + err.message); e.target.disabled = false; }
    });
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
