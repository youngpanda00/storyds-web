#!/usr/bin/env python3
"""Build privacy.html, terms.html and guidelines.html from the iOS app's LegalText.swift.

The app is the source of truth, so the website and the in-app legal pages never drift.
Run after editing LegalText.swift:

    python3 scripts/build_legal.py [path/to/LegalText.swift]

Format (same rules as the app's LegalPageView): the first line is the title,
"Last updated" is shown small, "1. Heading" lines become headings,
everything else is a paragraph.
"""

import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = ROOT.parent / "Storyds" / "Storyds" / "Features" / "Settings" / "LegalText.swift"

PAGES = [
    # (Swift constant, output file, nav label)
    ("privacyPolicyContent", "privacy.html", "Privacy"),
    ("termsOfServiceContent", "terms.html", "Terms"),
    ("communityGuidelinesContent", "guidelines.html", "Community Guidelines"),
]

NAV = [("support.html", "Support")] + [(f, label) for _, f, label in PAGES]


def read_constants(swift: str) -> dict:
    values = dict(re.findall(r'let (\w+) = "([^"\n]*)"', swift))
    blocks = dict(re.findall(r'let (\w+) = """\n(.*?)\n"""', swift, re.S))
    email = values["supportEmail"]
    return {k: v.replace(r"\(supportEmail)", email) for k, v in blocks.items()} | {"supportEmail": email}


def linkify(text: str, email: str) -> str:
    escaped = html.escape(text, quote=False)
    return escaped.replace(email, f'<a href="mailto:{email}">{email}</a>')


def render_body(text: str, email: str) -> tuple[str, str]:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    title, rest = lines[0], lines[1:]
    out = []
    intro_done = False
    for line in rest:
        if line.startswith("Last updated"):
            out.append(f'<p class="updated">{html.escape(line)}</p>')
        elif re.match(r"^\d+\.\s", line):
            intro_done = True
            out.append(f"<h2>{html.escape(line)}</h2>")
        else:
            cls = "" if intro_done else ' class="intro"'
            out.append(f"<p{cls}>{linkify(line, email)}</p>")
    return title, "\n        ".join(out)


def shell(title: str, description: str, current: str, body: str) -> str:
    current_attr = ' aria-current="page"'
    nav = "\n          ".join(
        f'<a href="{f}"{current_attr if f == current else ""}>{label}</a>' for f, label in NAV
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)} · Storyds</title>
  <meta name="description" content="{html.escape(description)}">
  <link rel="icon" type="image/png" href="assets/favicon.png">
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,400;1,500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="./" aria-label="Storyds home">
        <img src="assets/mark.png" alt="" width="22" height="26">
        <span>Storyds</span>
      </a>
      <nav class="nav" aria-label="Main">
        <a class="btn" href="./#download">Get the app</a>
      </nav>
    </div>
  </header>

  <main class="doc">
    <div class="wrap">
      <nav class="doc-nav" aria-label="Help and legal">
          {nav}
      </nav>
      <h1>{html.escape(title)}</h1>
        {body}
    </div>
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <span>© 2026 Storyds</span>
      <nav aria-label="Footer">
        <a href="support.html">Support</a>
        <a href="privacy.html">Privacy</a>
        <a href="terms.html">Terms</a>
        <a href="guidelines.html">Community Guidelines</a>
      </nav>
    </div>
  </footer>
  <script src="main.js"></script>
</body>
</html>
"""


def support_body(email: str) -> str:
    return f"""<p class="intro">Something not working, or a question about your account? We read every message.</p>
        <div class="contact-card">
          <img class="doodle" src="assets/illustrations/QuietBell.svg" alt="" width="106" height="90">
          <div>
            <p>Email us and we’ll get back to you as soon as we can.</p>
            <a class="btn" href="mailto:{email}">{email}</a>
          </div>
        </div>
        <h2>In the app</h2>
        <p>Go to Profile › Settings › Report &amp; feedback to send a bug report or suggestion straight from your phone.</p>
        <h2>Report a story or a writer</h2>
        <p>Open the story, tap ••• and choose Report story. To stop seeing a writer’s stories, choose Block. Reports are private: the writer isn’t told who reported them. Read the <a href="guidelines.html">Community Guidelines</a> for what’s allowed.</p>
        <h2>Delete your account</h2>
        <p>Go to Profile › Settings › Delete account. Your stories, loves, blocks and profile are deleted, and backups are cleared within 30 days. See the <a href="privacy.html">Privacy Policy</a>.</p>"""


def main() -> None:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    consts = read_constants(source.read_text())
    email = consts["supportEmail"]

    for const, filename, _ in PAGES:
        title, body = render_body(consts[const], email)
        desc = f"Storyds {title}."
        (ROOT / filename).write_text(shell(title, desc, filename, body))
        print(f"wrote {filename}")

    (ROOT / "support.html").write_text(
        shell("Support", "Get help with Storyds.", "support.html", support_body(email))
    )
    print("wrote support.html")


if __name__ == "__main__":
    main()
