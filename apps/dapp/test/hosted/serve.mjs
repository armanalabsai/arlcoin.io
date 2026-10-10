// Serves a directory staged by scripts/build-site.sh the way Vercel serves arlcoin.io for the
// hosted test: static files, `trailingSlash` (a directory is its index.html), and 404.html for a
// missing page. Usage: node test/hosted/serve.mjs <dir> <port>
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const [dir, port] = process.argv.slice(2);
if (!dir || !port) {
  process.stderr.write("usage: serve.mjs <dir> <port>\n");
  process.exit(2);
}
const root = resolve(dir);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".wasm": "application/wasm",
  ".zkey": "application/octet-stream",
};

function send(res, status, file) {
  res.writeHead(status, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(400).end();
    return;
  }
  if (existsSync(file) && statSync(file).isFile()) return send(res, 200, file);
  if (existsSync(join(file, "index.html"))) {
    if (!path.endsWith("/")) {
      res.writeHead(308, { location: `${path}/` }).end();
      return;
    }
    return send(res, 200, join(file, "index.html"));
  }
  const notFound = join(root, "404.html");
  if (existsSync(notFound)) return send(res, 404, notFound);
  res.writeHead(404).end();
}).listen(Number(port), "127.0.0.1");
