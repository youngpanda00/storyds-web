#!/usr/bin/env python3
"""Build the site's generated parts. Run after editing LegalText.swift, the header or footer,
or styles.css / main.js / stories.js:

    python3 scripts/build.py [path/to/LegalText.swift]

1. privacy.html, terms.html and guidelines.html come from the iOS app's LegalText.swift,
   so the website and the in-app legal pages never drift. support.html is written here too.
2. The shared header and footer are written into the hand-made pages (index, story, about)
   between their <!--HEADER--> / <!--FOOTER--> markers, and every ?v= asset version is synced.
3. Each page's title, description, canonical URL, link-preview tags and structured data go
   between its <!--SEO--> markers, and sitemap.xml + robots.txt are written. The sitemap lists
   every published story, so re-run before pushing to pick up new ones.

Format (same rules as the app's LegalPageView): the first line is the title,
"Last updated" is shown small, "1. Heading" lines become headings,
everything else is a paragraph.
"""

import html
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Bump with styles.css / main.js changes so browsers don't pair new HTML with cached assets
ASSET_VERSION = "44"
# The live address. Change this one line if the site moves to its own domain.
SITE_URL = "https://youngpanda00.github.io/storyds-web/"
DEFAULT_SOURCE = ROOT.parent / "Storyds" / "Storyds" / "Features" / "Settings" / "LegalText.swift"

PAGES = [
    # (Swift constant, output file, nav label, meta description)
    ("privacyPolicyContent", "privacy.html", "Privacy", "What Storyds collects, how it's used, and how to delete your account and data."),
    ("termsOfServiceContent", "terms.html", "Terms", "The rules for using Storyds and publishing your short stories on it."),
    ("communityGuidelinesContent", "guidelines.html", "Community Guidelines", "What's welcome on Storyds, what isn't, and how reporting and blocking work."),
]

NAV = [("support.html", "Support")] + [(f, label) for _, f, label, _ in PAGES]

APP_DESCRIPTION = (
    "Storyds is a free iPhone app for reading and writing short stories you can finish in one sitting."
)

# Per hand-made page: (title, description)
HAND_SEO = {
    "index.html": (
        "Storyds · Short stories you can read in five minutes",
        "Read short, honest stories from the Storyds community, new every day. "
        "Fiction, romance, fantasy, sci-fi and more, each one finished in a single sitting.",
    ),
    "about.html": (
        "About Storyds · A short story app for iPhone",
        APP_DESCRIPTION + " Read the latest stories online, or swipe through them in the app.",
    ),
    # story.js replaces these with the story's own once it loads
    "story.html": ("A short story on Storyds", "A short story on Storyds, finished in a single sitting."),
}

# Hand-made pages that get the shared header and footer, and the main nav item each one marks current
HAND_PAGES = {"index.html": "./", "story.html": "./", "about.html": "about.html"}

MAIN_NAV = [("./", "Stories"), ("about.html", "About")]


def header(current: str) -> str:
    current_attr = ' aria-current="page"'
    links = "\n        ".join(
        f'<a href="{href}"{current_attr if href == current else ""}>{label}</a>' for href, label in MAIN_NAV
    )
    return f"""<!--HEADER-->
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="./" aria-label="Storyds home">
        <img src="assets/mark.png" alt="" width="22" height="26">
        <span>Storyds</span>
      </a>
      <nav class="nav" aria-label="Main">
        {links}
      </nav>
    </div>
  </header>
  <!--/HEADER-->"""


FOOTER = """<!--FOOTER-->
  <footer class="site-footer">
    <div class="wrap">
      <span>© 2026 Storyds</span>
      <nav aria-label="Footer">
        <a href="about.html">About</a>
        <a href="support.html">Support</a>
        <a href="privacy.html">Privacy</a>
        <a href="terms.html">Terms</a>
        <a href="guidelines.html">Community Guidelines</a>
      </nav>
    </div>
  </footer>
  <!--/FOOTER-->"""


def sync_shared(text: str, current: str) -> str:
    text = re.sub(r"<!--HEADER-->(.*?<!--/HEADER-->)?", lambda _: header(current), text, count=1, flags=re.S)
    text = re.sub(r"<!--FOOTER-->(.*?<!--/FOOTER-->)?", lambda _: FOOTER, text, count=1, flags=re.S)
    return re.sub(r"((?:styles\.css|main\.js|stories\.js)\?v=)\w+", rf"\g<1>{ASSET_VERSION}", text)


def page_url(filename: str) -> str:
    return SITE_URL if filename == "index.html" else SITE_URL + filename


def seo(filename: str, title: str, description: str, data: list = None) -> str:
    url = page_url(filename)
    tags = [
        f"<title>{html.escape(title)}</title>",
        f'<meta name="description" content="{html.escape(description)}">',
        f'<link rel="canonical" href="{url}">',
        '<meta property="og:site_name" content="Storyds">',
        f'<meta property="og:type" content="{"article" if filename == "story.html" else "website"}">',
        f'<meta property="og:title" content="{html.escape(title)}">',
        f'<meta property="og:description" content="{html.escape(description)}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{SITE_URL}assets/wordmark-square.png">',
        '<meta name="twitter:card" content="summary">',
    ]
    if data:
        graph = json.dumps({"@context": "https://schema.org", "@graph": data}, ensure_ascii=False, indent=2)
        tags.append(f'<script type="application/ld+json">\n{graph}\n  </script>')
    return "<!--SEO-->\n  " + "\n  ".join(tags) + "\n  <!--/SEO-->"


def organization() -> dict:
    return {
        "@type": "Organization",
        "@id": SITE_URL + "#org",
        "name": "Storyds",
        "url": SITE_URL,
        "logo": SITE_URL + "assets/apple-touch-icon.png",
    }


def faq_items(text: str) -> list:
    """The FAQ structured data, read from the page's own <details> so the two never drift."""
    items = []
    for q, a in re.findall(r"<summary>(.*?)</summary>\s*<p>(.*?)</p>", text, re.S):
        answer = html.unescape(re.sub(r"<[^>]+>", "", a)).strip()
        items.append({"@type": "Question", "name": html.unescape(q), "acceptedAnswer": {"@type": "Answer", "text": answer}})
    return items


def structured_data(filename: str, text: str) -> list:
    if filename == "index.html":
        return [organization(), {"@type": "WebSite", "name": "Storyds", "url": SITE_URL, "publisher": {"@id": SITE_URL + "#org"}}]
    if filename == "about.html":
        return [
            organization(),
            {
                "@type": "MobileApplication",
                "name": "Storyds",
                "operatingSystem": "iOS",
                "applicationCategory": "BookApplication",
                "description": APP_DESCRIPTION,
                "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
                "publisher": {"@id": SITE_URL + "#org"},
            },
            {"@type": "FAQPage", "mainEntity": faq_items(text)},
        ]
    return []


def sync_seo(filename: str, text: str) -> str:
    title, description = HAND_SEO[filename]
    block = seo(filename, title, description, structured_data(filename, text))
    return re.sub(r"<!--SEO-->.*?<!--/SEO-->", lambda _: block, text, count=1, flags=re.S)


def published_stories() -> list:
    """(id, created_at) for every published story, read with the same public key the site uses."""
    js = (ROOT / "stories.js").read_text()
    base = re.search(r'SUPABASE_URL = "([^"]+)"', js).group(1)
    key = re.search(r'SUPABASE_KEY = "([^"]+)"', js).group(1)
    req = urllib.request.Request(
        f"{base}/rest/v1/posts?select=id,created_at&order=created_at.desc",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        return [(r["id"], r["created_at"][:10]) for r in json.load(res)]


def write_sitemap() -> None:
    urls = [(page_url(f), None) for f in ["index.html", "about.html", "support.html", "privacy.html", "terms.html", "guidelines.html"]]
    try:
        stories = published_stories()
        urls += [(f"{SITE_URL}story.html?id={sid}", day) for sid, day in stories]
        print(f"sitemap: {len(stories)} stories")
    except Exception as e:  # offline: still write the static pages
        print(f"sitemap: couldn't fetch stories ({e}), static pages only")
    entries = "\n".join(
        f"  <url><loc>{html.escape(u)}</loc>" + (f"<lastmod>{d}</lastmod>" if d else "") + "</url>" for u, d in urls
    )
    (ROOT / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{entries}\n</urlset>\n'
    )
    (ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}sitemap.xml\n")
    print("wrote sitemap.xml, robots.txt")


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
  {seo(current, f"{title} · Storyds", description)}
  <link rel="icon" type="image/png" href="assets/favicon.png">
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
  <link rel="stylesheet" href="styles.css?v={ASSET_VERSION}">
</head>
<body>
  {header("")}

  <main class="doc">
    <div class="wrap">
      <nav class="doc-nav" aria-label="Help and legal">
          {nav}
      </nav>
      <h1>{html.escape(title)}</h1>
        {body}
    </div>
  </main>

  {FOOTER}
  <script src="main.js?v={ASSET_VERSION}"></script>
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

    for const, filename, _, desc in PAGES:
        title, body = render_body(consts[const], email)
        (ROOT / filename).write_text(shell(title, desc, filename, body))
        print(f"wrote {filename}")

    (ROOT / "support.html").write_text(
        shell("Support", "Get help with the Storyds app: contact support, report a story or writer, or delete your account.", "support.html", support_body(email))
    )
    print("wrote support.html")

    for filename, current in HAND_PAGES.items():
        path = ROOT / filename
        path.write_text(sync_seo(filename, sync_shared(path.read_text(), current)))
        print(f"synced {filename}")

    write_sitemap()


if __name__ == "__main__":
    main()
