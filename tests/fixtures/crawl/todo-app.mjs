// A small todo app shaped like fastapi-react-app (0.4.3 R5-R8), to crawl with a sign-in:
//
//   node tests/fixtures/crawl/todo-app.mjs     prints {"ui": "http://localhost:<port>/"}
//
// Public: /login (a text link to /register), /register (a sign-up form with limits), /about (shows "Sign in" signed out).
// Private (redirect to /login when signed out; /login and /register redirect to / when signed in): /, /todo (cards with
// no link, a sidebar of divs, an "Add todo" dialog with limits), /todo/<id>, /profile, /signals (clickables without a pointer cursor).
// Public either way: /wrapped (a body with an onclick, a pointer card, a pointer sidebar), /plain and /reports (a nav of
// <a> with no href that navigate by click handler, and a "Sign out" in it).
// Every POST and DELETE is recorded; GET /__writes lists them, so a test can prove a crawl changed nothing.
// /slow shows its content in steps 80 ms apart; /busy changes its DOM until the page is left; /poll starts a request
// that is never answered (a long poll).
// Test account (fixture only): qa@example.test / qa-password.
import http from 'node:http';

const writes = [];
const signedIn = (req) => /(?:^|;\s*)sid=ok/.test(req.headers.cookie || '');
const body = (req) => new Promise((done) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => done(b)); });

const sidebar = `<aside class="sidebar">
<div class="item" style="cursor:pointer" onclick="location.href='/'">Home</div>
<div class="item" style="cursor:pointer" onclick="location.href='/todo'">Todos</div>
<div class="item" style="cursor:pointer" onclick="location.href='/profile'">Profile</div></aside>`;
const page = (title, main, state) =>
  `<!doctype html><html><head><title>Todo App</title></head><body>
<header>${state ? '<a href="/about">About</a> <a href="/logout">Log out</a>' : '<a href="/about">About</a> <a href="/login">Sign in</a>'}</header>
${state ? sidebar : ''}<main><h1>${title}</h1>${main}</main></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (status, html, headers = {}) => res.writeHead(status, { 'content-type': 'text/html', ...headers }).end(html);
  const json = (data) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(data));
  const user = signedIn(req);
  if (url.pathname === '/__writes') return json(writes);
  const raw = req.method === 'GET' || req.method === 'HEAD' ? '' : await body(req);
  // a sign-in is a write too; the crawl signs in with its guard off, so only the sign-in is allowed to appear here
  if (req.method !== 'GET' && req.method !== 'HEAD') writes.push({ method: req.method, path: url.pathname, body: raw });
  if (url.pathname === '/api/todos') return json([{ id: 1, title: 'Buy milk' }, { id: 2, title: 'Walk dog' }, { id: 3, title: 'Write tests' }]);
  if (url.pathname === '/api/poll') return; // never answered
  if (url.pathname.startsWith('/api/')) return json({});
  if (url.pathname === '/login') {
    if (req.method === 'POST') {
      const form = new URLSearchParams(raw);
      if (form.get('username') === 'qa@example.test' && form.get('password') === 'qa-password') {
        return send(302, '', { location: '/', 'set-cookie': 'sid=ok; Path=/' });
      }
      return send(200, page('Sign in', '<p role="alert">Invalid username or password</p>'));
    }
    if (user) return send(302, '', { location: '/' });
    return send(200, page('Sign in', `<form method="post" action="/login"><label>Username <input name="username" autocomplete="username"></label>
<label>Password <input name="password" type="password"></label><button type="submit">Sign in</button></form><a href="/register">Register</a>`));
  }
  if (url.pathname === '/register') {
    if (user) return send(302, '', { location: '/' });
    return send(200, page('Register', `<form method="post" action="/register"><label>Email <input name="email" type="email" required maxlength="60"></label>
<label>Password <input name="password" type="password" required minlength="8" maxlength="32"></label>
<label>Confirm password <input name="confirm" type="password" required minlength="8" maxlength="32"></label>
<button type="submit">Sign up</button></form><a href="/login">Sign in</a>`));
  }
  if (url.pathname === '/about') return send(200, page('About', '<p>A todo app.</p>', user));
  if (url.pathname === '/slow') {
    return send(200, page('Slow', `<div id="steps"></div><script>let n = 0; const t = setInterval(() => { n++;
const b = document.createElement('button'); b.textContent = 'Step ' + n; document.getElementById('steps').append(b); if (n === 5) clearInterval(t); }, 80);</script>`, user));
  }
  if (url.pathname === '/busy') {
    return send(200, page('Busy', `<div id="ticker"></div><script>setInterval(() => { document.getElementById('ticker').textContent = Date.now(); }, 20);</script>`, user));
  }
  if (url.pathname === '/poll') return send(200, page('Poll', `<p>Live.</p><script>fetch('/api/poll');</script>`, user));
  if (url.pathname === '/wrapped') {
    // an app wrapper that closes menus on any click: its onclick must not hide the cards and sidebar items inside it
    return send(200, `<!doctype html><html><head><title>Wrapped</title></head><body onclick="void 0">
<aside><div style="cursor:pointer" onclick="location.href='/plain'">Plain page</div>
<div style="cursor:pointer" onclick="location.href='/reports'">Reports page</div></aside>
<main><h1>Wrapped</h1><div style="cursor:pointer;width:200px;padding:12px" onclick="location.href='/about'">About card</div></main></body></html>`);
  }
  if (url.pathname === '/plain' || url.pathname === '/reports') {
    const title = url.pathname === '/plain' ? 'Plain' : 'Reports';
    return send(200, `<!doctype html><html><head><title>${title}</title></head><body>
<nav><a id="n1">Plain</a> <a id="n2">Reports</a> <a id="n3">Sign out</a></nav><main><h1>${title}</h1></main>
<script>
document.getElementById('n1').addEventListener('click', () => { location.href = '/plain'; });
document.getElementById('n2').addEventListener('click', () => { location.href = '/reports'; });
document.getElementById('n3').addEventListener('click', () => { fetch('/api/session', { method: 'DELETE' }); });
</script></body></html>`);
  }
  if (url.pathname === '/logout') return send(302, '', { location: '/login', 'set-cookie': 'sid=; Max-Age=0; Path=/' });
  if (!user) return send(302, '', { location: '/login' });
  if (url.pathname === '/') return send(200, page('Home', '<p>Welcome back.</p>', true));
  if (url.pathname === '/todo') {
    return send(200, page('Todos', `<button id="add">Add todo</button>
<div class="grid" id="grid"></div>
<script>
fetch('/api/todos').then((r) => r.json()).then((todos) => { for (const t of todos) {
  const card = document.createElement('div'); card.className = 'card'; card.style.cssText = 'cursor:pointer;border:1px solid #888;padding:12px;margin:8px;width:220px';
  card.onclick = () => { location.href = '/todo/' + t.id; };
  card.innerHTML = '<h3>' + t.title + '</h3><span>open</span> ';
  const del = document.createElement('button'); del.textContent = 'Remove'; del.style.cursor = 'pointer';
  del.onclick = (e) => { e.stopPropagation(); fetch('/api/todos/' + t.id, { method: 'DELETE' }); };
  card.append(del); document.getElementById('grid').append(card); } });
document.getElementById('add').onclick = () => {
  const d = document.createElement('div'); d.setAttribute('role', 'dialog'); d.style.cssText = 'position:fixed;top:80px;left:80px;background:#fff;border:2px solid #333;padding:16px;z-index:9';
  d.innerHTML = '<h2>New todo</h2><label>Title <input name="title" required minlength="3" maxlength="50"></label>' +
    '<label>Priority <input name="priority" type="number" min="1" max="5"></label>' +
    '<label>Code <input name="code" pattern="[A-Z]{3}"></label><button type="button" id="cancel">Cancel</button><button type="button" id="save">Save todo</button>';
  document.body.append(d);
  d.querySelector('#cancel').onclick = () => d.remove();
  d.querySelector('#save').onclick = () => fetch('/api/todos', { method: 'POST', body: '{}' });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') d.remove(); }, { once: true });
};
</script>`, true));
  }
  if (/^\/todo\/\d+$/.test(url.pathname)) return send(200, page('Todo detail', '<p>Details.</p><a href="/todo">Back to todos</a>', true));
  if (url.pathname === '/signals') {
    // clickable things with no pointer cursor: a role=link, an onclick attribute, a focusable tile, a destructive one
    return send(200, page('Signals', `<div role="link" tabindex="0" id="s1">Open about</div>
<span onclick="location.href='/profile'">Go profile</span>
<div tabindex="0" id="tile">Open todos</div>
<pre tabindex="0" id="code">${'const answer = 42; // a long focusable code block, not a click target\n'.repeat(4)}</pre>
<div onclick="fetch('/api/todos/1', { method: 'DELETE' })">Trash it</div>
<div role="button" onclick="fetch('/api/todos/1', { method: 'DELETE' })">Delete everything</div>
<script>
document.getElementById('s1').addEventListener('click', () => { location.href = '/about'; });
document.getElementById('tile').addEventListener('click', () => { location.href = '/todo'; });
document.getElementById('code').addEventListener('click', () => { location.href = '/todo/1'; });
</script>`, true));
  }
  if (url.pathname === '/profile') return send(200, page('Profile', '<p>qa@example.test</p>', true));
  return send(404, page('Not found', '', user));
});

server.listen(0, () => {
  process.stdout.write(`${JSON.stringify({ ui: `http://localhost:${server.address().port}/` })}\n`);
});
