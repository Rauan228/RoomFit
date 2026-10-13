"""Read RoomFit's anonymous event log on the VPS; output aggregate counts."""
import argparse
import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--log", default="/var/log/nginx/roomfit-events.log")
parser.add_argument("--days", type=int, default=30)
args = parser.parse_args()
cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, args.days))
counts = Counter()
path = Path(args.log)
if not path.exists():
    raise SystemExit("No RoomFit event log yet.")
for line in path.read_text(encoding="utf-8").splitlines():
    try:
        record = json.loads(line)
        if datetime.fromisoformat(record["at"]) >= cutoff:
            counts[(record["source"], record["event"])] += 1
    except (ValueError, KeyError, TypeError):
        continue
events = ["page_view", "platform_click", "signup_complete", "project_created", "project_saved"]
print("Source".ljust(14) + "".join(event.rjust(20) for event in events))
for source in sorted({key[0] for key in counts}):
    print(source.ljust(14) + "".join(str(counts[source, event]).rjust(20) for event in events))
print("\nEvent counts, not unique visitors. Source attribution is approximate.")
