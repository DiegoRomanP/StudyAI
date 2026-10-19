"""Pure adaptive-route algorithm (no database)."""

import pytest

from app.algorithms.adaptive_route import (
    DEFAULT_LADDER, DOMINADO, EN_PROGRESO, REFORZAR, SIN_DATOS,
    effective_ladder, exam_score, failed_question_ids, normalize, order_for_review,
    priority, review_interval_days, shuffled_options, topic_state, update_topic,
)

LADDER = (1, 3, 7, 14, 30)


def _mc(correct: bool) -> dict:
    return {"type": "multiple_choice", "correct": correct}


def _fc(quality: int) -> dict:
    return {"type": "flashcard", "quality": quality}


def _exam(om_right: int, om_total: int, qualities: list[int]) -> dict:
    detail = {str(i): _mc(i < om_right) for i in range(om_total)}
    detail.update({str(100 + i): _fc(q) for i, q in enumerate(qualities)})
    return detail


def test_exam_score_multiple_choice_only():
    assert exam_score({"1": _mc(True), "2": _mc(False), "3": _mc(True), "4": _mc(True)}) == 0.75


def test_exam_score_flashcards_only_is_mean_quality():
    assert exam_score({"1": _fc(5), "2": _fc(0)}) == pytest.approx(0.5)


def test_exam_score_mixed_weighs_flashcards_half():
    assert exam_score({"1": _mc(True), "2": _fc(0)}) == pytest.approx(1 / 1.5)


@pytest.mark.parametrize("detail", [{}, {"1": "x"}, {"1": {"type": "other"}}])
def test_exam_score_without_usable_answers_is_none(detail):
    assert exam_score(detail) is None


def test_failed_questions_use_the_passing_threshold():
    detail = {"1": _mc(False), "2": _mc(True), "3": _fc(2), "4": _fc(3)}
    assert failed_question_ids(detail) == {1, 3}


def test_first_perfect_exam_gives_mastery_08_and_box_1():
    assert update_topic(None, 0, 1.0, promote_allowed=True, ladder=LADDER) == (0.8, 1)


def test_boundaries_are_exact():
    assert update_topic(0.5, 2, 0.6, promote_allowed=True, ladder=LADDER)[1] == 2  # 0.6 keeps the box
    assert update_topic(0.5, 2, 0.8, promote_allowed=True, ladder=LADDER)[1] == 3  # 0.8 climbs
    assert topic_state(0.6, 0) == EN_PROGRESO
    assert topic_state(0.5999, 0) == REFORZAR


def test_bad_exam_drops_the_box_to_zero():
    assert update_topic(0.9, 2, 0.3, promote_allowed=True, ladder=LADDER)[1] == 0


def test_box_stays_on_the_last_step():
    assert update_topic(0.9, 4, 1.0, promote_allowed=True, ladder=LADDER)[1] == 4


def test_early_review_does_not_climb():
    assert update_topic(0.8, 1, 1.0, promote_allowed=False, ladder=LADDER) == (0.92, 1)


@pytest.mark.parametrize("ladder", [[], [1, 3]])
def test_short_or_empty_ladder_falls_back_to_default(ladder):
    assert effective_ladder(ladder) == DEFAULT_LADDER
    assert review_interval_days(2, ladder) == 7


def test_state_without_data_and_mastered():
    assert topic_state(None, 0) == SIN_DATOS
    assert topic_state(0.9, 3) == DOMINADO


def test_priority_prefers_valuable_topics_that_are_still_weak():
    assert priority(0.8, None) == 0.4
    assert priority(0.8, 0.9) < priority(0.8, 0.2)
    assert priority(2, 0.0) == 1.0


def test_order_for_review_is_stable():
    assert order_for_review([1, 2, 3, 4, 5], {4, 2}) == [2, 4, 1, 3, 5]


def test_shuffled_options_is_deterministic_and_keeps_the_set():
    options = ["a", "b", "c", "d"]
    assert shuffled_options(options, "7:1") == shuffled_options(options, "7:1")
    assert sorted(shuffled_options(options, "7:1")) == options
    assert shuffled_options(["x"], "s") == ["x"]
    assert shuffled_options([], "s") == []
    assert options == ["a", "b", "c", "d"]


def test_normalize_collapses_whitespace_and_case():
    assert normalize("  Álgebra   Lineal ") == normalize("álgebra lineal")


def test_worked_example_table_5_3():
    # A: perfect new exam
    score_a = exam_score(_exam(7, 7, [5, 5, 5]))
    assert score_a == pytest.approx(1.0)
    m, box = update_topic(None, 0, score_a, promote_allowed=True, ladder=LADDER)
    assert (m, box, topic_state(m, box), review_interval_days(box, LADDER)) == (0.8, 1, EN_PROGRESO, 3)
    # B: 5/7 and 3,3,3
    score_b = exam_score(_exam(5, 7, [3, 3, 3]))
    assert score_b == pytest.approx(0.694, abs=1e-3)
    mb, bb = update_topic(None, 0, score_b, promote_allowed=True, ladder=LADDER)
    assert (mb, bb, topic_state(mb, bb), review_interval_days(bb, LADDER)) == (0.6165, 0, EN_PROGRESO, 1)
    # C: 2/7 and 2,2,2
    score_c = exam_score(_exam(2, 7, [2, 2, 2]))
    assert score_c == pytest.approx(0.306, abs=1e-3)
    mc, bc = update_topic(None, 0, score_c, promote_allowed=True, ladder=LADDER)
    assert (mc, bc, topic_state(mc, bc), review_interval_days(bc, LADDER)) == (0.3835, 0, REFORZAR, 1)
    # A reviewed at 3 days, score 0.90
    m, box = update_topic(m, box, 0.90, promote_allowed=True, ladder=LADDER)
    assert (m, box, review_interval_days(box, LADDER)) == (0.86, 2, 7)
    # A reviewed at 7 days, score 0.85 → mastered
    m_final, box_final = update_topic(m, box, 0.85, promote_allowed=True, ladder=LADDER)
    assert (m_final, box_final, topic_state(m_final, box_final)) == (0.854, 3, DOMINADO)
    # variant: score 0.50 at 7 days
    assert update_topic(m, box, 0.50, promote_allowed=True, ladder=LADDER) == (0.644, 0)
    # variant: reviewed early (box stays where it was, 1 → +3 days)
    early = update_topic(0.8, 1, 1.0, promote_allowed=False, ladder=LADDER)
    assert early == (0.92, 1) and review_interval_days(early[1], LADDER) == 3
