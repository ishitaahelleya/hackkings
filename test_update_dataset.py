"""
Tests for update_dataset.py.

Uses a fake LLaMA client so tests run without a real Ollama backend.
Creates temporary CSV files for input/output.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pandas as pd

from llama_extraction import LlamaClient
from update_dataset import update_dataset_with_reasoning, update_dataset_with_stance


class FakeClient:
    """Returns a fixed reply for every chat call."""

    def __init__(self, reply: str) -> None:
        self._reply = reply

    def chat(self, system_prompt: str, user_prompt: str) -> str:
        return self._reply


def test_update_dataset_with_stance() -> None:
    """Stance column is added and populated correctly."""
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = Path(tmpdir) / "input.csv"
        output_path = Path(tmpdir) / "output.csv"

        df = pd.DataFrame({
            "transcript_text": [
                "I'm calling to vote yes on the bill.",
                "Please vote no on this proposal.",
            ],
        })
        df.to_csv(input_path, index=False)

        client = FakeClient("support")
        update_dataset_with_stance(
            input_path,
            output_path,
            topic_name="the bill",
            client=client,
        )

        result = pd.read_csv(output_path)
        assert "stance" in result.columns
        assert list(result["stance"]) == ["support", "support"]


def test_update_dataset_with_stance_topic_column() -> None:
    """Per-row topic from a column is used when provided."""
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = Path(tmpdir) / "input.csv"
        output_path = Path(tmpdir) / "output.csv"

        df = pd.DataFrame({
            "transcript_text": ["Vote yes on the SAVE Act.", "Vote no on immigration."],
            "topic": ["SAVE Act", "immigration"],
        })
        df.to_csv(input_path, index=False)

        client = FakeClient("oppose")
        update_dataset_with_stance(
            input_path,
            output_path,
            topic_column="topic",
            client=client,
        )

        result = pd.read_csv(output_path)
        assert list(result["stance"]) == ["oppose", "oppose"]


def test_update_dataset_with_reasoning() -> None:
    """Bill and issue columns are updated when topics are detected."""
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = Path(tmpdir) / "input.csv"
        output_path = Path(tmpdir) / "output.csv"

        # Transcript must mention a bill or issue from extraction.py
        df = pd.DataFrame({
            "transcript_text": [
                "I support the SAVE Act because it strengthens border security.",
            ],
            "bill_name": [""],
            "bill_reason": [""],
            "issue_name": [""],
            "issue_reason": [""],
        })
        df.to_csv(input_path, index=False)

        client = FakeClient("belief that it strengthens border security")
        update_dataset_with_reasoning(input_path, output_path, client=client)

        result = pd.read_csv(output_path)
        assert "SAVE Act" in str(result.loc[0, "bill_name"])
        assert "border" in str(result.loc[0, "bill_reason"]).lower()


def test_update_dataset_with_reasoning_issue() -> None:
    """Issue columns are updated when an issue is detected."""
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = Path(tmpdir) / "input.csv"
        output_path = Path(tmpdir) / "output.csv"

        df = pd.DataFrame({
            "transcript_text": [
                "I'm concerned about Gaza and the humanitarian situation there.",
            ],
            "bill_name": [""],
            "bill_reason": [""],
            "issue_name": [""],
            "issue_reason": [""],
        })
        df.to_csv(input_path, index=False)

        client = FakeClient("humanitarian concerns about the conflict")
        update_dataset_with_reasoning(input_path, output_path, client=client)

        result = pd.read_csv(output_path)
        assert "Gaza" in str(result.loc[0, "issue_name"])
        assert "humanitarian" in str(result.loc[0, "issue_reason"]).lower()


def test_update_dataset_with_reasoning_empty_transcript() -> None:
    """Rows with empty transcripts are skipped without error."""
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = Path(tmpdir) / "input.csv"
        output_path = Path(tmpdir) / "output.csv"

        df = pd.DataFrame({
            "transcript_text": [""],
            "bill_name": [""],
            "bill_reason": [""],
            "issue_name": [""],
            "issue_reason": [""],
        })
        df.to_csv(input_path, index=False)

        client = FakeClient("irrelevant")
        update_dataset_with_reasoning(input_path, output_path, client=client)

        result = pd.read_csv(output_path)
        # CSV may read empty cells as NaN
        assert pd.isna(result.loc[0, "bill_reason"]) or result.loc[0, "bill_reason"] == ""
        assert pd.isna(result.loc[0, "issue_reason"]) or result.loc[0, "issue_reason"] == ""


if __name__ == "__main__":
    tests = [
        test_update_dataset_with_stance,
        test_update_dataset_with_stance_topic_column,
        test_update_dataset_with_reasoning,
        test_update_dataset_with_reasoning_issue,
        test_update_dataset_with_reasoning_empty_transcript,
    ]

    for test in tests:
        test()
        print(f"{test.__name__}: OK")

    print("All tests passed.")
