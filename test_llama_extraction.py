"""
Simple tests for the functions in `llama_extraction.py`.

These tests are designed to run WITHOUT a real Ollama/Llama 3 backend by
using a tiny fake client that returns predetermined responses.

You can run them either with `pytest`:

    pytest test_llama_extraction.py

or directly:

    python test_llama_extraction.py
"""

from __future__ import annotations

from llama_extraction import detect_stance, summarize_reason


class FakeClient:
    """
    Minimal stand‑in for the real LlamaClient.

    It only needs a `chat(system_prompt, user_prompt) -> str` method.
    """

    def __init__(self, reply: str) -> None:
        self._reply = reply

    def chat(self, system_prompt: str, user_prompt: str) -> str:  # noqa: D401
        """Return the preconfigured reply, ignoring prompts."""
        return self._reply


def test_detect_stance_support() -> None:
    transcript = "I'm calling to urge you to vote yes on this bill."
    topic = "Example Bill"
    client = FakeClient("support")
    assert detect_stance(transcript, topic, client=client) == "support"


def test_detect_stance_oppose_with_against_word() -> None:
    transcript = "Please vote no, I'm strongly against this proposal."
    topic = "Example Bill"
    client = FakeClient("I am against this proposal")
    assert detect_stance(transcript, topic, client=client) == "oppose"


def test_detect_stance_neutral_fallback() -> None:
    transcript = "I'm calling about something unrelated."
    topic = "Example Bill"
    client = FakeClient("The caller talks about many things but not this topic")
    assert detect_stance(transcript, topic, client=client) == "neutral"


def test_summarize_reason_normalization() -> None:
    transcript = (
        "I'm calling because this bill would really help working parents like me "
        "afford childcare."
    )
    topic = "Childcare Support Bill"
    client = FakeClient(
        "Belief that the bill will help working families afford childcare."
    )
    result = summarize_reason(transcript, topic, client=client)

    # Should strip trailing period and lowercase the first character.
    assert result == "belief that the bill will help working families afford childcare"


def test_summarize_reason_unclear() -> None:
    transcript = "I'm not really sure what I think about this specific bill."
    topic = "Example Bill"
    client = FakeClient(
        "reason for stance on this topic is not clearly stated."
    )
    result = summarize_reason(transcript, topic, client=client)
    assert result == "reason for stance on this topic is not clearly stated"


def demo_ambiguous_transcript_with_real_model() -> None:
    """
    Send a 5‑sentence transcript that does not clearly state a stance
    and print out the model's inferred stance and reasoning.

    This will call the *real* model through `detect_stance` and
    `summarize_reason`, so it requires:
    - the `ollama` Python package installed, and
    - the `ollama` daemon running locally with the `llama3` model
      available (see `llama_extraction.py` for details).
    """
    transcript = (
        "Hi, I've been following the Affordable Housing Bill that's been in the news lately. "
        "I've heard from some neighbors that it might raise property taxes in our area. "
        "On the other hand, I know a lot of families who are struggling to find a place they can afford. "
        "I'm not calling to tell you how to vote; I just want to share these concerns and "
        "hear more about what it could mean for our community. "
        "I hope you'll keep all of this in mind when you're making your decision."
    )
    topic = "Affordable Housing Bill"

    stance = detect_stance(transcript, topic)
    reason = summarize_reason(transcript, topic)

    print("\n--- Ambiguous transcript demo (real model) ---")
    print("Transcript:")
    print(transcript)
    print("\nDetected stance:", stance)
    print("Reason summary:", reason)


if __name__ == "__main__":
    # Lightweight manual runner so you can run this file directly
    # without installing pytest.
    tests = [
        test_detect_stance_support,
        test_detect_stance_oppose_with_against_word,
        test_detect_stance_neutral_fallback,
        test_summarize_reason_normalization,
        test_summarize_reason_unclear,
    ]

    for test in tests:
        test()
        print(f"{test.__name__}: OK")

    print("All tests passed.")

    # Optional: run the demo against your local Ollama/llama3 model.
    # This will fail with an ImportError or API error if Ollama is not set up.
    try:
        demo_ambiguous_transcript_with_real_model()
    except Exception as exc:  # pragma: no cover - just a convenience for manual runs
        print("\nSkipping real‑model demo (error while calling model):")
        print(repr(exc))

