"""
Tests for the backend server (server.py): /api/analyze and CSV append behavior.

Uses a temporary CSV so the real calls_dataset.csv is not modified.
Mocks extraction and llama_extraction so tests run without Ollama or real extraction.

Requires: pip install -r requirements.txt  (flask, flask-cors)

Run with:
    pytest test_server.py
or:
    python -m pytest test_server.py -v
or:
    python test_server.py
"""

import csv
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

# Import after we may patch; we'll patch server's DATASET_PATH and optional deps
import server


@pytest.fixture
def temp_csv(tmp_path):
    """Use a temporary CSV path for the dataset during tests."""
    path = tmp_path / "test_calls_dataset.csv"
    with patch.object(server, "DATASET_PATH", path):
        # Clear zip lookup cache so it's rebuilt from the temp (empty) file
        server._zip_lat_lng = None
        yield path


@pytest.fixture
def client(temp_csv):
    """Flask test client with temp CSV in place."""
    server.DATASET_PATH = temp_csv
    server._zip_lat_lng = None
    with server.app.test_client() as c:
        yield c


def test_analyze_requires_transcript(client):
    """POST /api/analyze without transcript returns 400."""
    r = client.post(
        "/api/analyze",
        json={"phone": "5551234567"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 400
    data = r.get_json()
    assert "error" in data and "transcript" in data["error"].lower()


def test_analyze_success_appends_row(client, temp_csv):
    """POST /api/analyze with transcript returns 200 and appends one row to CSV."""
    payload = {
        "transcript": "I support clean energy and renewable solar power.",
        "phone": "5559876543",
    }
    r = client.post("/api/analyze", json=payload, headers={"Content-Type": "application/json"})
    assert r.status_code == 200
    data = r.get_json()
    assert "issue" in data
    assert "stance" in data
    assert "summary" in data
    assert "zipcode" in data
    assert data["zipcode"] == "76543"  # last 5 of 5559876543
    assert data["district"] == "CA-09"

    # One row appended
    with open(temp_csv, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 1
    row = rows[0]
    assert row["transcript_text"] == payload["transcript"]
    assert row["district"] == "CA-09"
    assert row["state"] == "CA"
    assert row["zip_code"] == "76543"
    # Lat/lng hardcoded when zip not in (empty) dataset
    assert row["latitude"] == "38.0"
    assert row["longitude"] == "-121.3"
    assert row["id"] == "1"
    assert "call_timestamp" in row


def test_analyze_multiple_calls_increment_id(client, temp_csv):
    """Multiple analyze calls append rows with incrementing ids."""
    for i in range(3):
        r = client.post(
            "/api/analyze",
            json={"transcript": f"Call number {i}. Healthcare matters.", "phone": "5551112233"},
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 200
    with open(temp_csv, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 3
    assert [r["id"] for r in rows] == ["1", "2", "3"]


def test_derive_zip_from_phone():
    """Zip is last 5 digits of normalized phone."""
    assert server.derive_zip_from_phone("5551234567") == "34567"
    assert server.derive_zip_from_phone("555-123-4567") == "34567"  # last 5 of 5551234567
    assert server.derive_zip_from_phone("12") == "95202"  # default when < 5 digits


def test_analyze_mock_detects_issue_and_stance():
    """Mock analysis detects issue from keywords and stance from support/against phrases."""
    out = server.analyze_mock(
        "I support healthcare and Medicaid expansion.",
        "5550000000",
    )
    assert out["issue"] == "Healthcare"
    assert out["stance"] == "support"
    assert out["district"] == "CA-09"
    assert "healthcare" in out["summary"].lower() or "medicaid" in out["summary"].lower()

    out2 = server.analyze_mock("I oppose this bill and vote no.", "5559999999")
    assert out2["stance"] == "against"


def test_stance_to_api_oppose_to_against():
    """Llama 'oppose' is mapped to 'against' for API/CSV."""
    assert server._stance_to_api("oppose") == "against"
    assert server._stance_to_api("support") == "support"
    assert server._stance_to_api("neutral") == "neutral"
    assert server._stance_to_api("") == "neutral"


def test_llama_stance_and_reason_fallback_without_llama():
    """When llama_extraction is not used, we get empty strings (no crash)."""
    # If detect_stance/summarize_reason are None (e.g. not installed), result is empty
    with patch.object(server, "detect_stance", None), patch.object(server, "summarize_reason", None):
        out = server.llama_stance_and_reason("I support the bill.", "Some Bill", "Healthcare")
    assert out["bill_stance"] == ""
    assert out["bill_reason"] == ""
    assert out["issue_stance"] == ""
    assert out["issue_reason"] == ""


def test_llama_stance_and_reason_with_mock_llama():
    """When Llama is mocked, bill_stance and issue_reason come from mock."""
    def fake_detect(transcript, topic):
        return "support" if "support" in transcript.lower() else "neutral"

    def fake_summarize(transcript, topic):
        return "caller supports " + topic.lower()

    with patch.object(server, "detect_stance", fake_detect), patch.object(
        server, "summarize_reason", fake_summarize
    ):
        out = server.llama_stance_and_reason("I support this.", "SAVE Act", "ICE")
    assert out["bill_stance"] == "support"
    assert out["bill_reason"] == "caller supports save act"
    assert out["issue_stance"] == "support"
    assert out["issue_reason"] == "caller supports ice"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
