const PAGES_HOST = "theodcastroribeiro.github.io";
const PAGES_BASE = "/presidencial-2026/";
const PUBLIC_API = "https://presidencial-2026-publico.theodcastroribeiro.chatgpt.site";

function usesGitHubPages() {
  return typeof window !== "undefined" && window.location.hostname === PAGES_HOST;
}

/** Keep the same dashboard on both hosts; only read-only API traffic crosses origins. */
export function sitePath(path: string) {
  if (!usesGitHubPages()) return path;
  if (path.startsWith("/api/")) return PUBLIC_API + path;
  if (path.startsWith("/")) return PAGES_BASE + path.slice(1);
  return path;
}

export function siteFetch(path: string, init?: RequestInit) {
  return fetch(sitePath(path), init);
}
