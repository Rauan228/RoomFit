"""Explicit publication of built-in templates; never modifies user projects."""

import argparse, json
from pathlib import Path
from .database import SessionLocal, Template, Catalog
from .validation import validate_document, validate_catalog

parser = argparse.ArgumentParser()
parser.add_argument("--refresh-defaults", action="store_true")
parser.add_argument("--refresh-catalog", action="store_true")
args = parser.parse_args()
with SessionLocal() as session:
    if args.refresh_catalog:
        for item in json.loads(Path(__file__).with_name("catalog.json").read_text(encoding="utf-8")):
            data = validate_catalog(item)
            record = session.get(Catalog, item["id"])
            if record:
                record.data = data
            else:
                session.add(Catalog(id=item["id"], data=data))
    for item in json.loads(
        Path(__file__).with_name("templates.json").read_text(encoding="utf-8")
    ):
        t = session.get(Template, item["id"])
        if t and not args.refresh_defaults:
            continue
        document = validate_document(item["document"])
        if t:
            t.name = item["name"]
            t.document = document
        else:
            session.add(Template(id=item["id"], name=item["name"], document=document))
    session.commit()
print("Built-in templates published. User projects preserved.")
