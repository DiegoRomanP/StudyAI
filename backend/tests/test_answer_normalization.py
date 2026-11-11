from fractions import Fraction

import pytest

from app.pedagogy.answer_normalization import normalize_exact_answer, parse_numeric_answer


def test_exact_text_normalizes_unicode_whitespace_and_case_only():
    assert normalize_exact_answer("\t ＡＲＢＯＬ  Straße\n") == "arbol strasse"
    assert normalize_exact_answer("Cafe\N{COMBINING ACUTE ACCENT}   !") == "café !"
    assert normalize_exact_answer("café !") != normalize_exact_answer("cafe!")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("0.75", Fraction(3, 4)),
        ("0,75", Fraction(3, 4)),
        ("  3/4  ", Fraction(3, 4)),
        ("-3/4", Fraction(-3, 4)),
        ("+12", Fraction(12)),
        ("-0", Fraction(0)),
        ("9" * 64, Fraction(10**64 - 1)),
    ],
)
def test_numeric_answers_are_exact_rationals(raw, expected):
    assert parse_numeric_answer(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "", "1/0", "2+2", "1e3", "3 kg", "1 234", "1_234", "1,234.5", "3 / 4",
        "1/2/3", "1/-2", "NaN", "½", "9" * 65, " " * 64 + "1",
    ],
)
def test_invalid_numeric_answers_are_rejected(raw):
    with pytest.raises(ValueError, match="respuesta numérica"):
        parse_numeric_answer(raw)
