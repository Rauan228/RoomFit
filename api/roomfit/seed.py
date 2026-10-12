"""Explicit publication of built-in templates; never modifies user projects."""
import argparse,json
from pathlib import Path
from .database import SessionLocal,Template
from .validation import validate_document
parser=argparse.ArgumentParser();parser.add_argument('--refresh-defaults',action='store_true');args=parser.parse_args()
with SessionLocal() as session:
    for item in json.loads(Path(__file__).with_name('templates.json').read_text(encoding='utf-8')):
        t=session.get(Template,item['id'])
        if t and not args.refresh_defaults:continue
        document=validate_document(item['document'])
        if t:t.name=item['name'];t.document=document
        else:session.add(Template(id=item['id'],name=item['name'],document=document))
    session.commit()
print('Built-in templates published. User projects preserved.')
