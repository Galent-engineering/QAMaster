// A tiny app to crawl, with the traps a real one has. No dependencies.
//
//   node tests/fixtures/crawl/app.mjs        prints {"ui": "http://localhost:<port>/", "api": "http://localhost:<port>/"}
//
// The UI and its API run on two ports, like the Real World App. Every write the API receives (anything but GET, HEAD,
// OPTIONS) is recorded; GET <api>/__writes lists them, so a test can prove a crawl changed nothing.
// Test account (fixture only): qa@example.test / qa-password.
import http from 'node:http';

const writes = [];
const page = (title, body) =>
  `<!doctype html><html><head><title>${title}</title></head><body>
<nav><a href="/">Home</a> <a href="/orders">Orders</a> <a href="/settings">Settings</a>
<a href="/notifications">Notifications</a> <a href="/#/help">Help</a> <a href="/logout">Log out</a></nav>
<h1>${title}</h1>${body}</body></html>`;

const signedIn = (req) => /(?:^|;\s*)sid=ok/.test(req.headers.cookie || '');
const body = (req) => new Promise((done) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => done(b)); });

function ui(api) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (status, html, headers = {}) => res.writeHead(status, { 'content-type': 'text/html', ...headers }).end(html);
    if (url.pathname === '/login') {
      if (req.method === 'POST') {
        const form = new URLSearchParams(await body(req));
        if (form.get('username') === 'qa@example.test' && form.get('password') === 'qa-password') {
          return send(302, '', { location: '/', 'set-cookie': 'sid=ok; Path=/' });
        }
        return send(200, page('Sign in', '<p role="alert">Invalid username or password</p>'));
      }
      return send(200, `<!doctype html><title>Sign in</title><h1>Sign in</h1><form method="post" action="/login">
<input name="username" autocomplete="username"><input name="password" type="password"><button type="submit">Sign in</button></form>`);
    }
    if (!signedIn(req)) return send(302, '', { location: '/login' });
    switch (url.pathname) {
      case '/':
        return send(200, page('Home', `<a href="/report" target="_blank">Open report</a>
<button id="filters" onclick="document.getElementById('dlg').showModal()">Filters</button>
<dialog id="dlg"><h2>Filter orders</h2><input name="status"><button onclick="this.closest('dialog').close()">Close</button></dialog>
<button onclick="fetch('${api}orders', {method: 'DELETE'})">Delete all orders</button>
<div id="help"></div><script>if (location.hash === '#/help') document.getElementById('help').textContent = 'Help';</script>`));
      case '/orders':
        return send(200, page('Orders', `<a href="/orders/101">Order 101</a> <a href="/orders/102">Order 102</a> <a href="/old-orders">Old</a>
<script>fetch('${api}orders').then((r) => r.json())</script>`));
      case '/orders/101':
      case '/orders/102':
        return send(200, page('Order', `<form id="note" method="post" action="/orders/note"><textarea name="note" required></textarea>
<button type="submit">Add note</button></form> <a href="/broken">Invoice</a>`));
      case '/old-orders':
        return send(302, '', { location: '/orders' });
      case '/broken':
        return send(500, page('Server error', '<p>Something went wrong</p>'));
      case '/report':
        return send(200, page('Report', '<p>Monthly report</p>'));
      case '/settings':
        // An email field and no password: AQE's crawler takes this for step 1 of a sign-in and submits it.
        return send(200, page('Settings', `<form id="profile" onsubmit="event.preventDefault();
fetch('${api}users/me', {method: 'PATCH', headers: {'content-type': 'application/json'},
body: JSON.stringify({email: this.email.value})})"><label>Email <input name="email" type="email" value="qa@example.test"></label>
<label>First name <input name="firstName" value="Quinn"></label><button type="submit">Save</button></form>`));
      case '/notifications':
        // "Dismiss" isn't in AQE's deny list, and the API is on another port, outside its write guard.
        return send(200, page('Notifications', `<ul><li>Payment received
<button onclick="fetch('${api}notifications/1', {method: 'PATCH'})">Dismiss</button></li></ul>`));
      case '/logout':
        return send(302, '', { location: '/login', 'set-cookie': 'sid=; Max-Age=0; Path=/' });
      default:
        return send(404, page('Not found', ''));
    }
  });
}

const apiServer = http.createServer(async (req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE', 'access-control-allow-headers': 'content-type' };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  if (req.url === '/__writes') return res.writeHead(200, { 'content-type': 'application/json', ...cors }).end(JSON.stringify(writes));
  if (!['GET', 'HEAD'].includes(req.method)) writes.push({ method: req.method, path: req.url, body: await body(req) });
  res.writeHead(200, { 'content-type': 'application/json', ...cors }).end(req.url === '/orders' ? '[{"id":101,"total":12}]' : '{}');
});

apiServer.listen(0, () => {
  const api = `http://localhost:${apiServer.address().port}/`;
  const uiServer = ui(api).listen(0, () => {
    process.stdout.write(`${JSON.stringify({ ui: `http://localhost:${uiServer.address().port}/`, api })}\n`);
  });
});
