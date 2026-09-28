// Sub-path the site is served under ("" on the custom domain, "/ARLCOIN" on the GitHub Pages
// project URL). Next.js adds it to its own links and assets; the Core's History API navigation
// and plain anchors add it here.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Site path → URL path. */
export function withBase(path: string): string {
  return BASE_PATH ? (path === "/" ? `${BASE_PATH}/` : `${BASE_PATH}${path}`) : path;
}

/** URL path → site path. */
export function stripBase(pathname: string): string {
  if (!BASE_PATH || !pathname.startsWith(BASE_PATH)) return pathname;
  return pathname.slice(BASE_PATH.length) || "/";
}
