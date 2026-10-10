import re

from arlbot import texts

ALL = [texts.START, texts.HELP, texts.RULES, texts.SCAM_WARNING, texts.welcome("Ada"), texts.SCAM_NOTICE]


def test_english_ascii_only():
    for t in ALL:
        assert all(ord(ch) < 128 for ch in t), t  # rules out Turkish letters such as dotted capital I


def test_no_forbidden_claims():
    banned = [r"guarantee(?!d profit)", r"\b\d+x\b", r"moon", r"partner(ship)? with", r"listed on", r"(?<!no independent )\baudited\b", r"\bAPY\b", r"\bAPR\b"]
    for t in ALL:
        for b in banned:
            assert not re.search(b, t, re.I), (b, t)


def test_status_is_stated_honestly():
    assert "not deployed yet" in texts.START
    assert "No independent audit" in texts.START
    assert texts.TESTNET_TOKEN in texts.START
    assert "seed phrase" in texts.SCAM_WARNING


def test_welcome_name_is_bounded():
    assert len(texts.welcome("x" * 1000)) < len(texts.welcome("")) + 70
    assert "there" in texts.welcome("")


def test_messages_fit_telegram_limit():
    for t in ALL:
        assert len(t) <= 4096
