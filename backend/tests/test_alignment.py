from types import SimpleNamespace

import pytest

from speechify_backend.alignment import align_words, prepare_words, utf16_offset


class Tokenizer:
    def known(self, value):
        return value

    def phonemize(self, value, lang):
        return {"2026.": "twenty twenty six"}.get(value, value)


def test_number_expansion_and_emoji_preserve_dom_word_offsets():
    text = "Hi 👋 2026."
    phonemes, spans = prepare_words(text, Tokenizer())
    timings = [
        SimpleNamespace(phoneme=c, start=i / 10, end=(i + 1) / 10) for i, c in enumerate(phonemes)
    ]
    words = align_words(phonemes, spans, timings, len(phonemes) / 10)
    assert words[-1]["text"] == "2026."
    assert words[-1]["start_char"] == 6
    assert words[-1]["end_char"] == 11
    assert words[-1]["end"] - words[-1]["start"] > 1
    assert utf16_offset(text, len(text)) == 11


def test_mismatched_timing_sequence_is_rejected():
    with pytest.raises(RuntimeError, match="matching speech timings"):
        align_words("hello", [], [], 1)
