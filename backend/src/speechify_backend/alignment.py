import re


def utf16_offset(text: str, offset: int) -> int:
    """DOM Range and JavaScript strings count UTF-16 units, including emoji pairs."""
    return len(text[:offset].encode("utf-16-le")) // 2


def prepare_words(text, tokenizer):
    """Map original tokens, including expanded numbers, to their model phonemes."""
    phonemes = ""
    spans = []
    for match in re.finditer(r"\S+", text):
        spoken = tokenizer.known(" ".join(tokenizer.phonemize(match.group(), "en-us").split()))
        if not spoken:
            continue
        if phonemes:
            phonemes += " "
        first = len(phonemes)
        phonemes += spoken
        spans.append(
            {
                "text": match.group(),
                "start_char": utf16_offset(text, match.start()),
                "end_char": utf16_offset(text, match.end()),
                "first": first,
                "last": len(phonemes),
            }
        )
    if not spans:
        raise ValueError("This passage has no supported spoken words.")
    if len(phonemes) > 480:
        raise ValueError("This passage expands into too much speech. Select a shorter passage.")
    return phonemes, spans


def align_words(phonemes, spans, timings, duration):
    if "".join(t.phoneme for t in timings) != phonemes:
        raise RuntimeError("The model did not return matching speech timings.")
    result = []
    for span in spans:
        selected = timings[span["first"] : span["last"]]
        result.append(
            {
                "text": span["text"],
                "start_char": span["start_char"],
                "end_char": span["end_char"],
                "start": round(max(0.0, min(selected[0].start, duration)), 4),
                "end": round(max(0.0, min(selected[-1].end, duration)), 4),
            }
        )
    return result
