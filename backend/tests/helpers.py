import io

from fastapi.testclient import TestClient


def indexed_doc(client: TestClient) -> int:
    """Upload a small markdown file; plan generation only accepts INDEXED documents."""
    content = "# Tema\n\n" + "Contenido de prueba para indexar. " * 50
    files = {"file": ("doc.md", io.BytesIO(content.encode()), "text/markdown")}
    document_id = client.post("/documents/upload", files=files).json()["id"]
    assert client.get(f"/documents/{document_id}").json()["status"] == "INDEXED"
    return document_id
