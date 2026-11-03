# Storyds website

Marketing site and help/legal pages for [Storyds](https://github.com/youngpanda00/Storyds), the iPhone app for short stories you can finish in one sitting.

Plain static HTML/CSS/JS with no build step, served by GitHub Pages.

| Page | File |
| --- | --- |
| Home | `index.html` |
| Support | `support.html` |
| Privacy Policy | `privacy.html` |
| Terms of Service | `terms.html` |
| Community Guidelines | `guidelines.html` |

The privacy, terms and guidelines pages are generated from the app's
`Storyds/Features/Settings/LegalText.swift`, so the website and the in-app text always match.
After editing that file, regenerate them:

```sh
python3 scripts/build_legal.py            # expects ../Storyds next to this repo
python3 scripts/build_legal.py path/to/LegalText.swift
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

GitHub Pages lets browsers cache files for 10 minutes. When you change `styles.css` or `main.js`,
bump `?v=` in `index.html` and `ASSET_VERSION` in `scripts/build_legal.py`, then rerun the script.
