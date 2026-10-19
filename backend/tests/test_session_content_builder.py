from app.models.quiz import QuestionType
from app.services.session_content_builder import build_session_content
from app.strategies.base import SessionConfig

CONFIG = SessionConfig(duration_minutes=25, flashcards=2, multiple_choice=1, emphasis="x")


def test_builder_truncates_to_config_counts_and_orders_flashcards_first():
    data = {
        "summary_markdown": "# Resumen",
        "youtube_keywords": ["a", "b"],
        "multiple_choice": [
            {"question": "m1", "options": ["x", "y"], "answer": "x"},
            {"question": "m2", "options": ["x", "y"], "answer": "y"},
        ],
        "flashcards": [{"question": f"f{i}", "answer": "r"} for i in range(5)],
    }

    content = build_session_content(data, CONFIG)

    assert [q["prompt"] for q in content.questions] == ["f0", "f1", "m1"]
    assert [q["order_index"] for q in content.questions] == [0, 1, 2]
    assert [q["question_type"] for q in content.questions] == [
        QuestionType.FLASHCARD, QuestionType.FLASHCARD, QuestionType.MULTIPLE_CHOICE,
    ]
    assert content.material_markdown == "# Resumen"
    assert content.keywords == ["a", "b"]


def test_builder_tolerates_missing_keys():
    content = build_session_content({}, CONFIG)

    assert content.material_markdown == ""
    assert content.keywords == []
    assert content.questions == []
