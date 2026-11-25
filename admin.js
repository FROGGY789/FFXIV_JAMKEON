/* admin.js — 관리자 로그인 + 사진 저장
 *
 * 정적 사이트(GitHub Pages)라서 서버가 없음. 대신 관리자는 GitHub 토큰으로 로그인하고,
 * 사진 칸(<image-slot>)에 넣은 사진은 저장소 gh-pages 브랜치의 .image-slots.state.json 에
 * 바로 커밋됨. 사이트 반영까지 1~2분.
 *
 * - 토큰은 관리자 브라우저(localStorage)에만 저장됨.
 * - 토큰 권한: 이 저장소만, Contents: Read and write.
 * - image-slot.js 보다 먼저 불러와야 함 (fetch 가로채기 때문).
 */
(function () {
  'use strict';
  const REPO = 'FROGGY789/FFXIV_JAMKEON';
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
    async function put(name, content, retry = 1) {
      toast('저장 중…');
      const cur = await gh(`/contents/${encodeURIComponent(name)}?ref=${BRANCH}`);
      const sha = cur.ok ? (await cur.json()).sha : undefined;
      const r = await gh(`/contents/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '사진 업데이트', content: b64(content), branch: BRANCH, sha })
      });
      if (r.status === 409 && retry) return put(name, content, retry - 1);
      if (r.status === 401) { logout(true); throw new Error('토큰이 만료되었거나 잘못됨'); }
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || r.status);
    }
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
      new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
      scan();
    }
  }

  function openLogin() {
    const d = document.createElement('dialog'); d.className = 'adm';
    d.innerHTML = `<form method="dialog">
<h2>관리자 로그인</h2>
<p>GitHub 토큰으로 로그인함. 로그인하면 사진 칸에 사진을 올릴 수 있고, 저장소에 바로 저장됨.</p>
<p>토큰 만들기: GitHub → Settings → Developer settings → <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Fine-grained tokens</a>
→ Repository access: <b>${REPO}</b>만 선택 → Permissions: <b>Contents · Read and write</b>.</p>
<input type="password" autocomplete="off" placeholder="github_pat_…" aria-label="GitHub 토큰" required>
<div class="err" aria-live="polite"></div>
<div class="row"><button type="button" value="cancel">취소</button><button class="pri" type="submit">로그인</button></div>
</form>`;
    document.body.appendChild(d);
    const inp = d.querySelector('input'), err = d.querySelector('.err');
    d.querySelector('button[value=cancel]').addEventListener('click', () => d.close());
    d.addEventListener('close', () => d.remove());
    d.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const t = inp.value.trim(); if (!t) return;
      err.textContent = '확인 중…';
      try {
        const r = await fetch(API, { headers: { Authorization: 'Bearer ' + t }, cache: 'no-store' });
        if (r.status === 401) throw new Error('토큰이 올바르지 않음');
        if (!r.ok) throw new Error('이 저장소에 접근 권한 없음 (' + r.status + ')');
        const j = await r.json();
        if (!j.permissions || !j.permissions.push) throw new Error('쓰기 권한(Contents: Read and write) 없음');
        localStorage.setItem(KEY, t);
        location.reload();
      } catch (ex) { err.textContent = ex.message; }
    });
    d.showModal(); inp.focus();
  }

  if (document.body) boot(); else addEventListener('DOMContentLoaded', boot);
})();
