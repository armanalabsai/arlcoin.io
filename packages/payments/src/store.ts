// A durable AuthorizationStore for one facilitator process: every state change is appended to a
// file and flushed to disk before it is acknowledged, and the file is replayed at start-up. A
// restart therefore never forgets an authorization that was settled, retired or being settled.
//
// It is for a single process. Several instances must share one store with an atomic
// compare-and-set (for example a database row with a unique key).

import {
  closeSync,
  constants,
  fsyncSync,
  ftruncateSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";

import type { AuthorizationState, AuthorizationStore } from "./policy.ts";

const STATES = new Set<AuthorizationState>(["settling", "settled", "retired", "failed"]);

export class FileAuthorizationStore implements AuthorizationStore {
  /** One descriptor for the store's lifetime: every read, truncation and append goes through it,
   *  so nothing can swap the file between a check and a write. */
  readonly #fd: number;
  readonly #records = new Map<string, AuthorizationState>();
  /** Byte length of the file: the position of the next append. */
  #size = 0;

  constructor(path: string) {
    // Created if missing, readable and writable. Not opened in append mode: on Windows an
    // append-mode descriptor cannot be truncated, so every write is placed at #size instead.
    this.#fd = openSync(path, constants.O_RDWR | constants.O_CREAT, 0o600);
    const text = readFileSync(this.#fd, "utf8");
    this.#size = Buffer.byteLength(text);
    let offset = 0;
    let line = 0;
    while (offset < text.length) {
      line++;
      const end = text.indexOf("\n", offset);
      const raw = text.slice(offset, end === -1 ? text.length : end);
      let entry: { key?: unknown; state?: unknown } | undefined;
      try {
        entry = JSON.parse(raw) as typeof entry;
      } catch {
        entry = undefined;
      }
      if (end === -1 && entry === undefined) {
        // A last record cut short by a crash was never acknowledged: drop it, so the next record
        // starts on a clean line.
        this.#size = Buffer.byteLength(text.slice(0, offset));
        ftruncateSync(this.#fd, this.#size);
        break;
      }
      const state = entry?.state as AuthorizationState;
      if (typeof entry?.key !== "string" || !STATES.has(state)) {
        closeSync(this.#fd);
        throw new Error(`${path}: line ${String(line)} is not a record`);
      }
      this.#records.set(entry.key, state);
      if (end === -1) {
        // A complete last record without its newline: add it before appending.
        this.#write("\n");
        break;
      }
      offset = end + 1;
    }
    // A settlement that was in progress when the process stopped may or may not have reached the
    // chain. It stays recorded as `settling`, so it is never sent again.
  }

  #write(text: string) {
    const bytes = Buffer.from(text, "utf8");
    let done = 0;
    while (done < bytes.length) {
      done += writeSync(this.#fd, bytes, done, bytes.length - done, this.#size + done);
    }
    this.#size += bytes.length;
  }

  #append(key: string, state: AuthorizationState) {
    this.#write(`${JSON.stringify({ key, state })}\n`);
    fsyncSync(this.#fd);
    this.#records.set(key, state);
  }

  /** Releases the file. The store must not be used afterwards. */
  close(): void {
    closeSync(this.#fd);
  }

  get(key: string): Promise<AuthorizationState | undefined> {
    return Promise.resolve(this.#records.get(key));
  }

  claim(key: string, state: AuthorizationState): Promise<void> {
    const existing = this.#records.get(key);
    if (existing) return Promise.reject(new Error(`authorization ${key} already ${existing}`));
    this.#append(key, state);
    return Promise.resolve();
  }

  finish(key: string, state: Exclude<AuthorizationState, "settling">): Promise<void> {
    if (this.#records.get(key) !== "settling") {
      return Promise.reject(new Error(`authorization ${key} is not being settled`));
    }
    this.#append(key, state);
    return Promise.resolve();
  }
}
