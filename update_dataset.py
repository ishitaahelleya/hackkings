"""
Backend functions to add stance labels and reasoning summaries to transcript datasets.

Uses LLaMA functions from llama_extraction.py for extraction; this module handles
all I/O and dataset updates. Does not modify the input CSV.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import pandas as pd

from llama_extraction import LlamaClient, detect_stance, detect_topics, summarize_reason


def update_dataset_with_stance(
    input_csv_path: str | Path,
    output_csv_path: str | Path,
    topic_name: str = "the bill",
    topic_column: Optional[str] = None,
    client: Optional[LlamaClient] = None,
) -> None:
    """
    Read a dataset CSV, run stance detection on each transcript, and save the updated dataset.

    Parameters
    ----------
    input_csv_path
        Path to the input CSV. Must contain a column "transcript_text".
    output_csv_path
        Path where the updated CSV (with a "stance" column) will be written.
    topic_name
        Topic/bill name passed to detect_stance when the same topic applies to all rows.
        Ignored if topic_column is provided and present in the CSV.
    topic_column
        Optional name of a CSV column whose value is used as the topic for each row.
        If provided and the column exists, per-row values override topic_name.
    client
        Optional LlamaClient (e.g. for tests). If None, a default client is used.
    """
    input_path = Path(input_csv_path)
    output_path = Path(output_csv_path)

    if not input_path.exists():
        raise FileNotFoundError(f"Input CSV not found: {input_path}")

    if "transcript_text" not in pd.read_csv(input_path, nrows=0).columns:
        raise ValueError(
            'Input CSV must contain a column "transcript_text". '
            f"Columns found: {list(pd.read_csv(input_path, nrows=0).columns)}"
        )

    df = pd.read_csv(input_path)
    transcripts = df["transcript_text"].astype(str)

    # Resolve topic per row: use topic_column if present, else topic_name
    if topic_column and topic_column in df.columns:
        topics = df[topic_column].astype(str)
    else:
        topics = pd.Series([topic_name] * len(df))

    stances = []
    for transcript, topic in zip(transcripts, topics):
        stance = detect_stance(transcript, topic, client=client)
        stances.append(stance)

    df = df.copy()
    df["stance"] = stances
    df.to_csv(output_path, index=False)


def update_dataset_with_reasoning(
    input_csv_path: str | Path,
    output_csv_path: str | Path,
    client: Optional[LlamaClient] = None,
) -> None:
    """
    Read a dataset CSV, detect topics per transcript, generate reasoning summaries,
    and save the updated dataset with bill_reason and issue_reason filled in.

    Dataset structure expected:
    - transcript_text
    - bill_name
    - bill_reason
    - issue_name
    - issue_reason

    For each transcript:
    1. detect_topics(transcript) identifies all bills and issues mentioned
    2. For each topic, summarize_reason(transcript, topic_name) generates a short summary
    3. Bill topics → bill_name, bill_reason
    4. Issue topics → issue_name, issue_reason
    5. Multiple topics are concatenated (e.g. "Bill A: reason1. Bill B: reason2")

    Parameters
    ----------
    input_csv_path
        Path to the input CSV.
    output_csv_path
        Path where the updated CSV will be written.
    client
        Optional LlamaClient (e.g. for tests). If None, a default client is used.
    """
    input_path = Path(input_csv_path)
    output_path = Path(output_csv_path)

    if not input_path.exists():
        raise FileNotFoundError(f"Input CSV not found: {input_path}")

    # Read dataset and ensure required columns exist
    df = pd.read_csv(input_path)

    required = ["transcript_text"]
    for col in required:
        if col not in df.columns:
            raise ValueError(
                f'Input CSV must contain column "{col}". '
                f"Columns found: {list(df.columns)}"
            )

    # Ensure output columns exist and use object dtype to avoid FutureWarning when assigning strings
    reason_cols = ["bill_name", "bill_reason", "issue_name", "issue_reason"]
    for col in reason_cols:
        if col not in df.columns:
            df[col] = ""
    df[reason_cols] = df[reason_cols].fillna("").astype(object)

    df = df.copy()

    for row_idx in range(len(df)):
        transcript = df.loc[row_idx, "transcript_text"]

        # Robust to missing/NaN values
        if pd.isna(transcript) or transcript == "":
            print(f"[Row {row_idx}] Skipping: empty transcript")
            continue

        transcript = str(transcript).strip()

        # Detect all topics (bills and issues) mentioned in this transcript
        topics = detect_topics(transcript)

        if not topics:
            print(f"[Row {row_idx}] No topics detected")
            continue

        # Split into bills and issues
        bills = [(t, typ) for t, typ in topics if typ == "bill"]
        issues = [(t, typ) for t, typ in topics if typ == "issue"]

        # Process bills: generate reasoning for each, update bill_name and bill_reason
        if bills:
            bill_names = []
            bill_reasons = []
            for topic_name, _ in bills:
                reason = summarize_reason(transcript, topic_name, client=client)
                bill_names.append(topic_name)
                bill_reasons.append(f"{topic_name}: {reason}")
                print(f"[Row {row_idx}] Updated bill_reason for topic: {topic_name}")

            df.loc[row_idx, "bill_name"] = " | ".join(bill_names)
            df.loc[row_idx, "bill_reason"] = ". ".join(bill_reasons)

        # Process issues: generate reasoning for each, update issue_name and issue_reason
        if issues:
            issue_names = []
            issue_reasons = []
            for topic_name, _ in issues:
                reason = summarize_reason(transcript, topic_name, client=client)
                issue_names.append(topic_name)
                issue_reasons.append(f"{topic_name}: {reason}")
                print(f"[Row {row_idx}] Updated issue_reason for topic: {topic_name}")

            df.loc[row_idx, "issue_name"] = " | ".join(issue_names)
            df.loc[row_idx, "issue_reason"] = ". ".join(issue_reasons)

    df.to_csv(output_path, index=False)
    print(f"Saved updated dataset to {output_path}")
