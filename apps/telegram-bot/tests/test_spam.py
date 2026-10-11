from arlbot import spam


class Clock:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t


def test_scam_phrases_are_caught():
    for text in [
        "Please share your seed phrase to restore access",
        "DM me for a listing",
        "Send me this post",
        "Validate your wallet here",
        "Claim your airdrop now",
        "Our support team will fix it",
        "100x gains guaranteed",
        "We can promote your project",
        "type your 12 words",
    ]:
        assert spam.is_scam(text), text


def test_normal_messages_pass():
    for text in [
        "How does the ceiling work in x402 upto?",
        "When is mainnet planned?",
        "Is the token contract upgradeable?",
        "",
        None,
    ]:
        assert not spam.is_scam(text), text


def test_links_detected():
    assert spam.has_link("see https://example.com")
    assert spam.has_link("join t.me/somegroup")
    assert spam.has_link("visit scam.xyz now")
    assert spam.has_link("plain text", has_link_entity=True)
    assert not spam.has_link("no links here at all")


def test_flood_limiter_window():
    c = Clock()
    f = spam.FloodLimiter(max_messages=5, window_seconds=10, clock=c)
    assert not any(f.hit(1, 2) for _ in range(5))
    assert f.hit(1, 2)  # sixth message inside the window
    assert not f.hit(1, 3)  # other users are independent
    c.t += 11
    assert not f.hit(1, 2)  # window slid past


def test_flood_limiter_memory_is_bounded():
    c = Clock()
    f = spam.FloodLimiter(max_tracked=100, clock=c)
    for uid in range(1000):
        f.hit(1, uid)
        c.t += 11
    assert len(f._events) <= 100


def test_new_member_probation_expires():
    c = Clock()
    m = spam.NewMembers(probation_seconds=60, clock=c)
    assert not m.on_probation(1, 2)
    m.joined(1, 2)
    assert m.on_probation(1, 2)
    c.t += 61
    assert not m.on_probation(1, 2)


def test_cooldown():
    c = Clock()
    cd = spam.Cooldown(seconds=30, clock=c)
    assert cd.ready(1, "help")
    assert not cd.ready(1, "help")
    assert cd.ready(1, "start")
    assert cd.ready(2, "help")
    c.t += 31
    assert cd.ready(1, "help")


def test_decide():
    base = dict(text="hello", is_admin=False, is_forward=False, has_link_entity=False, on_probation=False, flooding=False)
    assert spam.decide(**base) is None
    assert spam.decide(**{**base, "flooding": True}) == "flood"
    assert spam.decide(**{**base, "text": "dm me"}) == "scam"
    assert spam.decide(**{**base, "text": "https://x.io", "on_probation": True}) == "delete"
    assert spam.decide(**{**base, "is_forward": True, "on_probation": True}) == "delete"
    assert spam.decide(**{**base, "text": "https://x.io"}) is None  # established members may link
    assert spam.decide(**{**base, "text": "dm me", "is_admin": True, "flooding": True}) is None
