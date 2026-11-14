// Optional model answers for questions the knowledge base does not match. Runs only when the
// Worker has an NVIDIA_API_KEY secret; without it the assistant answers from knowledge.ts alone.
//
// The model sees only the knowledge base and the question. Its answer is checked before it is
// sent: any contract address or link that is not in the knowledge base is removed, so a made-up
// address can never reach the group, and the length is capped.

import { KNOWLEDGE } from "./knowledge.ts";

export const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
export const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const TIMEOUT_MS = 20_000;
export const MAX_ANSWER = 900;

const SYSTEM = `You are the assistant of ARL Protocol's Telegram community. Answer using ONLY the
facts below. If the answer is not in the facts, say you are not sure and point to
team@arlcoin.io. Never discuss price, returns or investment advice. Never invent contract
addresses, links, dates, partners or listings. Never ask for keys, seed phrases or payments.
Keep it short: at most 5 sentences, plain text, no Markdown. Reply in the language of the
question. Put the final answer between <answer> and </answer>.

FACTS:
${KNOWLEDGE}`;

const ADDRESS = /0x[0-9a-fA-F]{40}/g;
const URL_RE = /https?:\/\/[^\s)]+/g;

/** Addresses and links that appear in the knowledge base. */
function allowed(re: RegExp): Set<string> {
  return new Set([...KNOWLEDGE.matchAll(re)].map((m) => m[0].toLowerCase()));
}
const ALLOWED_ADDRESSES = allowed(ADDRESS);
const ALLOWED_URLS = allowed(URL_RE);
/** A bare domain such as example.com/path, which a model may write without https://. */
const BARE_DOMAIN = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?/gi;
const ALLOWED_HOSTS = new Set([
  "arlcoin.io",
  "github.com",
  "t.me",
  "x.com",
  "basescan.org",
  "npmjs.com",
  "www.npmjs.com",
  "pypi.org",
]);
const hostOf = (s: string) =>
  s
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    ?.toLowerCase() ?? "";

/** Strip reasoning, unknown addresses and links, and cap the length. */
export function sanitize(raw: string): string {
  const tagged = [...raw.matchAll(/<answer>([\s\S]*?)<\/answer>/g)].map((m) => m[1]?.trim() ?? "");
  let text = tagged.filter((t) => t.length > 0).pop() ?? raw;
  // Drop a reasoning block, then every angle bracket: the answer is plain text, so no tag
  // (or tag fragment left by a partial match) can survive.
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/[<>]/g, "");
  text = text.replace(ADDRESS, (a) =>
    ALLOWED_ADDRESSES.has(a.toLowerCase()) ? a : "[see /contracts]",
  );
  text = text.replace(URL_RE, (u) => (ALLOWED_URLS.has(u.toLowerCase()) ? u : "[see /links]"));
  text = text.replace(BARE_DOMAIN, (d) => (ALLOWED_HOSTS.has(hostOf(d)) ? d : "[see /links]"));
  text = text.replace(/[*_`#]+/g, "").trim();
  if (text.length > MAX_ANSWER) text = `${text.slice(0, MAX_ANSWER - 3).trimEnd()}...`;
  return text;
}

/** A grounded model answer, or null if the model is not configured or fails. */
export async function modelAnswer(
  question: string,
  apiKey: string | undefined,
  model: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const res = await fetchFn(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        temperature: 0.1,
        max_tokens: 600,
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: question.slice(0, 500) },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = sanitize(body.choices?.[0]?.message?.content ?? "");
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
