// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver and others that share it) that
// arlcoin.io changed: submits every URL in the live sitemap. The key file is served at
// https://arlcoin.io/<key>.txt (apps/web/public). Run after each production deploy:
//   node scripts/indexnow.mjs
// Google does not use IndexNow; it reads the sitemap through Search Console and robots.txt.

/* global fetch */
import process from "node:process";

const KEY = "b724c1741fd52e966e7dadc12f4b8050";
const HOST = "arlcoin.io";

const sitemap = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urlList.length === 0) throw new Error("sitemap has no URLs");
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList,
  }),
});
process.stdout.write(`IndexNow: ${String(res.status)} for ${String(urlList.length)} URLs` + "
");
if (!res.ok && res.status !== 202) process.exitCode = 1;
