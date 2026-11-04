// A static site as dummy-static-website is: every page has the same menu, the same empty title and the same h1;
// only the paragraph and the images differ (0.4.2 W3).
//
//   node tests/fixtures/crawl/static-site.mjs      prints {"ui": "http://localhost:<port>/"}
import http from 'node:http';

const menu = '<div id="menu"><a href="/">Home</a> <a href="/cats.html">Cats</a> <a href="/landscapes.html">Landscapes</a></div>';
const page = (body) =>
  `<!doctype html><html><head><title></title></head><body>${menu}<h1>Dummy static website</h1><p>${body}</p></body></html>`;
const pages = {
  '/': page('Welcome.'),
  '/cats.html': page('Here, have your daily dose of kittens'),
  '/landscapes.html': page('Here, have some landscapes'),
};

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  const body = pages[pathname];
  res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' }).end(body ?? 'not found');
});
server.listen(0, () => {
  process.stdout.write(`${JSON.stringify({ ui: `http://localhost:${server.address().port}/` })}\n`);
});
