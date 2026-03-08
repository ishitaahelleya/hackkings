"""
Minimal backend that connects the frontend (voice → transcript → analyze)
to the existing CSV dataset in real time.

- POST /api/analyze: accepts { transcript, phone }, runs extraction,
  appends one row to calls_dataset.csv, returns { issue, stance, summary, zipcode, district }
  so the existing main.js UI keeps working.
"""

import csv
import re
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS

# Use same extraction as fill_dataset_from_transcripts.py
try:
    from extraction import process_transcript
except ImportError:
    process_transcript = None

# Llama-based stance and reason (bill_stance, bill_reason, issue_stance, issue_reason)
try:
    from llama_extraction import detect_stance, summarize_reason
except ImportError:
    detect_stance = None
    summarize_reason = None

app = Flask(__name__)
CORS(app)

# Path to the CSV dataset (same folder as this script)
SCRIPT_DIR = Path(__file__).resolve().parent
DATASET_PATH = SCRIPT_DIR / "calls_dataset.csv"

# Replicate frontend mock logic so UI gets same issue/stance/summary
ISSUE_RULES = [
    ("Clean Energy", re.compile(r"\b(clean energy|renewable|solar|wind|carbon|emissions?)\b", re.I)),
    ("Healthcare", re.compile(r"\b(healthcare|medicaid|medicare|insurance|hospitals?)\b", re.I)),
    ("Immigration", re.compile(r"\b(immigration|border|asylum|undocumented)\b", re.I)),
    ("Housing", re.compile(r"\b(housing|rent|zoning|homeless|affordable)\b", re.I)),
    ("Education", re.compile(r"\b(education|schools?|teachers?|college|student)\b", re.I)),
    ("Taxes", re.compile(r"\b(taxes?|taxation|irs|property tax)\b", re.I)),
    ("Public Safety", re.compile(r"\b(crime|police|safety|guns?|violence)\b", re.I)),
]
SUPPORT_RE = re.compile(r"\b(i\s+support|i'm\s+for|i\s+am\s+for|in\s+favor|approve|vote\s+yes|yes\s+on)\b", re.I)
AGAINST_RE = re.compile(r"\b(i\s+oppose|i'm\s+against|i\s+am\s+against|against|reject|vote\s+no|no\s+on)\b", re.I)


def normalize_phone(value):
    return re.sub(r"[^\d]", "", str(value or ""))


def derive_zip_from_phone(phone_digits):
    d = normalize_phone(phone_digits)
    last5 = d[-5:] if len(d) >= 5 else ""
    return last5 if len(last5) == 5 else "95202"


def analyze_mock(transcript, phone):
    """Same logic as main.js mockAnalyzeTranscript: issue, stance, summary, zipcode, district."""
    text = (transcript or "").strip()
    lower = text.lower()

    issue = "General Policy"
    for name, pattern in ISSUE_RULES:
        if pattern.search(text):
            issue = name
            break

    stance = "neutral"
    if SUPPORT_RE.search(lower) and not AGAINST_RE.search(lower):
        stance = "support"
    elif AGAINST_RE.search(lower) and not SUPPORT_RE.search(lower):
        stance = "against"

    zipcode = derive_zip_from_phone(phone)
    district = "CA-09"
    summary = (text[:180].strip() + "…") if len(text) > 180 else (text or "No transcript provided.")

    return {
        "issue": issue,
        "stance": stance,
        "summary": summary,
        "zipcode": zipcode,
        "district": district,
    }


def _stance_to_api(s):
    """Llama returns 'oppose'; frontend/CSV use 'against'."""
    if s == "oppose":
        return "against"
    return s or "neutral"


def llama_stance_and_reason(transcript, bill_name, issue_name):
    """
    Get bill_stance, bill_reason, issue_stance, issue_reason from llama_extraction.
    Returns dict with those four keys; empty string on missing topic or if Llama unavailable/fails.
    """
    out = {"bill_stance": "", "bill_reason": "", "issue_stance": "", "issue_reason": ""}
    if not (detect_stance and summarize_reason):
        return out
    transcript = (transcript or "").strip()
    if not transcript:
        return out

    if bill_name:
        try:
            out["bill_stance"] = _stance_to_api(detect_stance(transcript, bill_name))
            out["bill_reason"] = (summarize_reason(transcript, bill_name) or "").strip()[:500]
        except Exception:
            pass
    if issue_name:
        try:
            out["issue_stance"] = _stance_to_api(detect_stance(transcript, issue_name))
            out["issue_reason"] = (summarize_reason(transcript, issue_name) or "").strip()[:500]
        except Exception:
            pass
    return out


# Hardcoded lat/lng when zip isn't in the dataset (approx CA-09 district center)
DEFAULT_LAT, DEFAULT_LNG = 38.0, -121.3


def zip_to_lat_lng():
    """Build zip -> (lat, lng) from existing dataset so new rows get plausible coordinates."""
    lookup = {}
    if not DATASET_PATH.exists():
        return lookup
    try:
        with open(DATASET_PATH, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                z, lat, lng = row.get("zip_code", "").strip(), row.get("latitude", "").strip(), row.get("longitude", "").strip()
                if z and z not in lookup and lat and lng:
                    try:
                        lookup[z] = (float(lat), float(lng))
                    except ValueError:
                        pass
    except Exception:
        pass
    return lookup


# Cache zip -> (lat, lng) from dataset; rebuilt on first append (or use default)
_zip_lat_lng = None


def get_lat_lng_for_zip(zipcode):
    global _zip_lat_lng
    if _zip_lat_lng is None:
        _zip_lat_lng = zip_to_lat_lng()
    lat, lng = _zip_lat_lng.get(zipcode, (DEFAULT_LAT, DEFAULT_LNG))
    return str(lat), str(lng)


def next_id():
    """Return next id (max existing id + 1) or 1 if file missing/empty."""
    if not DATASET_PATH.exists():
        return 1
    try:
        with open(DATASET_PATH, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            ids = [int(row.get("id", 0)) for row in reader if str(row.get("id", "")).isdigit()]
        return max(ids, default=0) + 1
    except Exception:
        return 1


def append_row(transcript, phone, extracted, analysis, llama_values=None):
    """Append one row to calls_dataset.csv. extracted = { bill_name, issue_name } from process_transcript.
    llama_values = { bill_stance, bill_reason, issue_stance, issue_reason } from llama_extraction (optional).
    """
    new_id = next_id()
    zipcode = analysis.get("zipcode") or derive_zip_from_phone(phone)
    district = analysis.get("district") or "CA-09"
    mock_stance = analysis.get("stance") or ""
    issue_name = (extracted.get("issue_name") or analysis.get("issue") or "").strip()
    mock_summary = (analysis.get("summary") or "").strip()[:500]
    bill_name = (extracted.get("bill_name") or "").strip()

    llama = llama_values or {}
    bill_stance = (llama.get("bill_stance") or "").strip() or (mock_stance if bill_name else "")
    bill_reason = (llama.get("bill_reason") or "").strip()
    issue_stance = (llama.get("issue_stance") or "").strip() or (mock_stance if issue_name else "")
    issue_reason = (llama.get("issue_reason") or "").strip() or mock_summary

    # Lat/lng: from zip lookup when available, else hardcoded CA-09 default
    lat, lng = get_lat_lng_for_zip(zipcode)
    if not lat or not lng:
        lat, lng = str(DEFAULT_LAT), str(DEFAULT_LNG)

    row = {
        "id": new_id,
        "transcript_text": (transcript or "").strip(),
        "bill_name": bill_name,
        "bill_stance": bill_stance,
        "bill_reason": bill_reason,
        "issue_name": issue_name,
        "issue_stance": issue_stance,
        "issue_reason": issue_reason,
        "district": district,
        "state": "CA",
        "zip_code": zipcode,
        "latitude": lat,
        "longitude": lng,
        "call_timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3],
    }

    file_exists = DATASET_PATH.exists()
    fieldnames = list(row.keys())

    with open(DATASET_PATH, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    """Analyze transcript, append to dataset, return UI payload."""
    data = request.get_json() or {}
    transcript = data.get("transcript", "").strip()
    phone = data.get("phone", "")

    if not transcript:
        return jsonify({"error": "transcript is required"}), 400

    # Run same mock logic as frontend for issue/stance/summary
    analysis = analyze_mock(transcript, phone)

    # Run your teammate's extraction for bill_name / issue_name (optional)
    extracted = {}
    if process_transcript:
        try:
            extracted = process_transcript(transcript) or {}
        except Exception:
            pass

    bill_name = (extracted.get("bill_name") or "").strip()
    issue_name = (extracted.get("issue_name") or analysis.get("issue") or "").strip()

    # Bill stance and issue reason (and related) from llama_extraction when available
    llama_values = llama_stance_and_reason(transcript, bill_name, issue_name)

    # So the UI shows Llama-derived stance/summary when we have them
    if llama_values.get("issue_stance"):
        analysis["stance"] = llama_values["issue_stance"]
    if llama_values.get("issue_reason"):
        analysis["summary"] = llama_values["issue_reason"]

    # Append new row to CSV so dataset grows in real time
    try:
        append_row(transcript, phone, extracted, analysis, llama_values=llama_values)
    except Exception as e:
        return jsonify({"error": f"Failed to append to dataset: {e}"}), 500

    return jsonify(analysis)


if __name__ == "__main__":
    print("Backend running. Frontend should use this URL as OPINION_API_BASE.")
    print("Dataset path:", DATASET_PATH)
    app.run(host="0.0.0.0", port=5001, debug=True)
