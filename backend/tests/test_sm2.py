"""Unit tests for the SM-2 algorithm."""

from datetime import date, timedelta

from app.algorithms.sm2 import MIN_EASINESS_FACTOR, calculate_next_review


TODAY = date(2026, 1, 1)


def test_first_successful_review_sets_interval_1():
    r = calculate_next_review(2.5, 0, 0, quality=5, today=TODAY)
    assert r.new_repetition_count == 1
    assert r.new_interval == 1
    assert r.next_review_date == TODAY + timedelta(days=1)
    assert r.new_ef > 2.5  # EF grows on a perfect recall


def test_second_successful_review_sets_interval_6():
    r = calculate_next_review(2.5, 1, 1, quality=4, today=TODAY)
    assert r.new_repetition_count == 2
    assert r.new_interval == 6


def test_third_review_multiplies_by_ef():
    r = calculate_next_review(2.5, 6, 2, quality=5, today=TODAY)
    assert r.new_repetition_count == 3
    # interval = round(6 * new_ef); new_ef = 2.6 -> 16 (approx)
    assert r.new_interval == round(6 * r.new_ef)


def test_low_quality_resets_to_one_day():
    r = calculate_next_review(2.6, 30, 5, quality=2, today=TODAY)
    assert r.new_repetition_count == 0
    assert r.new_interval == 1
    assert r.next_review_date == TODAY + timedelta(days=1)


def test_easiness_factor_floor():
    # Repeated poor recalls must never push EF below 1.3.
    ef = 1.3
    for _ in range(5):
        ef = calculate_next_review(ef, 1, 0, quality=0, today=TODAY).new_ef
    assert ef >= MIN_EASINESS_FACTOR
