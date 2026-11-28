/* review-fight.js — 회초리 전투 화면 (FFLogs 다시 만들기 + xivanalysis 방식 분석)
 *
 * review.js 가 window.JamFight.open(컨테이너, {code, fid, gql, cfg, back, saveNote, loadNotes}) 로 부름.
 * 탭: 개요 · 딜량 · 치유량 · 받은 피해 · 사망 · 버프·디버프 · 시전 타임라인 · 분석
 * 기술·버프 이름은 로그에 기록된 이름을 그대로 씀(한국 서버 로그 = 한국어 이름).
 */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const num = n => n == null || isNaN(n) ? '-' : Math.round(n).toLocaleString('ko-KR');
  const pct = (v, d = 1) => v == null || isNaN(v) ? '-' : (v * 100).toFixed(d) + '%';
  const lc = s => String(s || '').trim().toLowerCase();
  const JOB = { Paladin: ['나이트', 'T'], Warrior: ['전사', 'T'], DarkKnight: ['암흑기사', 'T'], Gunbreaker: ['건브레이커', 'T'], WhiteMage: ['백마도사', 'H'], Scholar: ['학자', 'H'], Astrologian: ['점성술사', 'H'], Sage: ['현자', 'H'],
    Monk: ['몽크', 'D'], Dragoon: ['용기사', 'D'], Ninja: ['닌자', 'D'], Samurai: ['사무라이', 'D'], Reaper: ['리퍼', 'D'], Viper: ['바이퍼', 'D'], Bard: ['음유시인', 'D'], Machinist: ['기공사', 'D'], Dancer: ['무도가', 'D'],
    BlackMage: ['흑마도사', 'D'], Summoner: ['소환사', 'D'], RedMage: ['적마도사', 'D'], Pictomancer: ['픽토맨서', 'D'], BlueMage: ['청마도사', 'D'], LimitBreak: ['리미트 브레이크', 'L'] };
  const ROLE_C = { T: '#2f6fe4', H: '#2e9e55', D: '#d24545', L: '#8a7a3a' };
  const jobKo = j => (JOB[j] || [j || '?'])[0], roleOf = j => (JOB[j] || [0, 'D'])[1];
  const ICON = 'https://assets.rpglogs.com/img/ff/abilities/';

  /* 직업별 재사용 기술(게임 기술 ID, 재사용 초). 로그 언어와 상관없이 ID로 셈. 이름은 로그에서 가져옴 */
  const CD = {
    Paladin: [[20, 60], [7383, 60], [23, 30], [29, 30]], Warrior: [[7389, 60], [52, 60], [7387, 30]], DarkKnight: [[16472, 120], [7390, 60], [3639, 90], [3643, 60]], Gunbreaker: [[16138, 60], [16164, 120], [16146, 30], [16159, 60]],
    WhiteMage: [[136, 120], [3571, 40], [16536, 120], [25861, 60]], Scholar: [[7436, 120], [166, 60], [3587, 180]], Astrologian: [[16552, 120], [3606, 60], [7439, 60]], Sage: [[24318, 120]],
    Monk: [[7396, 120], [7395, 60], [25766, 90]], Dragoon: [[3557, 120], [85, 60], [3555, 60], [96, 120], [16478, 30], [83, 40]], Ninja: [[2248, 120], [36957, 120], [2258, 60], [36958, 60], [7403, 120], [16493, 90], [2264, 60]],
    Samurai: [[16482, 120], [16481, 60]], Reaper: [[24405, 120], [24393, 60]], Viper: [[34647, 120]], Bard: [[118, 120], [25785, 110], [101, 120], [107, 120], [3562, 60]], Machinist: [[2878, 120], [7414, 120], [2876, 55], [25788, 60]],
    Dancer: [[15998, 120], [16011, 120], [15997, 30], [16013, 60]], BlackMage: [[3573, 120], [25796, 120], [158, 100]], Summoner: [[25801, 120], [16508, 60]], RedMage: [[7520, 120], [7521, 110], [7517, 25]], Pictomancer: [[34675, 120]]
  };
  const BURST = new Set([16472, 16164, 136, 7436, 16552, 24318, 7396, 3557, 2248, 36957, 7403, 16482, 24405, 34647, 118, 25785, 101, 2878, 7414, 15998, 16011, 3573, 25796, 25801, 7520, 7521, 34675]);
  // 파티 시너지(다른 사람 딜을 올려 주는 기술)
  const RAID = [3557, 7396, 7436, 16552, 118, 25785, 16196, 16004, 7520, 25801, 24405, 34675, 2248, 36957];
  // 항상 능력(oGCD)인 것: 직업 재사용 기술(일부 GCD 제외) + 공통 역할 기술
  const GCD_CD = new Set([15997, 15998, 16146, 16153]);
  const OGCD = new Set([...Object.values(CD).flat().map(x => x[0]).filter(g => !GCD_CD.has(g)),
    7561, 7562, 7559, 7560, 3, 7531, 7535, 7548, 7549, 7546, 7541, 7542, 7551, 7557, 7538, 7533, 7537, 7540, 7571, 7554, 7553]);
  const HEALER = /^(WhiteMage|Scholar|Astrologian|Sage)$/;
  const POT = /(Gemdraught|Tincture|Draught|Potion|탕약|강화약|각성약|의약품)/i;
  const VULN = /(받는\s*피해(량)?\s*증가|주는\s*피해(량)?\s*감소|Vulnerability Up|Damage Down|선고|Doom)/i;

  const Q_BASE = `query($c:String,$f:[Int]){reportData{report(code:$c){code title startTime zone{name}
    masterData{actors{id name type subType server petOwner} abilities{gameID name icon type}}
    fights(fightIDs:$f){id name kill fightPercentage bossPercentage startTime endTime friendlyPlayers gameZone{name} enemyNPCs{id gameID}}
    playerDetails(fightIDs:$f)
    dmg:table(fightIDs:$f,dataType:DamageDone) heal:table(fightIDs:$f,dataType:Healing)
    taken:table(fightIDs:$f,dataType:DamageTaken,viewBy:Ability) takenBy:table(fightIDs:$f,dataType:DamageTaken)
    deaths:table(fightIDs:$f,dataType:Deaths) enemyDebuffs:table(fightIDs:$f,dataType:Debuffs,hostilityType:Enemies)
    rankings(fightIDs:$f)
    raid:events(fightIDs:$f,dataType:Casts,filterExpression:"ability.id in (${RAID.join(',')})",limit:2000){data}}}}`;
  const Q_P = `query($c:String,$f:[Int],$p:Int){reportData{report(code:$c){
    dmgAb:table(fightIDs:$f,dataType:DamageDone,viewBy:Ability,sourceID:$p) healAb:table(fightIDs:$f,dataType:Healing,viewBy:Ability,sourceID:$p)
    takenAb:table(fightIDs:$f,dataType:DamageTaken,viewBy:Ability,sourceID:$p) buffs:table(fightIDs:$f,dataType:Buffs,sourceID:$p)
    debuffs:table(fightIDs:$f,dataType:Debuffs,hostilityType:Friendlies,sourceID:$p) graph:graph(fightIDs:$f,dataType:DamageDone,sourceID:$p)}}}`;
  const Q_CASTS = `query($c:String,$f:[Int],$p:Int,$st:Float){reportData{report(code:$c){events(fightIDs:$f,dataType:Casts,sourceID:$p,startTime:$st,limit:10000){data nextPageTimestamp}}}}`;

  const tdata = t => (t && t.data) || t || {};
  const entries = t => { const d = tdata(t); return d.entries || d.auras || d.damageTaken || d.playerDetails || []; };

  /* ================= 화면 ================= */
  const css = `
.jf{--bar:#a597e3;max-width:1400px;margin:0 auto}
.jf .top{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
.jf .top h2{margin:0;font-size:24px;font-weight:900;letter-spacing:-.02em}
.jf .chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:800;color:#fff;background:#8a8796;white-space:nowrap}
.jf .chip.kill{background:#2e9e55}.jf .chip.wipe{background:#d24545}
.jf .meta{color:var(--sub,#6f6c78);font-size:12.5px}
.jf .party{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 4px}
.jf .pl{display:inline-flex;align-items:center;gap:6px;border:1.5px solid var(--line,#dddbe2);background:var(--bg,#f6f5f8);border-radius:999px;padding:4px 10px 4px 4px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;color:inherit}
.jf .pl i{font-style:normal;font-size:10.5px;color:#fff;border-radius:999px;padding:2px 6px}
.jf .pl[aria-pressed=true]{border-color:var(--ink,#16151a);box-shadow:0 0 0 2px var(--ink,#16151a) inset}
.jf .tabs{display:flex;gap:2px;border-bottom:1px solid var(--line,#dddbe2);margin:14px 0 16px;overflow-x:auto;scrollbar-width:none}
.jf .tabs button{background:none;border:0;border-bottom:3px solid transparent;border-radius:0;padding:10px 14px;font:inherit;font-weight:800;color:var(--sub,#6f6c78);cursor:pointer;white-space:nowrap}
.jf .tabs button[aria-selected=true]{color:var(--ink,#16151a);border-bottom-color:var(--bar)}
.jf .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:14px}
.jf .card{border-radius:16px;padding:14px;background:var(--card,#ececef)}
.jf .card b{display:block;font-size:24px;font-weight:900;letter-spacing:-.02em;line-height:1.1}
.jf .card span{font-size:12px;color:var(--sub,#6f6c78);font-weight:700}
.jf .card small{display:block;font-size:11.5px;color:var(--sub,#6f6c78);margin-top:3px}
.jf section{border:1px solid var(--line,#dddbe2);border-radius:18px;padding:16px 18px;margin-bottom:14px;background:color-mix(in srgb,var(--card,#ececef) 35%,transparent)}
.jf section>h3{margin:0 0 10px;font-size:16px;font-weight:900;display:flex;gap:8px;align-items:baseline}
.jf section>h3 small{font-size:12px;color:var(--sub,#6f6c78);font-weight:600}
.jf .two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
@media(max-width:900px){.jf .two{grid-template-columns:1fr}}
.jf table{width:100%;border-collapse:collapse;font-size:13px}
.jf th{font-size:11.5px;color:var(--sub,#6f6c78);font-weight:800;text-align:left;padding:6px 8px;border-bottom:1px solid var(--line,#dddbe2);white-space:nowrap}
.jf td{padding:6px 8px;border-bottom:1px solid color-mix(in srgb,var(--line,#dddbe2) 60%,transparent);vertical-align:middle}
.jf td.n,.jf th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.jf tr.me td{background:color-mix(in srgb,var(--bar) 14%,transparent)}
.jf tr.click{cursor:pointer}.jf tr.click:hover td{background:color-mix(in srgb,var(--bar) 10%,transparent)}
.jf .bar{position:relative;height:16px;border-radius:5px;background:color-mix(in srgb,var(--line,#dddbe2) 70%,transparent);min-width:90px;overflow:hidden}
.jf .bar>u{position:absolute;inset:0 auto 0 0;border-radius:5px;background:var(--bar)}
.jf .ab{display:inline-flex;align-items:center;gap:7px}
.jf .ab img{width:20px;height:20px;border-radius:4px;flex:none}
.jf .job{display:inline-block;font-size:10.5px;font-weight:800;color:#fff;border-radius:5px;padding:1px 6px;margin-right:6px}
.jf .ck{border:1px solid var(--line,#dddbe2);border-radius:14px;margin-bottom:8px;background:var(--bg,#f6f5f8)}
.jf .ck>summary{display:grid;grid-template-columns:22px minmax(0,1fr) 64px minmax(80px,200px);gap:10px;align-items:center;padding:12px 14px;cursor:pointer;list-style:none;font-weight:800}
.jf .ck>summary::-webkit-details-marker{display:none}
.jf .ck .ic{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:12px}
.jf .ck .v{text-align:right;font-variant-numeric:tabular-nums}
.jf .ck .bd{padding:0 14px 14px 46px;font-size:13.5px}
.jf .ck .bd p{margin:0 0 8px;color:var(--sub,#6f6c78)}
.jf .ck .bd ul{margin:0;padding-left:18px}.jf .ck .bd li{margin:3px 0}
.jf .ok{--c:#2e9e55}.jf .warn{--c:#e58a00}.jf .bad{--c:#d6113f}
.jf .ck .ic{background:var(--c)}.jf .ck .v{color:var(--c)}.jf .ck .bar>u{background:var(--c)}
.jf .sg{display:grid;grid-template-columns:34px minmax(0,1fr);gap:12px;padding:12px 0;border-bottom:1px solid var(--line,#dddbe2)}
.jf .sg:last-child{border-bottom:0}
.jf .sg .im{width:34px;height:34px;border-radius:8px;background:var(--card,#ececef);display:grid;place-items:center;overflow:hidden;font-size:16px}
.jf .sg .im img{width:100%;height:100%}
.jf .sg p{margin:0 0 6px;font-size:14px;line-height:1.55}
.jf .sev{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:800;color:#fff;border-radius:6px;padding:3px 8px;margin-right:8px}
.jf .sev.s3{background:#d6113f}.jf .sev.s2{background:#e58a00}.jf .sev.s1{background:#3f7fd6}
.jf .sg .why{font-size:12.5px;color:var(--sub,#6f6c78)}
.jf .tl{overflow-x:auto;border:1px solid var(--line,#dddbe2);border-radius:12px;background:var(--bg,#f6f5f8)}
.jf .tl svg{display:block}
.jf .tl text{font:600 11px "Pretendard Variable",Pretendard,system-ui,sans-serif;fill:var(--sub,#6f6c78)}
.jf .graph svg{width:100%;height:auto;display:block}
.jf .graph text{font:600 11px "Pretendard Variable",Pretendard,system-ui,sans-serif;fill:var(--sub,#6f6c78)}
.jf .legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--sub,#6f6c78);margin-top:6px}
.jf .legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}
.jf .loading{padding:40px 0;text-align:center;color:var(--sub,#6f6c78)}
.jf textarea{width:100%;min-height:110px;box-sizing:border-box}
.jf .empty{color:var(--sub,#6f6c78);font-size:13px;margin:0}
`;
  let cssOn = false;

  function open(root, opt) {
    if (!cssOn) { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); cssOn = true; }
    const S = { opt, code: opt.code, fid: opt.fid, tab: 'sum', pc: new Map(), target: null };
    root.innerHTML = '<div class="jf"><p class="loading">전투 기록 불러오는 중…</p></div>';
    const el = root.firstChild;
    loadBase(S).then(() => { pick(S, S.meId); }).catch(e => {
      el.innerHTML = `<button type="button" class="back">← 기록으로</button><p class="err">${esc(e.message === 'NEED_LOGIN' ? 'FFLogs 연결이 필요함 → 설정 탭' : '불러오기 실패: ' + e.message)}</p>`;
      el.querySelector('.back').addEventListener('click', opt.back);
    });
    S.el = el;
  }

  async function loadBase(S) {
    const R = (await S.opt.gql(Q_BASE, { c: S.code, f: [S.fid] })).reportData.report;
    S.R = R; S.fight = R.fights[0]; S.t0 = S.fight.startTime; S.dur = S.fight.endTime - S.fight.startTime;
    S.ab = new Map(((R.masterData && R.masterData.abilities) || []).map(a => [a.gameID, a]));
    const actors = (R.masterData && R.masterData.actors) || [];
    S.actor = new Map(actors.map(a => [a.id, a]));
    // 파티: playerDetails → 없으면 friendlyPlayers
    let pl = [];
    const pd = tdata(R.playerDetails); const det = (pd.playerDetails || pd.data && pd.data.playerDetails) || pd;
    ['tanks', 'healers', 'dps'].forEach(k => (det[k] || []).forEach(p => pl.push({ id: p.id, name: p.name, job: p.type || p.icon || '', server: p.server })));
    if (!pl.length) pl = (S.fight.friendlyPlayers || []).map(id => S.actor.get(id)).filter(Boolean).map(a => ({ id: a.id, name: a.name, job: a.subType, server: a.server }));
    const order = { T: 0, H: 1, D: 2 };
    pl.sort((a, b) => order[roleOf(a.job)] - order[roleOf(b.job)]);
    S.players = pl;
    const me = pl.find(p => lc(p.name) === lc(S.opt.cfg.name));
    S.meId = me ? me.id : (pl[0] && pl[0].id);
    // 딜 표
    const dmgTot = (tdata(R.dmg).totalTime) || S.dur;
    S.dmgRows = entries(R.dmg).filter(e => e.type !== 'Pet').map(e => ({ id: e.id, name: e.name, job: e.type || e.icon, total: e.total, dps: e.total / (dmgTot / 1000), active: e.activeTime != null ? e.activeTime / dmgTot : null }));
    const healTot = (tdata(R.heal).totalTime) || S.dur;
    S.healRows = entries(R.heal).map(e => ({ id: e.id, name: e.name, job: e.type || e.icon, total: e.total, hps: e.total / (healTot / 1000), over: e.overheal || 0 }));
    S.takenAb = entries(R.taken).map(e => ({ name: e.name, guid: e.guid, total: e.total, hits: e.hitCount || 0, icon: e.abilityIcon || e.icon }));
    S.takenBy = entries(R.takenBy).map(e => ({ id: e.id, name: e.name, job: e.type || e.icon, total: e.total }));
    S.deaths = entries(R.deaths).map(e => ({ id: e.id, name: e.name, job: e.type || e.icon, t: (e.timestamp || 0) - S.t0, by: (e.killingBlow && e.killingBlow.name) || (e.ability && e.ability.name) || '알 수 없음', icon: e.killingBlow && e.killingBlow.abilityIcon }));
    S.enemyAuras = entries(R.enemyDebuffs).map(a => ({ name: a.name, guid: a.guid, up: (a.totalUptime || 0) / ((tdata(R.enemyDebuffs).totalTime) || S.dur), uses: a.totalUses, n: a.totalUses, icon: a.abilityIcon || a.icon, bands: a.bands || [] }));
    // 순위
    S.rank = new Map();
    try { const rk = tdata(R.rankings); const f0 = Array.isArray(rk) ? rk[0] : (rk.data || [])[0];
      if (f0 && f0.roles) Object.values(f0.roles).forEach(role => (role.characters || []).forEach(c => S.rank.set(lc(c.name), { pct: c.rankPercent, amount: c.amount }))); } catch (e) {}
    S.raid = ((R.raid && R.raid.data) || []).filter(e => e.type === 'cast').map(e => ({ t: e.timestamp - S.t0, id: e.abilityGameID, src: e.sourceID }));
  }

  async function loadPlayer(S, id) {
    if (S.pc.has(id)) return S.pc.get(id);
    const R = (await S.opt.gql(Q_P, { c: S.code, f: [S.fid], p: id })).reportData.report;
    let casts = [], st = S.fight.startTime;
    for (let k = 0; k < 8 && st != null; k++) {
      const q = (await S.opt.gql(Q_CASTS, { c: S.code, f: [S.fid], p: id, st })).reportData.report.events;
      casts = casts.concat((q.data || []).filter(e => e.sourceID === id && (e.type === 'cast' || e.type === 'begincast')));
      st = q.nextPageTimestamp;
    }
    const P = { R, casts };
    S.pc.set(id, P); return P;
  }

  async function pick(S, id) {
    S.target = id;
    S.el.innerHTML = head(S) + '<p class="loading">이 사람의 기록 분석하는 중…</p>';
    bindHead(S);
    try { S.P = await loadPlayer(S, id); S.A = analyze(S, id, S.P); } catch (e) { S.P = null; S.A = null; S.perr = e.message; }
    render(S);
  }

  const TABS = [['sum', '개요'], ['an', '분석'], ['dmg', '딜량'], ['heal', '치유량'], ['taken', '받은 피해'], ['death', '사망'], ['aura', '버프·디버프'], ['tl', '시전 타임라인']];
  function head(S) {
    const f = S.fight, R = S.R;
    return `<div class="top"><button type="button" class="back">← 기록으로</button>
      <h2>${esc(f.name)}</h2><span class="chip ${f.kill ? 'kill' : 'wipe'}">${f.kill ? '클리어' : '와이프 ' + (f.fightPercentage != null ? f.fightPercentage.toFixed(1) + '%' : '')}</span>
      <span class="meta">${esc((f.gameZone && f.gameZone.name) || (R.zone && R.zone.name) || '')} · ${mmss(S.dur)} · ${new Date(R.startTime + f.startTime).toLocaleString('ko-KR')}</span>
      <span style="margin-left:auto;display:flex;gap:6px"><a href="https://www.fflogs.com/reports/${esc(S.code)}#fight=${S.fid}" target="_blank" rel="noopener"><button type="button">FFLogs 원본</button></a>
      <a href="https://xivanalysis.com/fflogs/${esc(S.code)}/${S.fid}/${S.target || ''}" target="_blank" rel="noopener"><button type="button">xivanalysis</button></a></span></div>
      <div class="party" role="group" aria-label="분석할 사람">${S.players.map(p => `<button type="button" class="pl" data-p="${p.id}" aria-pressed="${p.id === S.target}"><i style="background:${ROLE_C[roleOf(p.job)]}">${esc(jobKo(p.job))}</i>${esc(p.name)}${p.id === S.meId ? ' (나)' : ''}</button>`).join('')}</div>
      <div class="tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${n}</button>`).join('')}</div>`;
  }
  function bindHead(S) {
    S.el.querySelector('.back').addEventListener('click', S.opt.back);
    S.el.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => pick(S, +b.dataset.p)));
    S.el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { S.tab = b.dataset.tab; render(S); }));
  }
  function render(S) {
    const body = { sum: vSum, an: vAn, dmg: vDmg, heal: vHeal, taken: vTaken, death: vDeath, aura: vAura, tl: vTl }[S.tab](S);
    S.el.innerHTML = head(S) + (S.perr && !S.P ? `<p class="err">이 사람 기록을 못 읽음: ${esc(S.perr)}</p>` : '') + body;
    bindHead(S);
    S.el.querySelectorAll('img[data-ic]').forEach(im => im.addEventListener('error', () => im.remove()));
    S.el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { S.tab = b.dataset.go; render(S); }));
    S.el.querySelectorAll('tr[data-pp]').forEach(tr => tr.addEventListener('click', () => pick(S, +tr.dataset.pp)));
    if (S.tab === 'sum') bindMemo(S);
  }

  /* ---------- 공통 조각 ---------- */
  const icon = (S, guid, ic) => { const a = S.ab.get(guid); const f = ic || (a && a.icon); return f ? `<img data-ic src="${ICON}${esc(f)}" alt="" loading="lazy">` : ''; };
  const abName = (S, guid, fallback) => { const a = S.ab.get(guid); return (a && a.name) || fallback || ('#' + guid); };
  const bar = (v, max, color) => `<div class="bar"><u style="width:${Math.max(0, Math.min(100, max ? v / max * 100 : 0)).toFixed(1)}%${color ? ';background:' + color : ''}"></u></div>`;
  const jobTag = j => `<span class="job" style="background:${ROLE_C[roleOf(j)]}">${esc(jobKo(j))}</span>`;
  const card = (v, k, s) => `<div class="card"><b>${v}</b><span>${k}</span>${s ? `<small>${s}</small>` : ''}</div>`;
  const tname = S => (S.players.find(p => p.id === S.target) || {}).name || '';
  const tjob = S => (S.players.find(p => p.id === S.target) || {}).job || '';

  /* ---------- 개요 ---------- */
  function vSum(S) {
    const A = S.A, me = S.dmgRows.find(r => r.id === S.target), rk = S.rank.get(lc(tname(S)));
    const hr = S.healRows.find(r => r.id === S.target), tk = S.takenBy.find(r => r.id === S.target);
    const md = S.deaths.filter(d => d.id === S.target);
    const top = A ? A.sugg.slice(0, 5) : [];
    const maxD = Math.max(1, ...S.dmgRows.map(r => r.dps));
    return `<div class="cards">
      ${card(rk ? num(rk.amount) : me ? num(me.dps) : '-', rk ? 'rDPS (기여 딜)' : 'DPS', me ? 'DPS ' + num(me.dps) : '')}
      ${card(rk && rk.pct != null ? Math.round(rk.pct) + '%' : '-', '순위', rk ? '같은 직업 중 백분위' : '순위 없음(공개 순위 없는 전투)')}
      ${card(A ? pct(A.abc.up) : '-', 'GCD 적용 시간', A ? `GCD ${A.abc.n}번 · 평균 ${(A.abc.gcd / 1000).toFixed(2)}초` : '')}
      ${card(md.length, '사망', md.length ? md.map(d => mmss(d.t)).join(', ') : '사망 없음')}
      ${card(tk ? num(tk.total) : '-', '받은 피해', A ? `혼자 맞은 공격 ${A.onlyMe.reduce((a, x) => a + x.hits, 0)}번` : '')}
      ${card(hr ? num(hr.hps) : '-', '초당 치유', hr && hr.total ? '오버힐 ' + pct(hr.over / (hr.over + hr.total)) : '')}
    </div>
    <section><h3>딜 그래프 <small>${esc(tname(S))} · 5초 평균 · 세로선 = 파티 시너지 / 빨간 점 = 사망</small></h3>${graph(S)}</section>
    <div class="two">
      <section><h3>파티 딜 <small>DPS</small></h3><table>${S.dmgRows.slice().sort((a, b) => b.dps - a.dps).map(r => `<tr class="click${r.id === S.target ? ' me' : ''}" data-pp="${r.id}"><td>${jobTag(r.job)}${esc(r.name)}</td><td style="width:45%">${bar(r.dps, maxD, ROLE_C[roleOf(r.job)])}</td><td class="n">${num(r.dps)}</td></tr>`).join('')}</table></section>
      <section><h3>먼저 고칠 것 <small><button type="button" data-go="an" style="padding:2px 8px;font-size:12px">분석 전체 보기 →</button></small></h3>
        ${top.length ? top.map(sgHtml(S)).join('') : '<p class="empty">눈에 띄는 문제 없음.</p>'}</section>
    </div>
    <section><h3>반성 메모 <small>요약과 같이 반성노트에 저장</small></h3><textarea class="memo" placeholder="다음 트라이에서 고칠 것"></textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px"><button type="button" class="pri savebtn">반성노트에 저장</button><span class="meta svmsg"></span></div></section>`;
  }
  function bindMemo(S) {
    const id = S.code + ':' + S.fid, ta = S.el.querySelector('.memo'), f = S.fight;
    S.opt.loadNotes().then(list => { const n = list.find(x => x.id === id); if (n && ta && !ta.value) ta.value = n.memo || ''; });
    S.el.querySelector('.savebtn').addEventListener('click', async e => {
      e.target.disabled = true; const rk = S.rank.get(lc(tname(S)));
      try {
        await S.opt.saveNote({ id, code: S.code, fid: S.fid, at: S.R.startTime + f.startTime, boss: f.name, kill: !!f.kill, pct: f.fightPercentage, job: jobKo(tjob(S)), who: tname(S),
          rank: rk ? rk.pct : null, uptime: S.A ? S.A.abc.up : null, deaths: S.deaths.filter(d => d.id === S.target).length,
          fb: S.A ? S.A.sugg.map(x => `[${['', '참고', '개선 필요', '중요도 높음'][x.sev]}] ${x.text}${x.why ? ' — ' + x.why : ''}`) : [], memo: ta.value.trim(), saved: Date.now() });
        S.el.querySelector('.svmsg').textContent = '저장됨';
      } catch (err) { S.el.querySelector('.svmsg').textContent = '저장 실패: ' + err.message; }
      e.target.disabled = false;
    });
  }

  /* ---------- 딜 그래프 ---------- */
  function graph(S) {
    const P = S.P; if (!P) return '<p class="empty">그래프 없음</p>';
    const g = tdata(P.R.graph); const ser = (g.series || []).slice().sort((a, b) => sum(b.data) - sum(a.data))[0];
    if (!ser || !ser.data || !ser.data.length) return '<p class="empty">그래프 데이터 없음</p>';
    const step = ser.pointInterval || (S.dur / ser.data.length), start = (ser.pointStart || S.fight.startTime) - S.t0;
    const vals = ser.data.map(v => Array.isArray(v) ? v[1] : v);
    // 5초 이동 평균
    const k = Math.max(1, Math.round(5000 / step)), sm = vals.map((_, i) => { let a = 0, n = 0; for (let j = Math.max(0, i - k + 1); j <= i; j++) { a += vals[j]; n++; } return a / n; });
    const W = 1000, H = 220, L = 46, B = 22, max = Math.max(1, ...sm) * 1.1;
    const X = t => L + (t / S.dur) * (W - L - 8), Y = v => H - B - (v / max) * (H - B - 10);
    const pts = sm.map((v, i) => `${X(start + i * step).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    let ticks = ''; for (let t = 0; t <= S.dur; t += 60000) ticks += `<line x1="${X(t)}" x2="${X(t)}" y1="10" y2="${H - B}" stroke="currentColor" opacity=".08"/><text x="${X(t)}" y="${H - 6}" text-anchor="${S.dur - t < 30000 ? 'end' : 'middle'}">${mmss(t)}</text>`;
    for (let q = 1; q <= 3; q++) { const v = max / 4 * q; ticks += `<text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${num(v)}</text><line x1="${L}" x2="${W - 8}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" opacity=".06"/>`; }
    const raid = S.raid.map(r => `<line x1="${X(r.t)}" x2="${X(r.t)}" y1="10" y2="${H - B}" stroke="#e5a400" stroke-width="1.5" opacity=".55"><title>${esc(abName(S, r.id))} ${mmss(r.t)}</title></line>`).join('');
    const dth = S.deaths.map(d => `<circle cx="${X(d.t)}" cy="${H - B - 4}" r="4.5" fill="#d6113f"><title>${esc(d.name)} 사망 ${mmss(d.t)} · ${esc(d.by)}</title></circle>`).join('');
    return `<div class="graph"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="딜 그래프">${ticks}${raid}
      <polyline points="${L},${H - B} ${pts} ${X(start + (sm.length - 1) * step)},${H - B}" fill="color-mix(in srgb,#a597e3 25%,transparent)" stroke="none"/>
      <polyline points="${pts}" fill="none" stroke="#7b68d6" stroke-width="2" stroke-linejoin="round"/>${dth}</svg>
      <div class="legend"><span><i style="background:#7b68d6"></i>DPS</span><span><i style="background:#e5a400"></i>파티 시너지 사용</span><span><i style="background:#d6113f;border-radius:50%"></i>사망</span></div></div>`;
  }
  const sum = a => (a || []).reduce((s, v) => s + (Array.isArray(v) ? v[1] : v || 0), 0);

  /* ================= 분석 (xivanalysis 방식) ================= */
  function analyze(S, id, P) {
    const job = (S.players.find(p => p.id === id) || {}).job || '', t0 = S.t0, dur = S.dur;
    const nm = g => abName(S, g);
    // 1) 시전: begincast → cast 묶기, 끊긴 시전 찾기
    const ev = P.casts.slice().sort((a, b) => a.timestamp - b.timestamp);
    const acts = [], interrupted = [];
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type === 'begincast') {
        const j = ev.findIndex((x, k) => k > i && x.type === 'cast' && x.abilityGameID === e.abilityGameID && x.timestamp - e.timestamp < 6000);
        const other = ev.findIndex((x, k) => k > i && x.type === 'begincast');
        if (j < 0 || (other >= 0 && other < j)) { const nx = ev.find((x, k) => k > i && x.type === 'cast'); interrupted.push({ t: e.timestamp - t0, g: e.abilityGameID, lost: nx ? nx.timestamp - e.timestamp : 2500 }); }
        else { ev[j].__start = e.timestamp; }
      }
    }
    ev.filter(e => e.type === 'cast').forEach(e => acts.push({ t: (e.__start || e.timestamp) - t0, g: e.abilityGameID, end: e.timestamp - t0 }));
    acts.sort((a, b) => a.t - b.t);
    // 2) GCD 가르기: 직전 GCD 에서 1.5초 이상 지나 처음 누른 기술 = GCD 후보 → 기술별 다수결
    let last = -1e9; const vote = new Map();
    acts.forEach(a => { const isG = !OGCD.has(a.g) && !POT.test(nm(a.g)) && a.t - last >= 1450; if (isG) last = a.t; const v = vote.get(a.g) || [0, 0]; v[isG ? 0 : 1]++; vote.set(a.g, v); });
    const gcdSet = new Set([...vote].filter(([g, v]) => !OGCD.has(g) && v[0] >= v[1] * 1.5).map(([g]) => g));
    acts.forEach(a => { a.gcd = gcdSet.has(a.g) && !POT.test(nm(a.g)); });
    const gcds = acts.filter(a => a.gcd);
    const iv = []; for (let i = 1; i < gcds.length; i++) { const d = gcds[i].t - gcds[i - 1].t; if (d >= 1400 && d <= 3600) iv.push(d); }
    iv.sort((a, b) => a - b); const gcd = iv.length ? iv[Math.floor(iv.length * 0.3)] : 2500;
    const up = Math.min(1, gcds.length * gcd / dur);
    const gaps = []; for (let i = 1; i < gcds.length; i++) { const d = gcds[i].t - gcds[i - 1].t; if (d > gcd + 1500) gaps.push({ t: gcds[i - 1].t, d: d - gcd }); }
    if (gcds.length && gcds[0].t > 5000) gaps.push({ t: 0, d: gcds[0].t - 2000, start: 1 });
    if (gcds.length && dur - gcds[gcds.length - 1].t > gcd + 2500) gaps.push({ t: gcds[gcds.length - 1].t, d: dur - gcds[gcds.length - 1].t - gcd });
    gaps.sort((a, b) => b.d - a.d);
    // 위빙: GCD 사이 능력 3개 이상 = GCD 밀림
    const weaves = []; for (let i = 0; i < gcds.length; i++) { const a = gcds[i].t, b = i + 1 < gcds.length ? gcds[i + 1].t : dur; const og = acts.filter(x => !x.gcd && x.t > a && x.t < b); if (og.length >= 3 || (og.length >= 2 && b - a > gcd + 600 && i + 1 < gcds.length)) weaves.push({ t: a, n: og.length, delay: b - a - gcd }); }
    const abc = { up, n: gcds.length, gcd, gaps, idle: gaps.reduce((s, x) => s + x.d, 0) };
    // 3) 재사용 기술
    const cds = (CD[job] || []).filter(([g]) => S.ab.has(g) || acts.some(a => a.g === g)).map(([g, cd]) => {
      const uses = acts.filter(a => a.g === g); const first = uses.length ? uses[0].t : null;
      const max = Math.max(uses.length, Math.floor((dur - Math.min(first == null ? 10000 : first, 15000)) / (cd * 1000)) + 1);
      let drift = 0; for (let k = 1; k < uses.length; k++) drift += Math.max(0, uses[k].t - uses[k - 1].t - cd * 1000);
      return { g, cd, uses: uses.length, max, first, drift, burst: BURST.has(g), times: uses.map(u => u.t) };
    });
    // 4) 시너지 맞추기: 내 2분 버스트 때 파티 시너지가 근처(±10초)에 있었나
    const others = S.raid.filter(r => r.src !== id);
    const align = cds.filter(c => c.burst && c.cd >= 110).flatMap(c => c.times.map(t => ({ g: c.g, t, ok: others.some(r => Math.abs(r.t - t) <= 10000) })));
    // 5) 도트: 적에게 걸린 디버프 중 내가 쓴 기술과 이름이 같은 것
    const myNames = new Set(acts.map(a => nm(a.g)));
    const dots = S.enemyAuras.filter(a => myNames.has(a.name) && a.up > 0.05 && !RAID.some(g => nm(g) === a.name));
    // 6) 힐
    const healAb = entries(P.R.healAb).map(e => ({ name: e.name, guid: e.guid, total: e.total || 0, over: e.overheal || 0, gcd: gcdSet.has(e.guid) }));
    const hTot = healAb.reduce((s, x) => s + x.total, 0), hOver = healAb.reduce((s, x) => s + x.over, 0);
    const heal = hTot + hOver > 0 ? { over: hOver / (hTot + hOver), gcdOver: (() => { const g = healAb.filter(x => x.gcd); const t = g.reduce((s, x) => s + x.total, 0), o = g.reduce((s, x) => s + x.over, 0); return t + o ? o / (t + o) : null; })(), rows: healAb } : null;
    // 7) 맞은 공격
    const party = new Map(S.takenAb.map(e => [e.name, e.hits]));
    const mine = entries(P.R.takenAb).map(e => ({ name: e.name, guid: e.guid, hits: e.hitCount || 0, total: e.total || 0, party: party.get(e.name) || 0 }));
    const onlyMe = mine.filter(e => e.hits > 0 && e.party > 0 && e.party <= e.hits + 1 && !/^(공격|attack)$/i.test(e.name) && roleOf(job) !== 'T');
    const vulns = entries(P.R.debuffs).filter(a => VULN.test(a.name || '')).map(a => ({ name: a.name, guid: a.guid, n: a.totalUses || 1 }));
    const pots = acts.filter(a => POT.test(nm(a.g)));
    const deaths = S.deaths.filter(d => d.id === id);

    // ---- 체크리스트 ----
    const ck = [];
    const lvl = (v, g, w) => v >= g ? 'ok' : v >= w ? 'warn' : 'bad';
    ck.push({ k: 'abc', title: '항상 캐스팅하기', v: up, cls: lvl(up, 0.95, 0.88), desc: '항상 무언가를 하고 있어야 함. 재사용 대기가 돌아가는 동안 작은 실수를 하는 게 딜 사이클을 천천히 돌리는 것보다 나음.',
      items: [`GCD 적용 시간: ${pct(up, 2)} (GCD ${gcds.length}번 × 평균 ${(gcd / 1000).toFixed(2)}초)`, `GCD가 비어 있던 시간: 약 ${(abc.idle / 1000).toFixed(1)}초`, ...gaps.slice(0, 4).map(x => `${mmss(x.t)} ${x.start ? '시작 직후' : '부터'} ${(x.d / 1000).toFixed(1)}초 공백`)] });
    if (cds.length) {
      const tot = cds.reduce((s, c) => s + c.uses, 0), mx = cds.reduce((s, c) => s + c.max, 0);
      ck.push({ k: 'cd', title: '기술을 아끼지 말고 사용하기', v: mx ? tot / mx : 1, cls: lvl(mx ? tot / mx : 1, 0.95, 0.8), desc: 'GCD가 밀리지 않는 선에서 재사용 기술을 최대한 자주 쓰기. 쿨이 돌아왔는데 안 쓰고 있으면 그만큼 사용 횟수를 잃음.',
        items: cds.map(c => `${iconTxt(S, c.g)}${esc(nm(c.g))}: ${c.uses} / ${c.max} (${pct(c.uses / c.max, 2)})`), html: 1 });
    }
    if (align.length) { const ok = align.filter(a => a.ok).length; ck.push({ k: 'al', title: '파티 시너지에 버스트 맞추기', v: ok / align.length, cls: lvl(ok / align.length, 0.9, 0.7), desc: '2분 버스트를 파티 시너지(전투 연도·연환계·점복 등)가 켜진 동안 쓰면 같은 기술로 더 큰 딜이 나옴.',
      items: align.map(a => `${mmss(a.t)} ${esc(nm(a.g))} — ${a.ok ? '시너지와 겹침' : '시너지 없이 사용'}`) }); }
    dots.forEach(d => ck.push({ k: 'dot', title: `「${d.name}」 유지하기`, v: d.up, cls: lvl(d.up, 0.92, 0.85), desc: '지속 피해는 끊기지 않게 유지해야 딜 손실이 없음. 너무 일찍 갱신해도 손해라서, 끝나기 직전에 갱신.', items: [`적용 시간: ${pct(d.up, 2)}`] }));
    if (heal && HEALER.test(job)) ck.push({ k: 'oh', title: '필요 이상으로 치유하지 않기 (오버힐)', v: 1 - heal.over, cls: lvl(1 - heal.over, 0.75, 0.6), desc: '필요 이상으로 치유하지 말 것. 불필요한 GCD 힐을 줄이고 그 시간에 공격 마법을 쓰면 파티 딜이 올라감.',
      items: [`전체 오버힐: ${pct(heal.over)}`, heal.gcdOver != null ? `GCD 힐 오버힐: ${pct(heal.gcdOver)}` : null, ...heal.rows.filter(r => r.total + r.over > 0).sort((a, b) => (b.over) - (a.over)).slice(0, 5).map(r => `${esc(r.name)}: 오버힐 ${pct(r.over / (r.total + r.over))}`)].filter(Boolean) });
    ck.push({ k: 'dead', title: '죽지 않기', v: deaths.length ? 0 : 1, cls: deaths.length ? 'bad' : 'ok', desc: '죽으면 그동안 딜·힐이 0이 되고, 부활과 쇠약 때문에 파티 전체가 손해.', items: deaths.length ? deaths.map(d => `${mmss(d.t)} 「${esc(d.by)}」`) : ['사망 없음'] });
    const mist = onlyMe.reduce((s, x) => s + x.hits, 0) + vulns.reduce((s, x) => s + x.n, 0);
    ck.push({ k: 'mech', title: '기믹 처리', v: mist ? Math.max(0, 1 - mist / 10) : 1, cls: mist === 0 ? 'ok' : mist <= 2 ? 'warn' : 'bad', desc: '파티에서 나만(또는 거의 나만) 맞은 공격과, 기믹 실패로 붙는 디버프 수.',
      items: [...onlyMe.map(x => `${esc(x.name)}: ${x.hits}번 맞음 (파티 전체 ${x.party}번)`), ...vulns.map(x => `${esc(x.name)}: ${x.n}번`)].concat(mist ? [] : ['혼자 맞은 공격·실수 디버프 없음']) });

    // ---- 제안 ----
    const sugg = [];
    const add = (sev, text, why, g) => sugg.push({ sev, text, why, g });
    deaths.forEach(d => add(3, `${mmss(d.t)}에 「${d.by}」로 사망함. 그 기믹에서 내 롤 위치를 공략 노트로 다시 확인하기.`, '사망 1번 = 그동안의 딜·힐 손실 + 쇠약'));
    interrupted.length && add(interrupted.length >= 3 ? 3 : 2, `시전을 중단해서 시전 기회를 ${interrupted.length}번 잃음. 위치를 미리 잡거나 즉시 시전 기술로 이동 구간을 메우기.`, `전체 약 ${(interrupted.reduce((s, x) => s + x.lost, 0) / 1000).toFixed(1)}초 · ${interrupted.slice(0, 4).map(x => mmss(x.t) + ' ' + nm(x.g)).join(', ')}`, interrupted[0].g);
    if (abc.idle > 5000) add(abc.idle > 15000 ? 3 : 2, `GCD가 끊긴 구간이 있음. 이동 중에도 쓸 수 있는 기술로 GCD를 이어 가기.`, `가장 긴 공백: ${gaps.slice(0, 3).map(x => `${mmss(x.t)} ${(x.d / 1000).toFixed(1)}초`).join(', ')} (보스가 사라진 구간이면 무시)`);
    cds.forEach(c => {
      const miss = c.max - c.uses;
      if (miss > 0) add(miss >= 2 || c.burst ? 3 : 2, `「${nm(c.g)}」을 최대한 자주 사용하기.`, `총 사용 가능 횟수 ${c.max}번 중 ${miss}번 놓침${c.drift > 8000 ? ` · 쿨이 돌아온 뒤 평균 ${Math.round(c.drift / 1000 / Math.max(1, c.uses - 1))}초씩 늦게 누름` : ''}`, c.g);
      if (c.burst && c.first != null && c.first > 15000) add(1, `첫 「${nm(c.g)}」을 ${mmss(c.first)}에 사용함. 보통 시작 후 2~3번째 GCD에 파티 시너지와 같이.`, '첫 버스트가 늦으면 이후 2분 주기도 같이 밀림', c.g);
    });
    weaves.length && add(weaves.length >= 4 ? 2 : 1, `GCD 사이에 능력 기술을 너무 많이 끼워 넣지 않기.`, `GCD가 밀렸을 가능성이 있는 구간 ${weaves.length}번 · ${weaves.slice(0, 4).map(w => `${mmss(w.t)} (${w.n}개)`).join(', ')}`);
    align.filter(a => !a.ok).length && add(2, `2분 버스트를 파티 시너지에 맞추기.`, `시너지 없이 쓴 버스트 ${align.filter(a => !a.ok).length}번: ${align.filter(a => !a.ok).slice(0, 4).map(a => mmss(a.t)).join(', ')}`);
    dots.filter(d => d.up < 0.9).forEach(d => add(2, `「${d.name}」 유지율을 올리기.`, `적용 시간 ${pct(d.up)}`));
    onlyMe.slice(0, 5).forEach(x => add(2, `「${x.name}」 피하기.`, `${x.hits}번 맞음 · 파티 전체 ${x.party}번 → 나만 맞은 공격`, x.guid));
    vulns.forEach(x => add(2, `「${x.name}」이 ${x.n}번 붙음. 원인 기믹 찾기.`, '기믹 실패 때 붙는 디버프', x.guid));
    if (heal && HEALER.test(job) && heal.over > 0.4) add(heal.over > 0.55 ? 2 : 1, 'GCD 힐을 줄이고 능력(무료) 힐·보호막을 먼저 쓰기.', `오버힐 ${pct(heal.over)}`);
    if (!pots.length && dur > 180000 && !HEALER.test(job) && roleOf(job) !== 'L') add(1, '탕약을 쓰지 않음. 첫 버스트와 6분 버스트에 맞춰 쓰기.', '연습 트라이라면 무시해도 됨');
    if (up < 0.9) add(up < 0.8 ? 3 : 2, '항상 무언가를 시전하기.', `GCD 적용 시간 ${pct(up)}`);
    sugg.sort((a, b) => b.sev - a.sev);
    return { abc, cds, align, dots, heal, onlyMe, vulns, deaths, interrupted, weaves, pots, ck, sugg, acts, gcdSet, mine };
  }
  const iconTxt = (S, g) => icon(S, g) ? icon(S, g).replace('<img', '<img style="width:18px;height:18px;border-radius:4px;vertical-align:-4px;margin-right:4px"') : '';

  const sgHtml = S => x => `<div class="sg"><div class="im">${x.g ? icon(S, x.g) || '!' : '!'}</div><div><p>${esc(x.text)}</p><span class="sev s${x.sev}">${['', '참고', '개선이 요구됨', '↑ 중요도: 높음'][x.sev]}</span><span class="why">${esc(x.why || '')}</span></div></div>`;
  function vAn(S) {
    const A = S.A; if (!A) return '<p class="empty">분석할 시전 기록이 없음.</p>';
    return `<section><h3>체크리스트 <small>${esc(tname(S))} · ${esc(jobKo(tjob(S)))}</small></h3>
      ${A.ck.map(c => `<details class="ck ${c.cls}" ${c.cls !== 'ok' ? 'open' : ''}><summary><span class="ic">${c.cls === 'ok' ? '✓' : '✕'}</span><span>${esc(c.title)}</span><span class="v">${pct(c.v)}</span>${bar(c.v, 1)}</summary>
        <div class="bd"><p>${esc(c.desc)}</p><ul>${c.items.map(i => `<li>${c.html ? i : esc(i)}</li>`).join('')}</ul></div></details>`).join('')}</section>
      <section><h3>제안 <small>중요한 것부터</small></h3>${A.sugg.length ? A.sugg.map(sgHtml(S)).join('') : '<p class="empty">제안 없음 — 잘했음.</p>'}</section>
      <p class="meta">GCD는 시전 간격으로 추정함. 보스가 사라지는 구간도 공백으로 셈. 직업별 세부(스킬 순서·게이지 낭비)는 xivanalysis 버튼으로.</p>`;
  }

  /* ---------- 딜량 ---------- */
  function vDmg(S) {
    const rows = S.dmgRows.slice().sort((a, b) => b.total - a.total), tot = rows.reduce((s, r) => s + r.total, 0), max = Math.max(1, ...rows.map(r => r.total));
    const ab = S.P ? entries(S.P.R.dmgAb).slice().sort((a, b) => b.total - a.total) : [], abT = ab.reduce((s, x) => s + (x.total || 0), 0), abM = Math.max(1, ...ab.map(x => x.total || 0));
    return `<section><h3>파티 딜량 <small>행을 누르면 그 사람으로 분석</small></h3><table><tr><th>이름</th><th>비율</th><th class="n">총 피해</th><th class="n">DPS</th><th class="n">rDPS</th><th class="n">순위</th><th class="n">활동 시간</th></tr>
      ${rows.map(r => { const rk = S.rank.get(lc(r.name)); return `<tr class="click${r.id === S.target ? ' me' : ''}" data-pp="${r.id}"><td>${jobTag(r.job)}${esc(r.name)}</td><td style="width:28%">${bar(r.total, max, ROLE_C[roleOf(r.job)])}</td><td class="n">${num(r.total)} <span class="meta">${pct(r.total / tot)}</span></td><td class="n">${num(r.dps)}</td><td class="n">${rk ? num(rk.amount) : '-'}</td><td class="n">${rk && rk.pct != null ? Math.round(rk.pct) + '%' : '-'}</td><td class="n">${pct(r.active)}</td></tr>`; }).join('')}</table></section>
      <section><h3>기술별 딜 <small>${esc(tname(S))}</small></h3>${ab.length ? `<table><tr><th>기술</th><th>비율</th><th class="n">총 피해</th><th class="n">횟수</th><th class="n">1회 평균</th><th class="n">극대</th><th class="n">직격</th></tr>
      ${ab.map(x => `<tr><td><span class="ab">${icon(S, x.guid, x.abilityIcon)}${esc(x.name)}</span></td><td style="width:24%">${bar(x.total, abM)}</td><td class="n">${num(x.total)} <span class="meta">${pct(x.total / abT)}</span></td><td class="n">${num(x.hitCount)}</td><td class="n">${num(x.hitCount ? x.total / x.hitCount : null)}</td><td class="n">${x.critHitCount != null && x.hitCount ? pct(x.critHitCount / x.hitCount, 0) : '-'}</td><td class="n">${x.directHitCount != null && x.hitCount ? pct(x.directHitCount / x.hitCount, 0) : '-'}</td></tr>`).join('')}</table>` : '<p class="empty">기록 없음</p>'}</section>`;
  }
  /* ---------- 치유량 ---------- */
  function vHeal(S) {
    const rows = S.healRows.slice().sort((a, b) => b.total - a.total), max = Math.max(1, ...rows.map(r => r.total));
    const ab = S.P ? entries(S.P.R.healAb).slice().sort((a, b) => b.total - a.total) : [], abM = Math.max(1, ...ab.map(x => (x.total || 0) + (x.overheal || 0)));
    return `<section><h3>파티 치유량</h3><table><tr><th>이름</th><th>치유 / 오버힐</th><th class="n">총 치유</th><th class="n">HPS</th><th class="n">오버힐</th></tr>
      ${rows.map(r => `<tr class="click${r.id === S.target ? ' me' : ''}" data-pp="${r.id}"><td>${jobTag(r.job)}${esc(r.name)}</td><td style="width:30%"><div class="bar"><u style="width:${(r.total / max * 100).toFixed(1)}%;background:#2e9e55"></u></div></td><td class="n">${num(r.total)}</td><td class="n">${num(r.hps)}</td><td class="n">${pct(r.over / (r.over + r.total || 1))}</td></tr>`).join('')}</table></section>
      <section><h3>기술별 치유 <small>${esc(tname(S))}</small></h3>${ab.length ? `<table><tr><th>기술</th><th>치유(초록) · 오버힐(회색)</th><th class="n">치유</th><th class="n">오버힐</th><th class="n">횟수</th></tr>
      ${ab.map(x => { const o = x.overheal || 0, t = x.total || 0; return `<tr><td><span class="ab">${icon(S, x.guid, x.abilityIcon)}${esc(x.name)}</span></td><td style="width:30%"><div class="bar"><u style="width:${(t / abM * 100).toFixed(1)}%;background:#2e9e55"></u><u style="left:${(t / abM * 100).toFixed(1)}%;width:${(o / abM * 100).toFixed(1)}%;background:#b9b6c3;border-radius:0 5px 5px 0"></u></div></td><td class="n">${num(t)}</td><td class="n">${pct(o / (o + t || 1))}</td><td class="n">${num(x.hitCount)}</td></tr>`; }).join('')}</table>` : '<p class="empty">치유 기록 없음</p>'}</section>`;
  }
  /* ---------- 받은 피해 ---------- */
  function vTaken(S) {
    const ab = S.takenAb.slice().sort((a, b) => b.total - a.total), m = Math.max(1, ...ab.map(x => x.total));
    const by = S.takenBy.slice().sort((a, b) => b.total - a.total), mb = Math.max(1, ...by.map(x => x.total));
    const mine = S.A ? new Map(S.A.mine.map(x => [x.name, x])) : new Map(), only = new Set(S.A ? S.A.onlyMe.map(x => x.name) : []);
    return `<div class="two"><section><h3>기술별 <small>파티 전체 · 빨간 줄 = ${esc(tname(S))}만 맞은 공격</small></h3><table><tr><th>기술</th><th>비율</th><th class="n">총 피해</th><th class="n">파티 맞은 횟수</th><th class="n">${esc(tname(S))}</th></tr>
      ${ab.map(x => `<tr ${only.has(x.name) ? 'style="box-shadow:inset 3px 0 0 #d6113f"' : ''}><td><span class="ab">${icon(S, x.guid, x.icon)}${esc(x.name)}</span></td><td style="width:22%">${bar(x.total, m, '#d24545')}</td><td class="n">${num(x.total)}</td><td class="n">${x.hits}</td><td class="n">${mine.has(x.name) ? mine.get(x.name).hits : 0}</td></tr>`).join('')}</table></section>
      <section><h3>사람별</h3><table>${by.map(r => `<tr class="click${r.id === S.target ? ' me' : ''}" data-pp="${r.id}"><td>${jobTag(r.job)}${esc(r.name)}</td><td style="width:45%">${bar(r.total, mb, ROLE_C[roleOf(r.job)])}</td><td class="n">${num(r.total)}</td></tr>`).join('')}</table></section></div>`;
  }
  /* ---------- 사망 ---------- */
  function vDeath(S) {
    if (!S.deaths.length) return '<section><h3>사망</h3><p class="empty">이 전투에서 아무도 죽지 않음.</p></section>';
    return `<section><h3>사망 <small>${S.deaths.length}번</small></h3><table><tr><th class="n">시간</th><th>이름</th><th>죽인 공격</th></tr>
      ${S.deaths.slice().sort((a, b) => a.t - b.t).map(d => `<tr class="click${d.id === S.target ? ' me' : ''}" data-pp="${d.id}"><td class="n">${mmss(d.t)}</td><td>${jobTag(d.job)}${esc(d.name)}</td><td><span class="ab">${d.icon ? `<img data-ic src="${ICON}${esc(d.icon)}" alt="">` : ''}${esc(d.by)}</span></td></tr>`).join('')}</table></section>`;
  }
  /* ---------- 버프·디버프 ---------- */
  function vAura(S) {
    const P = S.P; const tt = P ? (tdata(P.R.buffs).totalTime || S.dur) : S.dur;
    const bf = P ? entries(P.R.buffs).map(a => ({ name: a.name, guid: a.guid, icon: a.abilityIcon || a.icon, up: (a.totalUptime || 0) / tt, n: a.totalUses, bands: a.bands || [] })).sort((a, b) => b.up - a.up) : [];
    const db = P ? entries(P.R.debuffs).map(a => ({ name: a.name, guid: a.guid, icon: a.abilityIcon || a.icon, up: (a.totalUptime || 0) / tt, n: a.totalUses, bands: a.bands || [] })).sort((a, b) => b.n - a.n) : [];
    const en = S.enemyAuras.slice().sort((a, b) => b.up - a.up);
    const bands = (b, c) => `<div class="bar" style="height:14px">${(b || []).map(x => `<u style="left:${((x.startTime - S.t0) / S.dur * 100).toFixed(2)}%;width:${Math.max(0.3, (x.endTime - x.startTime) / S.dur * 100).toFixed(2)}%;background:${c};border-radius:2px"></u>`).join('')}</div>`;
    const tbl = (rows, c, vuln) => rows.length ? `<table><tr><th>이름</th><th>켜져 있던 구간</th><th class="n">유지율</th><th class="n">횟수</th></tr>${rows.map(a => `<tr ${vuln && VULN.test(a.name) ? 'style="box-shadow:inset 3px 0 0 #d6113f"' : ''}><td><span class="ab">${a.icon ? `<img data-ic src="${ICON}${esc(a.icon)}" alt="">` : ''}${esc(a.name)}</span></td><td style="width:40%">${a.bands.length ? bands(a.bands, c) : bar(a.up, 1, c)}</td><td class="n">${pct(a.up)}</td><td class="n">${num(a.n)}</td></tr>`).join('')}</table>` : '<p class="empty">기록 없음</p>';
    return `<section><h3>버프 <small>${esc(tname(S))}에게 걸린 버프</small></h3>${tbl(bf, '#2e9e55')}</section>
      <section><h3>디버프 <small>${esc(tname(S))}에게 걸린 디버프 · 빨간 줄 = 기믹 실수로 붙는 것</small></h3>${tbl(db, '#d24545', 1)}</section>
      <section><h3>적에게 걸린 디버프 <small>도트·파티 시너지 유지율</small></h3>${tbl(en, '#7b68d6')}</section>`;
  }
  /* ---------- 시전 타임라인 ---------- */
  function vTl(S) {
    const A = S.A; if (!A) return '<p class="empty">시전 기록 없음</p>';
    const PX = 9, L = 150, W = L + Math.ceil(S.dur / 1000 * PX) + 20, nm = g => abName(S, g);
    const ogs = [...new Set(A.acts.filter(a => !a.gcd).map(a => a.g))].sort((a, b) => A.acts.filter(x => x.g === b).length - A.acts.filter(x => x.g === a).length);
    const lanes = [['GCD', A.acts.filter(a => a.gcd)], ...ogs.map(g => [nm(g), A.acts.filter(a => a.g === g)])];
    const RH = 26, top = 24, H = top + lanes.length * RH + 30;
    const X = t => L + t / 1000 * PX;
    let svg = `<svg width="${W}" height="${H}" role="img" aria-label="시전 타임라인">`;
    for (let t = 0; t <= S.dur; t += 10000) svg += `<line x1="${X(t)}" x2="${X(t)}" y1="${top - 6}" y2="${H - 20}" stroke="currentColor" opacity="${t % 60000 ? .05 : .15}"/>${t % 30000 ? '' : `<text x="${X(t)}" y="14" text-anchor="middle">${mmss(t)}</text>`}`;
    // 파티 시너지 구간(20초) 배경
    S.raid.forEach(r => { svg += `<rect x="${X(r.t)}" y="${top - 4}" width="${20 * PX}" height="${lanes.length * RH + 4}" fill="#e5a400" opacity=".09"><title>${esc(nm(r.id))} ${mmss(r.t)}</title></rect>`; });
    A.abc.gaps.forEach(g => { svg += `<rect x="${X(g.t)}" y="${top}" width="${g.d / 1000 * PX}" height="${RH - 6}" fill="#d6113f" opacity=".18"><title>GCD 공백 ${(g.d / 1000).toFixed(1)}초</title></rect>`; });
    lanes.forEach(([n, arr], i) => {
      const y = top + i * RH;
      svg += `<text x="8" y="${y + 15}">${esc(n.length > 14 ? n.slice(0, 13) + '…' : n)}</text><line x1="${L}" x2="${W}" y1="${y + RH - 3}" y2="${y + RH - 3}" stroke="currentColor" opacity=".06"/>`;
      arr.forEach(a => { const w = i === 0 ? Math.max(4, Math.min(A.abc.gcd, (a.end - a.t) || A.abc.gcd) / 1000 * PX - 2) : 6;
        svg += `<rect x="${X(a.t)}" y="${y + 3}" width="${w}" height="${RH - 9}" rx="3" fill="${i === 0 ? '#7b68d6' : BURST.has(a.g) ? '#e5a400' : '#3f7fd6'}"><title>${mmss(a.t)} ${esc(nm(a.g))}</title></rect>`; });
    });
    A.interrupted.forEach(x => { svg += `<text x="${X(x.t)}" y="${top + 15}" fill="#d6113f" style="fill:#d6113f;font-weight:900">✕<title>${mmss(x.t)} ${esc(nm(x.g))} 시전 끊김</title></text>`; });
    S.deaths.filter(d => d.id === S.target).forEach(d => { svg += `<line x1="${X(d.t)}" x2="${X(d.t)}" y1="${top - 6}" y2="${H - 20}" stroke="#d6113f" stroke-width="2"><title>사망 ${mmss(d.t)} · ${esc(d.by)}</title></line>`; });
    svg += '</svg>';
    const cnt = [...new Set(A.acts.map(a => a.g))].map(g => { const u = A.acts.filter(a => a.g === g); return { g, n: u.length, first: u[0].t, gcd: A.gcdSet.has(g) }; }).sort((a, b) => b.n - a.n);
    return `<section><h3>시전 타임라인 <small>${esc(tname(S))} · 보라 = GCD · 노랑 = 버스트 · 파랑 = 능력 · 빨간 칸 = GCD 공백 · ✕ = 시전 끊김 · 노란 배경 = 파티 시너지</small></h3><div class="tl">${svg}</div></section>
      <section><h3>기술별 사용 횟수</h3><table><tr><th>기술</th><th>종류</th><th class="n">횟수</th><th class="n">첫 사용</th></tr>${cnt.map(c => `<tr><td><span class="ab">${icon(S, c.g)}${esc(nm(c.g))}</span></td><td>${c.gcd ? 'GCD' : '능력'}</td><td class="n">${c.n}</td><td class="n">${mmss(c.first)}</td></tr>`).join('')}</table></section>`;
  }

  window.JamFight = { open };
})();
