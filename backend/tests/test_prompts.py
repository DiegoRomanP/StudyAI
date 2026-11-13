"""The generation prompts ask for bounded lengths so outputs fit their budgets."""

from __future__ import annotations

from app.llm.prompts.reinforcement import build_reinforcement_prompt
from app.llm.prompts.session_content import build_session_content_prompt
from app.llm.prompts.topic_analysis import build_topic_analysis_prompt


def test_session_content_prompt_bounds_material_and_questions():
    prompt = build_session_content_prompt("Tema", "Meta", ["fragmento"], 5, 5)

    assert "entre 250 y 400 palabras" in prompt
    assert "respuesta de 30 como máximo" in prompt
    assert "opciones de 12 palabras como máximo" in prompt


def test_reinforcement_prompt_bounds_its_length():
    points = [{"prompt": "¿Qué es X?", "answer": "Y"}]
    prompt = build_reinforcement_prompt("Tema", "Meta", points, "extracto", 5, 5)

    assert "600 palabras como máximo" in prompt
    assert "80 palabras como máximo por punto" in prompt
    assert "opciones de 12 palabras como máximo" in prompt


def test_topic_analysis_prompt_bounds_topic_names():
    prompt = build_topic_analysis_prompt(["fragmento"], "Meta")

    assert "6 palabras como máximo" in prompt
    assert "sin descripciones" in prompt


def test_content_prompts_forbid_inner_double_quotes_and_show_a_valid_schema():
    points = [{"prompt": "¿Qué es X?", "answer": "Y"}]
    prompts = [
        build_session_content_prompt("Tema", "Meta", ["fragmento"], 5, 5),
        build_reinforcement_prompt("Tema", "Meta", points, "extracto", 5, 5),
    ]

    for prompt in prompts:
        assert "no uses comillas dobles" in prompt
        assert "{{" not in prompt and "}}" not in prompt
        assert '"summary_markdown"' in prompt


def test_questions_are_grounded_in_the_material_written_in_the_same_call():
    content = build_session_content_prompt("Tema", "Meta", ["fragmento"], 5, 5)
    reinforcement = build_reinforcement_prompt("Tema", "Meta", [{"prompt": "P", "answer": "R"}], "extracto", 5, 5)

    assert "sobre el material que acabas de escribir" in content
    assert "SOLO con lo que dice 'summary_markdown'" in content
    assert "SOLO con el material de refuerzo que escribes" in reinforcement
