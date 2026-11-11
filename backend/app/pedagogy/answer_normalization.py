"""Deterministic normalization for exact assessment answers."""

import re
import unicodedata
from fractions import Fraction

_NUMERIC_ANSWER = re.compile(r"[+-]?(?:[0-9]+(?:[.,][0-9]+)?|[0-9]+/[0-9]+)")
_NUMERIC_ERROR = "Introduce una respuesta numérica como entero, decimal o fracción válida."


def normalize_exact_answer(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    return " ".join(normalized.split()).casefold()


def parse_numeric_answer(value: str) -> Fraction:
    if len(value) > 64:
        raise ValueError(_NUMERIC_ERROR)
    number = value.strip()
    if not _NUMERIC_ANSWER.fullmatch(number):
        raise ValueError(_NUMERIC_ERROR)
    try:
        return Fraction(number.replace(",", "."))
    except ZeroDivisionError as exc:
        raise ValueError(_NUMERIC_ERROR) from exc
