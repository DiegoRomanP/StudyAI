"""End-to-end acceptance through HTTP using the real deterministic mock provider."""

import pytest
from fastapi.testclient import TestClient

import main


PROFILE_CASES = [
    ("logical_deductive", "Álgebra", "Las fracciones 3/4 y 0,75 son equivalentes.", "worked_example", (3, 5)),
    ("critical_argumentative", "Historia", "Dos relatos atribuyen la apertura a causas diferentes.", "source_comparison", (8, 12)),
    ("linguistic_interpretive", "Literatura", "La estación está vacía; cada narrador interpreta el silencio.", "textual_evidence", (10, 15)),
    ("systemic_empirical", "Biología", "Semana 1: altura 2 cm; Semana 2: altura 4 cm.", "observation_analysis", (3, 8)),
    ("applied_practical", "Economía", "Con demanda fija, compara dos precios y costos unitarios.", "decision", (5, 10)),
    ("general", "Taller", "Organiza un conjunto de materiales y revisa las instrucciones.", "explanation", (5, 10)),
]


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture
def create_plan(client):
    resources = []

    def create(content, *, pdf=False, **options):
        filename = "caso-adaptativo.pdf" if pdf else "caso-adaptativo.md"
        body = content if pdf else content.encode()
        mime_type = "application/pdf" if pdf else "text/markdown"
        document = client.post("/documents/upload", files={
            "file": (filename, body, mime_type),
        })
        assert document.status_code == 201, document.text
        document_id = document.json()["id"]
        resources.append(f"/documents/{document_id}")
        assert client.get(f"/documents/{document_id}").json()["status"] == "INDEXED"
        goal = client.post("/goals", json={
            "goal_type": "LEARNING", "title": "Piloto de enseñanza adaptativa", "description": "",
        })
        assert goal.status_code == 201, goal.text
        goal_id = goal.json()["id"]
        resources.append(f"/goals/{goal_id}")

        def generate(**request_options):
            requested = client.post("/plans/generate", json={
                "goal_id": goal_id, "document_ids": [document_id], **request_options,
            })
            assert requested.status_code == 202, requested.text
            plan = client.get(f"/plans/{requested.json()['id']}").json()
            assert plan["status"] == "READY", plan
            return plan

        return generate(), generate(content_version=2, **options)

    yield create
    for url in reversed(resources):
        assert client.delete(url).status_code == 204


def _get(client, url):
    response = client.get(url)
    assert response.status_code == 200, response.text
    return response.json()


def _response(question):
    answer = {"kind": question["kind"], "question_id": question["question_id"]}
    match question["kind"]:
        case "flashcard":
            answer["quality"] = 1
        case "multiple_choice":
            if question["mode"] == "multiple":
                answer["selected_options"] = question["options"][:1]
            else:
                answer["selected_option"] = question["options"][0]
        case "true_false":
            answer["answer"] = True
        case "matching":
            answer["pairs"] = [
                {"left_id": left["id"], "right_id": right["id"]}
                for left, right in zip(question["matching_left"], question["matching_right"], strict=True)
            ]
        case "sequence":
            answer["ordered_ids"] = [item["id"] for item in question["sequence_items"]]
        case "numeric":
            answer["value"] = "1"
        case "step_by_step":
            answer.update(steps="Desarrollo del piloto.", final_answer="1")
        case "short_answer" | "essay":
            answer["text"] = "Respuesta del piloto."
        case "rubric":
            answer.update(
                text="Respuesta del piloto.",
                criterion_ratings={item["criterion_id"]: 1 for item in question["rubric_criteria"]},
            )
        case other:
            pytest.fail(f"Formato inesperado en el mock: {other}")
    return answer


@pytest.mark.parametrize("profile,title,content,kind,minutes", PROFILE_CASES)
def test_profiles_generate_teach_assess_and_reinforce(client, create_plan, profile, title, content, kind, minutes):
    options = {"subject_hint": "general"} if profile == "general" else {"profile_hint": profile}
    standard, plan = create_plan(f"# {title}\n\n{content}\n", **options)
    assert _get(client, "/llm-settings/runtime")["source"] == "MOCK"
    assert (standard["goal_id"], standard["document_ids"]) == (plan["goal_id"], plan["document_ids"])
    standard_id = standard["sessions"][0]["id"]
    assert _get(client, f"/sessions/{standard_id}/learning-mode") == {"content_version": 1}
    baseline_questions = _get(client, f"/quizzes/{standard_id}")["questions"]
    assert len(baseline_questions) == 10
    assert sum(q["question_type"] == "FLASHCARD" for q in baseline_questions) == 5
    session = plan["sessions"][0]
    session_id = session["id"]
    lesson = _get(client, f"/sessions/{session_id}/learning-v2")
    assert _get(client, f"/sessions/{session_id}/learning-mode") == {"content_version": 2}
    assert lesson["snapshot"]["profile_id"] == profile
    assert kind in {block["kind"] for block in lesson["lesson_blocks"]}
    objective_ids = {objective["id"] for objective in lesson["snapshot"]["objectives"]}
    assert objective_ids == {id_ for block in lesson["lesson_blocks"] for id_ in block["objective_ids"]}
    quiz = _get(client, f"/quizzes/{session_id}/assessment-v2")
    assert len(quiz["questions"]) == 10
    assert sum(question["kind"] == "flashcard" for question in quiz["questions"]) == 5
    assert objective_ids == {id_ for question in quiz["questions"] for id_ in question["objective_ids"]}
    assert quiz["questions"][0]["estimated_minutes_per_question"] == {"min": minutes[0], "max": minutes[1]}
    assert all("expected_answer" not in question and "exemplar" not in question for question in quiz["questions"])
    payload = {"revision": quiz["revision"], "answers": [_response(question) for question in quiz["questions"]]}
    result_url = f"/quizzes/{session_id}/assessment-v2/result"
    graded = client.post(f"/quizzes/{quiz['quiz_id']}/assessment-v2/submit", json=payload)
    assert graded.status_code == 200, graded.text
    result = graded.json()
    assert result["total"] > 0
    assert result["objective_results"]
    assert _get(client, result_url) == result

    after_exam = _get(client, f"/plans/{plan['id']}")
    [review] = [
        item for item in after_exam["sessions"]
        if item["kind"] == "REVIEW" and item["topic_id"] == session["topic_id"]
    ]
    review_id = review["id"]
    review_lesson = _get(client, f"/sessions/{review_id}/learning-v2")
    assert review_lesson["snapshot"] == lesson["snapshot"]
    review_quiz_url = f"/quizzes/{review_id}/assessment-v2"
    review_quiz = _get(client, review_quiz_url)
    assert review_quiz["revision"] != quiz["revision"]
    assert client.post(f"/sessions/{review_id}/reinforcement").status_code == 202
    assert _get(client, f"/sessions/{review_id}")["reinforcement_status"] == "READY"
    reinforced = _get(client, review_quiz_url)
    assert reinforced["quiz_id"] == review_quiz["quiz_id"]
    assert reinforced["revision"] != review_quiz["revision"]
    assert _get(client, f"/sessions/{review_id}/learning-v2")["snapshot"] == lesson["snapshot"]

    assert client.delete(f"/plans/{plan['id']}").status_code == 204
    assert client.get(result_url).status_code == 404
    assert client.get(review_quiz_url).status_code == 404
    assert _get(client, f"/plans/{standard['id']}")["status"] == "READY"


@pytest.mark.parametrize("pdf", [False, True], ids=["markdown", "pdf"])
def test_automatic_profiles_can_differ_by_topic_in_one_document(client, create_plan, pdf):
    sections = (
        "# Álgebra\n\n" + "Álgebra estudia relaciones.\n" * 10,
        "# Historia\n\n" + "Historia contrasta relatos.\n" * 10,
    )
    content = "\n\n".join(sections)
    if pdf:
        fitz = pytest.importorskip("fitz", reason="PDF ingestion uses the optional PyMuPDF extra")
        with fitz.open() as document:
            for section in sections:
                document.new_page().insert_text((50, 50), section)
            content = document.tobytes()
    standard, plan = create_plan(content, pdf=pdf, profile_hint="auto")
    assert (standard["goal_id"], standard["document_ids"]) == (plan["goal_id"], plan["document_ids"])
    snapshots = [
        _get(client, f"/sessions/{session['id']}/learning-v2")["snapshot"]
        for session in plan["sessions"]
    ]
    profiles = {snapshot["profile_id"] for snapshot in snapshots}
    assert {"logical_deductive", "critical_argumentative"}.issubset(profiles)
    objectives_by_profile = {}
    for snapshot in snapshots:
        objectives = objectives_by_profile.setdefault(snapshot["profile_id"], set())
        objectives.update(objective["id"] for objective in snapshot["objectives"])
    assert objectives_by_profile["logical_deductive"].isdisjoint(objectives_by_profile["critical_argumentative"])
