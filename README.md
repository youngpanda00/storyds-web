# Storyds website

Marketing site and help/legal pages for [Storyds](https://github.com/youngpanda00/Storyds), the iPhone app for short stories you can finish in one sitting.

Plain static HTML/CSS/JS with no build step, served by GitHub Pages.

| Page | File |
| --- | --- |
| Stories (home) | `index.html` |
| One story | `story.html?id=<story id>` |
| About | `about.html` |
| Support | `support.html` |
| Privacy Policy | `privacy.html` |
| Terms of Service | `terms.html` |
| Community Guidelines | `guidelines.html` |

Stories load in the browser from the app's Supabase project (`stories.js`), using the same
public anon key as the iOS app. Row level security decides what's readable.

`scripts/build.py` generates the rest:

- privacy, terms and guidelines pages from the app's `Storyds/Features/Settings/LegalText.swift`,
  so the website and the in-app text always match, plus `support.html`
- the shared header and footer inside `index.html`, `story.html` and `about.html`
  (between the `<!--HEADER-->` / `<!--FOOTER-->` markers)
- the `?v=` version on every CSS/JS link

```sh
python3 scripts/build.py                  # expects ../Storyds next to this repo
python3 scripts/build.py path/to/LegalText.swift
```

## Run locally

```sh
python3 -m http.server 8098
```

Then open http://127.0.0.1:8098.

## App Store Connect

Use these URLs once Pages is live:

- Support URL: `/support.html`
- Privacy Policy URL: `/privacy.html`

## Cache busting

GitHub Pages lets browsers cache files for 10 minutes. When you change `styles.css`, `main.js` or
`stories.js`, bump `ASSET_VERSION` in `scripts/build.py` and rerun it.
