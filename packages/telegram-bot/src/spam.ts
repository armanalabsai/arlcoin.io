// Spam rules, kept free of Telegram types so they can be tested without a network.
//
// State is held in memory of one Worker isolate. A new isolate starts with empty state: flood
// counters start again and members who joined before are no longer treated as new.

// Phrases that appear in wallet-drainer, fake-support and paid-promotion messages.
export const SCAM_PATTERNS = [
  String.raw`\bseed\s*phrase\b`,
  String.raw`\brecovery\s*phrase\b`,
  String.raw`\bsecret\s*phrase\b`,
  String.raw`\bprivate\s*key\b`,
  String.raw`\b(12|24)\s*words?\b`,
  String.raw`\b(dm|inbox|pm)\s*me\b`,
  String.raw`\bsend\s+me\s+a\s+(dm|message)\b`,
  String.raw`\bcheck\s+(your\s+)?(dm|inbox)\b`,
  String.raw`\b(validate|verify|sync|rectify|restore)\s+(your\s+)?wallet\b`,
  String.raw`\bwallet\s*connect\b.*\b(fix|issue|error|validate)\b`,
  String.raw`\bclaim\s+(your\s+)?airdrop\b`,
  String.raw`\bairdrop\s+is\s+live\b`,
  String.raw`\bsupport\s+(team|desk|agent)\b`,
  String.raw`\b(guaranteed|double)\s+(profit|returns?|your)\b`,
  String.raw`\b\d{2,}x\s+(gains?|returns?|profit)\b`,
  String.raw`\b(promote|promotion|listing|audit)\s+(your|the)\s+(project|token|coin)\b`,
  String.raw`\bsend\s+me\s+this\s+post\b`,
];
const SCAM_RE = new RegExp(SCAM_PATTERNS.join("|"), "i");
const LINK_RE =
  /(https?:\/\/|www\.|t\.me\/|telegram\.me\/|\b[a-z0-9-]+\.(com|io|xyz|net|org|app|link|me)\b)/i;

export function isScam(text: string | null | undefined): boolean {
  return Boolean(text) && SCAM_RE.test(text ?? "");
}

export function hasLink(text: string | null | undefined, hasLinkEntity = false): boolean {
  return hasLinkEntity || (Boolean(text) && LINK_RE.test(text ?? ""));
}

export type Clock = () => number;
const nowSeconds: Clock = () => Date.now() / 1000;

/** Sliding window: more than `maxMessages` within `windowSeconds` is a flood. */
export class FloodLimiter {
  readonly events = new Map<string, number[]>();
  readonly maxMessages: number;
  readonly windowSeconds: number;
  readonly maxTracked: number;
  readonly clock: Clock;
  constructor(maxMessages = 5, windowSeconds = 10, maxTracked = 10_000, clock: Clock = nowSeconds) {
    this.maxMessages = maxMessages;
    this.windowSeconds = windowSeconds;
    this.maxTracked = maxTracked;
    this.clock = clock;
  }

  /** Records one message and returns true if the user is now flooding. */
  hit(chatId: number, userId: number): boolean {
    const now = this.clock();
    const key = `${String(chatId)}:${String(userId)}`;
    let q = this.events.get(key);
    if (!q) {
      if (this.events.size >= this.maxTracked) this.prune(now);
      q = [];
      this.events.set(key, q);
    }
    while (q.length && now - (q[0] ?? now) > this.windowSeconds) q.shift();
    q.push(now);
    return q.length > this.maxMessages;
  }

  private prune(now: number): void {
    for (const [k, q] of this.events) {
      const last = q[q.length - 1];
      if (last === undefined || now - last > this.windowSeconds) this.events.delete(k);
    }
    if (this.events.size >= this.maxTracked) this.events.clear();
  }
}

/** Remembers when members joined, to block links and forwards for `probationSeconds`. */
export class NewMembers {
  readonly joinedAt = new Map<string, number>();
  readonly probationSeconds: number;
  readonly maxTracked: number;
  readonly clock: Clock;
  constructor(probationSeconds = 24 * 3600, maxTracked = 50_000, clock: Clock = nowSeconds) {
    this.probationSeconds = probationSeconds;
    this.maxTracked = maxTracked;
    this.clock = clock;
  }

  joined(chatId: number, userId: number): void {
    if (this.joinedAt.size >= this.maxTracked) {
      const now = this.clock();
      for (const [k, t] of this.joinedAt)
        if (now - t >= this.probationSeconds) this.joinedAt.delete(k);
      if (this.joinedAt.size >= this.maxTracked) this.joinedAt.clear();
    }
    this.joinedAt.set(`${String(chatId)}:${String(userId)}`, this.clock());
  }

  onProbation(chatId: number, userId: number): boolean {
    const key = `${String(chatId)}:${String(userId)}`;
    const t = this.joinedAt.get(key);
    if (t === undefined) return false;
    if (this.clock() - t >= this.probationSeconds) {
      this.joinedAt.delete(key);
      return false;
    }
    return true;
  }
}

/** Lets a command answer at most once per `seconds` in a chat, so the bot cannot flood. */
export class Cooldown {
  readonly last = new Map<string, number>();
  readonly seconds: number;
  readonly clock: Clock;
  constructor(seconds = 30, clock: Clock = nowSeconds) {
    this.seconds = seconds;
    this.clock = clock;
  }

  ready(chatId: number, command: string): boolean {
    const now = this.clock();
    const key = `${String(chatId)}:${command}`;
    const last = this.last.get(key);
    if (last !== undefined && now - last < this.seconds) return false;
    if (this.last.size > 10_000) this.last.clear();
    this.last.set(key, now);
    return true;
  }
}

export type Action = "delete" | "scam" | "flood" | null;

/** The action for one group message. */
export function decide(m: {
  text: string | null | undefined;
  isAdmin: boolean;
  isForward: boolean;
  hasLinkEntity: boolean;
  onProbation: boolean;
  flooding: boolean;
}): Action {
  if (m.isAdmin) return null;
  if (m.flooding) return "flood";
  if (isScam(m.text)) return "scam";
  if (m.onProbation && (m.isForward || hasLink(m.text, m.hasLinkEntity))) return "delete";
  return null;
}
