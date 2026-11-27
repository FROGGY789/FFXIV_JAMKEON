/* admin.js — 관리자 로그인 + 사진 저장
 *
 * 정적 사이트(GitHub Pages)라서 서버가 없음. 관리자는 비밀번호로 로그인하고(비밀번호로 잠근 GitHub 토큰을 품),
 * 사진 칸(<image-slot>)에 넣은 사진은 저장소 gh-pages 브랜치의 .image-slots.state.json 에
 * 바로 커밋됨. 사이트 반영까지 1~2분.
 *
 * - 로그인하면 풀린 토큰은 그 브라우저(localStorage)에만 저장됨.
 * - 토큰 권한: 이 저장소만, Contents: Read and write.
 * - image-slot.js 보다 먼저 불러와야 함 (fetch 가로채기 때문).
 */
(function () {
  'use strict';
  // 저장소: GitHub Pages 주소(아이디.github.io/저장소/)에서 알아냄 → 저장소 이름을 바꿔도 코드 수정 없이 동작
  const REPO = (() => {
    const h = location.hostname, seg = location.pathname.split('/').filter(Boolean)[0];
    if (/\.github\.io$/i.test(h) && seg) return h.split('.')[0] + '/' + seg;
    return 'FROGGY789/survival_diary';
  })();
  const BRANCH = 'gh-pages';
  const STATE = '.image-slots.state.json';
  const KEY = 'jamkeon.adminToken';
  const API = `https://api.github.com/repos/${REPO}`;

  let token = null;
  try { token = localStorage.getItem(KEY); } catch (e) {}

  const gh = (path, opts = {}) => fetch(API + path, Object.assign({}, opts, {
    cache: 'no-store',
    headers: Object.assign({ Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' }, opts.headers || {})
  }));

  /* ---------- 로그인 상태: 사진 데이터를 저장소에서 바로 읽고, 쓰기 연결 ---------- */
  if (token) {
    // Pages 캐시(최대 10분) 때문에 방금 저장한 사진이 사라져 보이지 않게, 관리자는 API에서 최신본을 읽음
    const origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        const u = new URL(typeof input === 'string' ? input : input.url, document.baseURI);
        if (u.origin === location.origin && u.pathname.endsWith('/' + STATE)) {
          return gh(`/contents/${STATE}?ref=${BRANCH}`, { headers: { Accept: 'application/vnd.github.raw+json' } })
            .then(r => r.ok ? r : origFetch(input, init));
        }
      } catch (e) {}
      return origFetch(input, init);
    };

    const pending = {}; let timer = null, busy = false;
    const writeFile = (name, content) => {
      pending[name] = content;
      clearTimeout(timer);
      timer = setTimeout(flush, 1200);
      toast('저장 대기 중…');
      return Promise.resolve();
    };
    window.omelette = Object.assign(window.omelette || {}, { writeFile });
    addEventListener('beforeunload', e => { if (Object.keys(pending).length || busy) { e.preventDefault(); e.returnValue = ''; } });

    async function flush() {
      if (busy) { timer = setTimeout(flush, 800); return; }
      const names = Object.keys(pending); if (!names.length) return;
      busy = true;
      try {
        for (const name of names) {
          const content = pending[name]; delete pending[name];
          await put(name, content);
        }
        toast('저장됨 · 사이트 반영까지 1~2분', 4000);
      } catch (e) {
        toast('저장 실패: ' + e.message, 8000);
      } finally { busy = false; }
    }
    async function put(name, content, message = '사진 업데이트', retry = 1) {
      toast('저장 중…');
      const cur = await gh(`/contents/${encodeURIComponent(name)}?ref=${BRANCH}`);
      const sha = cur.ok ? (await cur.json()).sha : undefined;
      const r = await gh(`/contents/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, content: b64(content), branch: BRANCH, sha })
      });
      if (r.status === 409 && retry) return put(name, content, message, retry - 1);
      if (r.status === 401) { logout(true); throw new Error('토큰이 만료되었거나 잘못됨'); }
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || r.status);
    }

    // 다른 스크립트(arena3d.js 기믹 편집)용
    window.JamAdmin = {
      on: true,
      // 파일 내용(텍스트). ref = 커밋 sha (없으면 최신). 파일 없으면 null
      async get(name, ref) {
        const r = await gh(`/contents/${encodeURIComponent(name)}?ref=${ref || BRANCH}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('읽기 실패 (' + r.status + ')');
        return r.text();
      },
      async save(name, content, message, okMsg) { await put(name, content, message); toast(okMsg || '저장됨 · 사이트 반영까지 1~2분', 3000); },
      read: name => readFresh(name),
      // 그 파일의 커밋 목록 (최신순)
      async history(name) {
        const r = await gh(`/commits?path=${encodeURIComponent(name)}&sha=${BRANCH}&per_page=40`);
        if (!r.ok) throw new Error('이력 읽기 실패 (' + r.status + ')');
        return (await r.json()).map(c => ({ sha: c.sha, date: c.commit.author.date, msg: c.commit.message.split('\n')[0] }));
      }
    };
  } else {
    window.JamAdmin = { on: false, login: () => openLogin(), read: name => readFresh(name) };
  }

  // 누구나: 저장소(gh-pages)에서 최신 파일을 바로 읽음. Pages 반영(1~2분)을 안 기다려도 됨. 실패하면 Pages 파일
  async function readFresh(name) {
    try {
      const h = { Accept: 'application/vnd.github.raw+json' };
      if (token) h.Authorization = 'Bearer ' + token;
      const r = await fetch(`${API}/contents/${encodeURIComponent(name)}?ref=${BRANCH}&t=${Date.now()}`, { headers: h, cache: 'no-store' });
      if (r.status === 404) return null;
      if (r.ok) return await r.text();
    } catch (e) {}
    try { const r = await fetch(name, { cache: 'no-cache' }); return r.ok ? await r.text() : null; } catch (e) { return null; }
  }
  function b64(str) {
    const bytes = new TextEncoder().encode(str); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function logout(silent) {
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (!silent) location.reload();
  }

  /* ---------- UI ---------- */
  const css = `
.adm-fab{position:fixed;right:14px;bottom:14px;z-index:50;display:flex;gap:6px;align-items:center;font:600 12px/1 "Pretendard Variable",Pretendard,system-ui,sans-serif;
  padding:8px 12px;min-height:34px;border-radius:999px;border:1px solid var(--line,#dddbe2);background:color-mix(in srgb,var(--bg,#f6f5f8) 88%,transparent);color:var(--sub,#6f6c78);cursor:pointer;backdrop-filter:blur(6px)}
.adm-fab:hover{color:var(--ink,#16151a)}
.adm-fab.on{background:var(--ink,#16151a);color:var(--bg,#f6f5f8);border-color:transparent}
.adm-fab i{width:7px;height:7px;border-radius:50%;background:#3fbf7f}
.adm-toast{position:fixed;left:50%;bottom:18px;translate:-50% 0;z-index:60;background:var(--ink,#16151a);color:var(--bg,#f6f5f8);font:600 13px/1.4 "Pretendard Variable",Pretendard,system-ui,sans-serif;padding:9px 14px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);display:none;max-width:calc(100vw - 32px)}
dialog.adm{border:0;border-radius:18px;padding:22px;width:min(420px,calc(100vw - 32px));background:var(--bg,#f6f5f8);color:var(--ink,#16151a);font:14px/1.6 "Pretendard Variable",Pretendard,system-ui,sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.3)}
dialog.adm::backdrop{background:rgba(10,12,20,.45)}
dialog.adm h2{margin:0 0 6px;font-size:19px;font-weight:800}
dialog.adm p{margin:0 0 10px;color:var(--sub,#6f6c78);font-size:13px}
dialog.adm input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--line,#dddbe2);background:var(--card,#ececef);color:inherit;font:inherit}
dialog.adm .row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
dialog.adm button{border:0;border-radius:10px;padding:10px 14px;font:inherit;font-weight:700;cursor:pointer;background:var(--card,#ececef);color:inherit}
dialog.adm button.pri{background:var(--ink,#16151a);color:var(--bg,#f6f5f8)}
dialog.adm .err{color:#c0392b;font-size:13px;margin-top:8px;min-height:1em}
dialog.adm a{color:inherit}
html.adm-on image-slot{outline:2px dashed color-mix(in srgb,var(--accent,#a597e3) 70%,transparent);outline-offset:-2px;cursor:copy}
`;
  let toastEl, toastT;
  function toast(msg, ms) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.style.display = 'block';
    clearTimeout(toastT); if (ms) toastT = setTimeout(() => { toastEl.style.display = 'none'; }, ms);
  }

  function boot() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    toastEl = document.createElement('div'); toastEl.className = 'adm-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl);

    const fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'adm-fab' + (token ? ' on' : '');
    fab.innerHTML = token ? '<i></i>관리자 · 로그아웃' : '관리자';
    fab.title = token ? '사진 칸에 이미지를 끌어다 놓거나 클릭해서 올림' : '관리자 로그인';
    fab.addEventListener('click', () => token ? (confirm('관리자 로그아웃?') && logout()) : openLogin());
    document.body.appendChild(fab);

    if (token) {
      document.documentElement.classList.add('adm-on');
      // 사진 칸 클릭이 카드 클릭(뒤집기·페이지 이동)으로 번지지 않게
      const guard = el => {
        if (el.__adm) return; el.__adm = 1;
        ['click', 'dblclick'].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
        const box = el.parentElement; if (box && getComputedStyle(box).pointerEvents === 'none') box.style.pointerEvents = 'auto';
      };
      const scan = () => document.querySelectorAll('image-slot').forEach(guard);
      // 사진 칸의 Replace 버튼: 원래 디자인 툴이 처리하는 신호라, 여기서 파일 선택 창을 직접 열어줌
      document.addEventListener('image-slot:pick', e => {
        const el = e.target && e.target.closest ? e.target.closest('image-slot') : null;
        if (el && el.openFilePicker) el.openFilePicker();
      });
      new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
      scan();
    }
  }

  /* ---------- 비밀번호 잠금 ----------
   * GitHub 토큰을 비밀번호로 암호화(AES-GCM, PBKDF2)해서 gh-pages 의 admin-key.json 에 저장.
   * 로그인 = 비밀번호로 토큰 복호화. 파일은 공개라서 비밀번호가 짧으면 뚫릴 수 있음 → 길게 쓸 것. */
  const KEYFILE = 'admin-key.json', ITER = 600000;
  const enc = new TextEncoder();
  const toB64 = u8 => btoa(String.fromCharCode(...u8));
  const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function deriveKey(pw, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function lockToken(tok, pw) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pw, salt, ITER);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(tok)));
    return JSON.stringify({ v: 1, iter: ITER, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) });
  }
  async function unlockToken(pw) {
    const r = await fetch(KEYFILE + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('아직 관리자 비밀번호가 설정 안 됨. 아래 "처음 설정"부터 할 것');
    const j = await r.json();
    const key = await deriveKey(pw, fromB64(j.salt), j.iter);
    try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(j.iv) }, key, fromB64(j.ct))); }
    catch (e) { throw new Error('비밀번호 틀림'); }
  }
  async function checkToken(t) {
    const r = await fetch(API, { headers: { Authorization: 'Bearer ' + t }, cache: 'no-store' });
    if (r.status === 401) throw new Error('GitHub 토큰이 올바르지 않거나 만료됨');
    if (!r.ok) throw new Error('이 저장소에 접근 권한 없음 (' + r.status + ')');
    const j = await r.json();
    if (!j.permissions || !j.permissions.push) throw new Error('토큰에 쓰기 권한(Contents: Read and write) 없음');
  }

  function dialog(html, onSubmit) {
    const d = document.createElement('dialog'); d.className = 'adm';
    d.innerHTML = `<form method="dialog">${html}<div class="err" aria-live="polite"></div>
<div class="row"><button type="button" value="cancel">취소</button><button class="pri" type="submit">확인</button></div></form>`;
    document.body.appendChild(d);
    const err = d.querySelector('.err');
    d.querySelector('button[value=cancel]').addEventListener('click', () => d.close());
    d.addEventListener('close', () => d.remove());
    d.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = d.querySelector('button.pri'); btn.disabled = true; err.textContent = '확인 중…';
      try { await onSubmit(d); } catch (ex) { err.textContent = ex.message; } finally { btn.disabled = false; }
    });
    d.showModal(); const f = d.querySelector('input'); f && f.focus();
    return d;
  }

  function openLogin() {
    const d = dialog(`<h2>관리자 로그인</h2>
<input type="password" name="pw" autocomplete="current-password" placeholder="비밀번호" aria-label="관리자 비밀번호" required>
<p style="margin:10px 0 0"><a href="#" data-setup>처음 설정 / 비밀번호 변경</a></p>`, async d => {
      const t = await unlockToken(d.querySelector('[name=pw]').value);
      await checkToken(t);
      localStorage.setItem(KEY, t); location.reload();
    });
    d.querySelector('[data-setup]').addEventListener('click', e => { e.preventDefault(); d.close(); openSetup(); });
  }

  function openSetup() {
    dialog(`<h2>관리자 비밀번호 설정</h2>
<p>GitHub 토큰은 여기서 한 번만 넣으면 됨. 토큰을 비밀번호로 잠가서 저장소에 저장하고, 이후 관리자는 비밀번호만 입력하면 됨.</p>
<p>토큰 만들기: GitHub → Settings → Developer settings → <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Fine-grained tokens</a>
→ Repository access: <b>${REPO}</b>만 → Permissions: <b>Contents · Read and write</b>.</p>
<input type="password" name="tok" autocomplete="off" placeholder="GitHub 토큰 (github_pat_…)" aria-label="GitHub 토큰" required>
<input type="password" name="pw" autocomplete="new-password" placeholder="새 비밀번호 (8자 이상 권장)" aria-label="새 비밀번호" minlength="4" required style="margin-top:8px">
<input type="password" name="pw2" autocomplete="new-password" placeholder="새 비밀번호 확인" aria-label="새 비밀번호 확인" required style="margin-top:8px">`, async d => {
      const t = d.querySelector('[name=tok]').value.trim(), pw = d.querySelector('[name=pw]').value, pw2 = d.querySelector('[name=pw2]').value;
      if (pw !== pw2) throw new Error('비밀번호 확인이 다름');
      await checkToken(t);
      token = t;
      const body = await lockToken(t, pw);
      const cur = await gh(`/contents/${KEYFILE}?ref=${BRANCH}`);
      const sha = cur.ok ? (await cur.json()).sha : undefined;
      const r = await gh(`/contents/${KEYFILE}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '관리자 비밀번호 설정', content: b64(body), branch: BRANCH, sha }) });
      if (!r.ok) throw new Error('저장 실패: ' + ((await r.json().catch(() => ({}))).message || r.status));
      localStorage.setItem(KEY, t);
      alert('설정 완료. 다른 기기에서는 1~2분 뒤부터 비밀번호로 로그인 가능.');
      location.reload();
    });
  }

  if (document.body) boot(); else addEventListener('DOMContentLoaded', boot);
})();
