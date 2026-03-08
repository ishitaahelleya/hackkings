"""
Utilities for extracting stance and reasoning about a given topic
from a call transcript using a Llama 3 model running via Ollama.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from extraction import BILLS, ISSUES

try:
    import ollama
except ImportError:  # Optional dependency; only needed if you call the model.
    ollama = None  # type: ignore[assignment]


Stance = Literal["support", "oppose", "neutral"]


@dataclass
class LlamaConfig:
    """
    Basic configuration for accessing an Ollama Llama 3 chat model.

    By default this assumes you have `ollama` running locally and the
    `llama3` model available (e.g. `ollama pull llama3`).
    """

    model: str = "llama3"


class LlamaClient:
    """
    Minimal wrapper around an Ollama chat endpoint serving Llama 3.
    """

    def __init__(self, config: Optional[LlamaConfig] = None) -> None:
        self.config = config or LlamaConfig()

        if ollama is None:
            raise ImportError(
                "The 'ollama' package is required to use LlamaClient. "
                "Install it with `pip install ollama` and make sure the "
                "`ollama` daemon is running (see https://ollama.com)."
            )

    def chat(self, system_prompt: str, user_prompt: str) -> str:
        """
        Send a chat completion request and return the assistant's text.
        """
        response = ollama.chat(
            model=self.config.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        message = response.get("message", {})
        content = message.get("content", "")
        return content or ""


def detect_topics(transcript: str) -> list[tuple[str, str]]:
    """
    Identify all bills and issues mentioned in a transcript.

    Returns
    -------
    List of (topic_name, topic_type) where topic_type is "bill" or "issue".
    """
    text = (transcript or "").lower()
    topics: list[tuple[str, str]] = []
    for bill in BILLS:
        if bill.lower() in text:
            topics.append((bill, "bill"))
    for issue in ISSUES:
        if issue.lower() in text:
            topics.append((issue, "issue"))
    return topics


def _get_client(client: Optional[LlamaClient] = None) -> LlamaClient:
    """
    Helper to get or create a LlamaClient.

    This indirection makes it easier to inject a mock client in tests.
    """
    if client is not None:
        return client
    return LlamaClient()


def detect_stance(
    transcript: str,
    topic_name: str,
    client: Optional[LlamaClient] = None,
) -> Stance:
    """
    Determine whether the caller supports, opposes, or is neutral toward
    the given topic.

    Parameters
    ----------
    transcript:
        Full call transcript as a string.
    topic_name:
        Name of the bill or issue to evaluate.

    Returns
    -------
    One of: 'support', 'oppose', or 'neutral'.
    """
    llama = _get_client(client)

    system_prompt = (
        "You are an analyst classifying a caller's stance on a specific "
        "bill or issue based on a call transcript.\n"
        "You must output exactly one word: 'support', 'oppose', or 'neutral'.\n"
        "- If the caller clearly wants the representative to vote YES, "
        "support, approve, or pass the bill → output 'support'.\n"
        "- If the caller clearly wants the representative to vote NO, "
        "oppose, reject, or block the bill → output 'oppose'.\n"
        "- If the caller's stance is mixed, unclear, or not about this "
        "specific topic → output 'neutral'."
    )

    user_prompt = (
        f"Topic: {topic_name}\n\n"
        f"Transcript:\n{transcript}\n\n"
        "Question: What is the caller's stance on this topic? "
        "Reply with exactly one word: support, oppose, or neutral."
    )

    raw = llama.chat(system_prompt, user_prompt).strip().lower()

    if "support" in raw and "oppose" not in raw:
        return "support"
    if "oppose" in raw or "against" in raw:
        return "oppose"
    if raw in {"support", "oppose", "neutral"}:
        return raw  # type: ignore[return-value]

    # Fallback: if the model was verbose or ambiguous, treat as neutral.
    return "neutral"


def summarize_reason(
    transcript: str,
    topic_name: str,
    client: Optional[LlamaClient] = None,
) -> str:
    """
    Extract a short explanation of the caller's reasoning for their stance
    on the given topic.

    The returned text is intended to be a brief sentence fragment, suitable
    for use in a dashboard or report.

    Example outputs:
    - 'concerns about voter access for marginalized communities'
    - 'belief that the tax credit will help working families afford childcare'
    - 'humanitarian concerns about civilian casualties in the Gaza conflict'
    """
    llama = _get_client(client)

    system_prompt = (
        "You are summarizing a caller's reasoning about a specific bill or issue "
        "based on a call transcript.\n"
        "Your job is to extract the main reason for their stance on the topic.\n"
        "Respond with a short sentence fragment (not a full sentence), "
        "10–15 words if possible, with no leading capital letter and no "
        "trailing period.\n"
        "If the caller's reasoning about this specific topic is unclear, "
        "respond with: 'reason for stance on this topic is not clearly stated'."
    )

    user_prompt = (
        f"Topic: {topic_name}\n\n"
        f"Transcript:\n{transcript}\n\n"
        "Question: Briefly summarize the caller's main reasoning for their stance "
        "on this topic.\n"
        "Answer with a short sentence fragment only."
    )

    raw = llama.chat(system_prompt, user_prompt).strip()

    # Normalize to a fragment: lower-case first letter and strip trailing period.
    if raw.endswith("."):
        raw = raw[:-1].rstrip()
    if raw:
        raw = raw[0].lower() + raw[1:]

    return raw


__all__ = [
    "LlamaConfig",
    "LlamaClient",
    "Stance",
    "detect_stance",
    "detect_topics",
    "summarize_reason",
]

