#!/usr/bin/env python3
"""Write demo/stories.json (git-ignored) from the iOS app's MockSeed.swift, so ?demo shows
the same sample stories as the app's mock backend:

    python3 scripts/demo_seed.py [path/to/MockSeed.swift]
"""

import json
import re
import sys
import textwrap
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = ROOT.parent / "Storyds" / "Storyds" / "Services" / "MockSeed.swift"

USER_RE = re.compile(r'let (\w+) = user\((\d+), "([^"]+)", avatar: (\d+)\)')
POST_RE = re.compile(
    r'add\((\w+), (?:"((?:[^"\\]|\\.)*)"|nil), (?:"([^"]*)"|nil), ([\d.]+)'
    r'(?:, image: image\("([^"]+)"\))?, """\n(.*?)\n\s*"""\)',
    re.S,
)


def demo_uuid(kind, n):
    # story.html only accepts UUID-shaped ids (kind 0 = user, 1 = post)
    return f"00000000-0000-4000-800{kind}-{n:012d}"


def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    swift = source.read_text()

    users = {"demoUser": {"id": demo_uuid(0, 0), "username": "storyds_demo",
                          "avatar_url": "https://i.pravatar.cc/200?img=5"}}
    for var, n, name, avatar in USER_RE.findall(swift):
        users[var] = {"id": demo_uuid(0, int(n)), "username": name,
                      "avatar_url": f"https://i.pravatar.cc/200?img={avatar}"}

    now = datetime.now(timezone.utc)
    posts = []
    for i, (var, title, genre, hours, image, body) in enumerate(POST_RE.findall(swift), 1):
        content = textwrap.dedent(body).replace('\\"', '"').strip()
        # Blank lines in Swift separate paragraphs; the site starts a paragraph per line break
        content = "\n".join(p for p in content.split("\n") if p.strip())
        posts.append({
            "id": demo_uuid(1, i),
            "user_id": users[var]["id"],
            "title": title.replace('\\"', '"') or None,
            "content": content,
            "genre": genre or None,
            "image_url": f"https://picsum.photos/seed/{image}/1000/600" if image else None,
            "created_at": (now - timedelta(hours=float(hours))).isoformat(),
        })

    if not posts:
        sys.exit(f"No posts found in {source}")
    out = ROOT / "demo" / "stories.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"profiles": list(users.values()), "posts": posts}, indent=2, ensure_ascii=False))
    print(f"Wrote {len(posts)} stories by {len({p['user_id'] for p in posts})} authors to {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
