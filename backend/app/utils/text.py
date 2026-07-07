"""Lightweight text utilities."""

from __future__ import annotations

import re
from collections import Counter

# Common Spanish/English stopwords to drop from keyword extraction.
_STOPWORDS = {
    "the", "and", "for", "que", "los", "las", "del", "una", "con", "por",
    "para", "como", "más", "este", "esta", "sus", "son", "the", "with",
    "from", "this", "that", "have", "are", "was", "were", "will", "you",
    "your", "sobre", "entre", "cuando", "donde", "porque", "pero", "también",
}
_WORD_RE = re.compile(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]{4,}")


def extract_keywords(text: str, limit: int = 8) -> list[str]:
    """Return up to ``limit`` frequent, meaningful words as candidate topics.

    Heuristic only — used to make the offline demo feel related to the uploaded
    document. Prefers capitalised words (likely proper terms/headings).
    """
    if not text:
        return []

    words = _WORD_RE.findall(text)
    weighted: Counter[str] = Counter()
    for word in words:
        lower = word.lower()
        if lower in _STOPWORDS:
            continue
        # Capitalised words weigh more (headings, proper nouns, key terms).
        weight = 2 if word[0].isupper() else 1
        weighted[word.capitalize()] += weight

    return [word for word, _ in weighted.most_common(limit)]
