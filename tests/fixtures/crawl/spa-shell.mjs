// A single-page app's fallback shell: every path answers 200 with the same page, except /about.
//
//   node tests/fixtures/crawl/spa-shell.mjs        prints {"ui": "http://localhost:<port>/"}
import http from 'node:http';

const html = (title, body) => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
const shell = html(
  'Registry',
  `<nav><a href="/about">About</a></nav><h1>Registry</h1>
<label for="registry">Registry URL</label><input id="registry" name="registry" type="text">
<button type="button">Connect</button> <button type="button">Disconnect</button>`,
);
const about = html('About', '<h1>About</h1><p>Different content, and a button.</p><button type="button">Contact</button>');

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  res.writeHead(200, { 'content-type': 'text/html' }).end(pathname === '/about' ? about : shell);
});
server.listen(0, () => {
  process.stdout.write(`${JSON.stringify({ ui: `http://localhost:${server.address().port}/` })}\n`);
});
