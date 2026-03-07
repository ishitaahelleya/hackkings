"""
Extraction functions for transcripts.

These functions ONLY return:
- bill_name
- issue_name

They do NOT modify the dataset.
"""

BILLS = [
    "Respect for Marriage Act",
    "Treat and Reduce Obesity Act",
    "SAVE Act",
    "Epstein Files Transparency Act",
    "Stop the Sexualization of Children Act",
    "SAVE America Act",
    "Consolidated Appropriations Act",
    "ROTOR Act"
]

ISSUES = [
    "Gaza",
    "Iran",
    "ICE",
    "immigration",
    "housing",
    "cost of living"
]


def detect_bill(transcript):
    """Return bill name if mentioned in transcript."""

    text = transcript.lower()

    for bill in BILLS:
        if bill.lower() in text:
            return bill

    return None


def detect_issue(transcript):
    """Return issue name if mentioned in transcript."""

    text = transcript.lower()

    for issue in ISSUES:
        if issue.lower() in text:
            return issue

    return None


def process_transcript(transcript):
    """
    Analyze transcript and return extracted values.
    """

    bill = detect_bill(transcript)
    issue = detect_issue(transcript)

    return {
        "bill_name": bill,
        "issue_name": issue
    }


