// A static site: every page has the same nav menu but its own title, heading and text (0.4.2 W3).
//
//   node tests/fixtures/crawl/static-site.mjs      prints {"ui": "http://localhost:<port>/"}
import http from 'node:http';

const nav = '<nav><a href="/">Home</a> <a href="/cats.html">Cats</a> <a href="/landscapes.html">Landscapes</a></nav>';
const page = (title, body) =>
  `<!doctype html><html><head><title>${title}</title></head><body>${nav}<h1>${title}</h1><p>${body}</p></body></html>`;
const pages = {
  '/': page('Home', 'Welcome.'),
  '/cats.html': page('Cats', 'Pictures of cats.'),
  '/landscapes.html': page('Landscapes', 'Pictures of landscapes.'),
};

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  const body = pages[pathname];
  res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' }).end(body ?? 'not found');
});
server.listen(0, () => {
  process.stdout.write(`${JSON.stringify({ ui: `http://localhost:${server.address().port}/` })}\n`);
});
