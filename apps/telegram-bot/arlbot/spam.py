"""Spam rules, kept free of Telegram types so they can be tested without a network.

State is held in memory. A restart (or a free-tier spin-down) clears it: flood counters
start again and members who joined before the restart are no longer treated as new.
"""

from __future__ import annotations

import re
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Deque, Dict, Optional, Tuple

# Phrases that appear in wallet-drainer, fake-support and paid-promotion messages.
SCAM_PATTERNS = [
    r"\bseed\s*phrase\b",
    r"\brecovery\s*phrase\b",
    r"\bsecret\s*phrase\b",
    r"\bprivate\s*key\b",
    r"\b(12|24)\s*words?\b",
    r"\b(dm|inbox|pm)\s*me\b",
    r"\bsend\s+me\s+a\s+(dm|message)\b",
    r"\bcheck\s+(your\s+)?(dm|inbox)\b",
    r"\b(validate|verify|sync|rectify|restore)\s+(your\s+)?wallet\b",
    r"\bwallet\s*connect\b.*\b(fix|issue|error|validate)\b",
    r"\bclaim\s+(your\s+)?airdrop\b",
    r"\bairdrop\s+is\s+live\b",
    r"\bsupport\s+(team|desk|agent)\b",
    r"\b(guaranteed|double)\s+(profit|returns?|your)\b",
    r"\b\d{2,}x\s+(gains?|returns?|profit)\b",
    r"\b(promote|promotion|listing|audit)\s+(your|the)\s+(project|token|coin)\b",
    r"\bsend\s+me\s+this\s+post\b",
]
_SCAM_RE = re.compile("|".join(SCAM_PATTERNS), re.IGNORECASE)
_LINK_RE = re.compile(r"(https?://|www\.|t\.me/|telegram\.me/|\b[a-z0-9-]+\.(com|io|xyz|net|org|app|link|me)\b)", re.IGNORECASE)


def is_scam(text: Optional[str]) -> bool:
    return bool(text) and _SCAM_RE.search(text) is not None


def has_link(text: Optional[str], has_link_entity: bool = False) -> bool:
    return has_link_entity or (bool(text) and _LINK_RE.search(text) is not None)


@dataclass
class FloodLimiter:
    """Sliding window: more than `max_messages` within `window_seconds` is a flood."""

    max_messages: int = 5
    window_seconds: float = 10.0
    max_tracked: int = 10_000
    clock: Callable[[], float] = time.monotonic
    _events: Dict[Tuple[int, int], Deque[float]] = field(default_factory=dict)

    def hit(self, chat_id: int, user_id: int) -> bool:
        """Records one message and returns True if the user is now flooding."""
        now = self.clock()
        key = (chat_id, user_id)
        q = self._events.get(key)
        if q is None:
            if len(self._events) >= self.max_tracked:
                self._prune(now)
            q = self._events[key] = deque()
        while q and now - q[0] > self.window_seconds:
            q.popleft()
        q.append(now)
        return len(q) > self.max_messages

    def _prune(self, now: float) -> None:
        stale = [k for k, q in self._events.items() if not q or now - q[-1] > self.window_seconds]
        for k in stale:
            del self._events[k]
        if len(self._events) >= self.max_tracked:
            self._events.clear()


@dataclass
class NewMembers:
    """Remembers when members joined, to block links and forwards for `probation_seconds`."""

    probation_seconds: float = 24 * 3600
    max_tracked: int = 50_000
    clock: Callable[[], float] = time.time
    _joined: Dict[Tuple[int, int], float] = field(default_factory=dict)

    def joined(self, chat_id: int, user_id: int) -> None:
        if len(self._joined) >= self.max_tracked:
            now = self.clock()
            self._joined = {k: t for k, t in self._joined.items() if now - t < self.probation_seconds}
            if len(self._joined) >= self.max_tracked:
                self._joined.clear()
        self._joined[(chat_id, user_id)] = self.clock()

    def on_probation(self, chat_id: int, user_id: int) -> bool:
        t = self._joined.get((chat_id, user_id))
        if t is None:
            return False
        if self.clock() - t >= self.probation_seconds:
            del self._joined[(chat_id, user_id)]
            return False
        return True


@dataclass
class Cooldown:
    """Lets a command answer at most once per `seconds` in a chat, so the bot cannot be used to flood."""

    seconds: float = 30.0
    clock: Callable[[], float] = time.monotonic
    _last: Dict[Tuple[int, str], float] = field(default_factory=dict)

    def ready(self, chat_id: int, command: str) -> bool:
        now = self.clock()
        last = self._last.get((chat_id, command))
        if last is not None and now - last < self.seconds:
            return False
        if len(self._last) > 10_000:
            self._last.clear()
        self._last[(chat_id, command)] = now
        return True


def decide(
    *,
    text: Optional[str],
    is_admin: bool,
    is_forward: bool,
    has_link_entity: bool,
    on_probation: bool,
    flooding: bool,
) -> Optional[str]:
    """Returns the action for one group message: None, "delete", "scam" or "flood"."""
    if is_admin:
        return None
    if flooding:
        return "flood"
    if is_scam(text):
        return "scam"
    if on_probation and (is_forward or has_link(text, has_link_entity)):
        return "delete"
    return None
