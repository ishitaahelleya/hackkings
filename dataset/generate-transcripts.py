import csv
import random
from datetime import datetime, timedelta

# Bills
BILLS = [
    "Respect for Marriage Act (H.R.8404)",
    "Treat and Reduce Obesity Act (H.R.4818)",
    "SAVE Act (H.R.22)",
    "Epstein Files Transparency Act (H.R.4405)",
    "Reconciliation Act (H.R.1)",
    "Impeachment Resolution (H.Res.353)",
    "Stop the Sexualization of Children Act (H.R.7661)",
    "SAVE America Act (H.R.7296)",
    "Consolidated Appropriations Act 2026 (H.R.7148)",
    "ROTOR Act (S.2503)"
]

ISSUES = [
    "immigration enforcement and ICE policy",
    "housing affordability in the Central Valley",
    "water shortages affecting agriculture",
    "the war with Iran",
    "the humanitarian situation in Gaza",
    "rising cost of living",
    "healthcare affordability",
    "energy prices",
]

ZIP_CODES = ["95207","95210","95219","95336","95376","95330"]

def random_coordinates():
    lat = round(random.uniform(37.8, 38.2),6)
    lon = round(random.uniform(-121.5, -121.1),6)
    return lat, lon


def bill_transcript():

    bill = random.choice(BILLS)
    stance = random.choice(["support","oppose"])

    reasons = [
        "because it would help families in our district",
        "because I think it goes too far",
        "because I believe it's important for the country",
        "because I don't think taxpayer money should go toward it",
        "because it would help working people",
        "because I have concerns about the policy"
    ]

    reason = random.choice(reasons)

    return f"Hi I'm a constituent of Congressman Josh Harder. I'm calling about the {bill}. I {stance} this bill {reason}. Thank you, have a good day."


def issue_transcript():

    issue = random.choice(ISSUES)

    opinions = [
        "I'm really concerned about",
        "I strongly support action on",
        "I'm worried about",
        "I hope Congress addresses",
    ]

    opener = random.choice(opinions)

    return f"Hi I'm a constituent of Congressman Josh Harder. {opener} {issue}. I hope the Congressman takes this issue seriously. Thank you."


def both_transcript():

    bill = random.choice(BILLS)
    issue = random.choice(ISSUES)

    stance = random.choice(["support","oppose"])

    return f"Hi I'm a constituent of Congressman Josh Harder. I'm calling about the {bill}. I {stance} it. I also want to mention concerns about {issue}. Thank you."


def neutral_transcript():

    messages = [
        "I'm calling because families in our district are struggling with the cost of living.",
        "I just wanted to share concerns about economic conditions in our community.",
        "I hope Congress focuses on helping working families.",
        "I wanted to express concerns about national policy decisions affecting our district."
    ]

    return f"Hi I'm a constituent of Congressman Josh Harder. {random.choice(messages)} Thank you."


def generate_dataset(n=375):

    rows=[]

    for i in range(1,n+1):

        call_type=random.choice(["bill","issue","both","none"])

        if call_type=="bill":
            transcript=bill_transcript()

        elif call_type=="issue":
            transcript=issue_transcript()

        elif call_type=="both":
            transcript=both_transcript()

        else:
            transcript=neutral_transcript()

        zip_code=random.choice(ZIP_CODES)
        lat,lon=random_coordinates()

        timestamp=datetime.now()-timedelta(minutes=random.randint(0,10000))

        rows.append([
            i,
            transcript,
            "", "", "", "", "", "",
            "CA-09",
            "CA",
            zip_code,
            lat,
            lon,
            timestamp.isoformat()
        ])

    with open("calls_dataset.csv","w",newline="") as f:

        writer=csv.writer(f)

        writer.writerow([
            "id",
            "transcript_text",
            "bill_name",
            "bill_stance",
            "bill_reason",
            "issue_name",
            "issue_stance",
            "issue_reason",
            "district",
            "state",
            "zip_code",
            "latitude",
            "longitude",
            "call_timestamp"
        ])

        writer.writerows(rows)

    print("Dataset generated: calls_dataset.csv")


generate_dataset()