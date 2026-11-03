// Storyds stories: loads published stories straight from Supabase and renders
// the home feed (index.html) and a single story (story.html?id=…).

(function () {
  // Same project and anon key as the iOS app (SupabaseService.swift). The anon key is
  // public by design: access is limited by row level security (supabase/schema.sql).
  const SUPABASE_URL = "https://sdwhmsjtntwxvchxbtth.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkd2htc2p0bnR3eHZjaHhidHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MjcyMjMsImV4cCI6MjEwOTIwMzIyM30.vcRbQS7sOxlDlLuJtHxGFuox6yWj4Rm4e4DRfBsAPMA";
  const SUPPORT_EMAIL = "support@storyds.app";
  const GENRES = ["Fiction", "Romance", "Slice of Life", "Fantasy", "Sci-Fi", "Dark", "Reflective"];
  const PAGE_SIZE = 60;
  const POST_COLUMNS = "id,user_id,title,content,genre,image_url,created_at";

  // Local preview only: ?demo mixes in sample stories from demo/stories.json, which is
  // git-ignored and built from the app's MockSeed.swift. Remembered for the tab; ?demo=0 turns it off.
  const DEMO = (() => {
    try {
      const q = new URLSearchParams(location.search);
      if (q.has("demo")) sessionStorage.setItem("storyds-demo", q.get("demo") === "0" ? "" : "1");
      return sessionStorage.getItem("storyds-demo") === "1";
    } catch (_) {
      return false;
    }
  })();

  // MARK: - Data

  async function rest(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  // Authors come from profiles in a second query, like the app's withAuthors().
  // Only public columns are requested.
  async function withAuthors(posts) {
    const ids = [...new Set(posts.map((p) => p.user_id))];
    let profiles = {};
    if (ids.length) {
      try {
        const rows = await rest(`profiles?select=id,username,avatar_url&id=in.(${ids.join(",")})`);
        profiles = Object.fromEntries(rows.map((r) => [r.id, r]));
      } catch (_) {
        // Stories still show without author names
      }
    }
    return decorate(posts, profiles);
  }

  function decorate(posts, profiles) {
    return posts
      .filter((p) => p.content && p.content.trim())
      .map((p) => ({
        ...p,
        author: profiles[p.user_id]?.username || "Unknown",
        avatar: safeURL(profiles[p.user_id]?.avatar_url),
        cover: safeURL(p.image_url),
        minutes: readMinutes(p.content),
      }));
  }

  async function fetchLatest() {
    const demo = await demoStories();
    let posts;
    try {
      posts = await withAuthors(await rest(`posts?select=${POST_COLUMNS}&order=created_at.desc&limit=${PAGE_SIZE}`));
    } catch (err) {
      if (!demo) throw err;
      posts = [];
    }
    if (!demo) return posts;
    return [...posts, ...demo].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async function fetchStory(id) {
    const demo = await demoStories();
    const fromDemo = demo && demo.find((s) => s.id === id);
    if (fromDemo) return fromDemo;
    const rows = await rest(`posts?select=${POST_COLUMNS}&id=eq.${encodeURIComponent(id)}`);
    return (await withAuthors(rows))[0] || null;
  }

  let demoCache;
  async function demoStories() {
    if (!DEMO) return null;
    if (demoCache === undefined) {
      try {
        const res = await fetch("demo/stories.json");
        const data = res.ok ? await res.json() : null;
        demoCache = data ? decorate(data.posts, Object.fromEntries(data.profiles.map((r) => [r.id, r]))) : null;
      } catch (_) {
        demoCache = null;
      }
    }
    return demoCache;
  }

  // MARK: - Helpers

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c != null) node.append(c);
    return node;
  }

  // Only show images served over https (story covers and avatars are user-provided)
  function safeURL(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      return u.protocol === "https:" ? u.href : null;
    } catch (_) {
      return null;
    }
  }

  // Same rule as Post.readMinutes in the app: 200 words a minute, rounded up
  function readMinutes(text) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
  }

  // Every line break starts a paragraph, like StoryBodyText in the app
  function paragraphs(text) {
    return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }

  function excerpt(text, max) {
    const flat = paragraphs(text).join(" ");
    if (flat.length <= max) return flat;
    return flat.slice(0, flat.lastIndexOf(" ", max)).replace(/[\s.,;:!?—–-]+$/, "") + "…";
  }

  function timeAgo(iso) {
    const then = new Date(iso);
    const s = (Date.now() - then.getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
    const sameYear = then.getFullYear() === new Date().getFullYear();
    return then.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
  }

  function storyURL(story) {
    return `story.html?id=${story.id}`;
  }

  function meta(story) {
    return el("div", { class: "card-meta", text: [story.genre, `${story.minutes} min read`].filter(Boolean).join(" · ") });
  }

  function avatar(story, size) {
    const cls = "avatar" + (size === "lg" ? " lg" : "");
    const initial = () => el("span", { class: cls, "aria-hidden": "true", text: story.author[0] || "?" });
    if (!story.avatar) return initial();
    const img = el("img", { class: cls, src: story.avatar, alt: "", loading: "lazy" });
    img.addEventListener("error", () => img.replaceWith(initial()));
    return img;
  }

  function byline(story, size) {
    return el(
      "div",
      { class: "byline" },
      avatar(story, size),
      el("b", { text: story.author }),
      el("span", { text: "·" }),
      el("time", { datetime: story.created_at, text: timeAgo(story.created_at) })
    );
  }

  function state({ image, w, h, title, text, action }) {
    return el(
      "div",
      { class: "state" },
      image ? el("img", { class: "doodle", src: image, alt: "", width: w, height: h }) : null,
      el("h3", { text: title }),
      text ? el("p", { text }) : null,
      action || null
    );
  }

  // A story card. "lead" is the big featured layout, "tile" the grid layout.
  function card(story, kind) {
    return el(
      "a",
      { class: `story-card ${kind} fade-in` + (story.cover ? " has-cover" : ""), href: storyURL(story) },
      story.cover ? el("div", { class: "cover-wrap" }, el("img", { class: "cover", src: story.cover, alt: "", loading: kind === "lead" ? "eager" : "lazy" })) : null,
      el(
        "div",
        { class: "card-text" },
        meta(story),
        el(kind === "lead" ? "h2" : "h3", { text: story.title || "Untitled" }),
        el("p", { class: "excerpt", text: excerpt(story.content, kind === "lead" ? 420 : story.cover ? 180 : 320) }),
        byline(story)
      )
    );
  }

  // MARK: - Home feed

  function initFeed(root) {
    const chips = document.querySelector(".chips");
    const lead = root.querySelector(".feed-lead");
    const grid = root.querySelector(".feed-grid");
    const end = root.querySelector(".feed-end");
    let stories = [];
    let filter = new URLSearchParams(location.search).get("genre") || "All";

    const live = document.querySelector(".live");
    if (DEMO && live) {
      live.classList.add("demo");
      live.lastChild.textContent = "Demo stories mixed in";
    }

    function visible() {
      if (filter === "All") return stories;
      if (filter === "Quick read") return stories.filter((s) => s.minutes <= 1);
      return stories.filter((s) => s.genre === filter);
    }

    function renderLoading() {
      const sk = (cls) => el("div", { class: `story-card ${cls} skeleton`, "aria-hidden": "true" }, el("div", { class: "cover-wrap" }), el("div", { class: "card-text" }, el("div", { class: "bar s" }), el("div", { class: "bar t" }), el("div", { class: "bar" }), el("div", { class: "bar" })));
      lead.replaceChildren(sk("lead has-cover"));
      grid.replaceChildren(sk("tile"), sk("tile"), sk("tile"));
      end.replaceChildren();
    }

    function renderError() {
      lead.replaceChildren(
        state({
          image: "assets/illustrations/Unplugged.svg", w: 141, h: 120,
          title: "Couldn’t load stories",
          text: "Check your connection and try again.",
          action: el("button", { class: "btn ghost", type: "button", text: "Try again", onclick: load }),
        })
      );
      grid.replaceChildren();
      end.replaceChildren();
    }

    function renderChips() {
      // Only genres that have stories, so a new feed doesn't open on empty tabs
      const options = ["All"];
      if (stories.length > 1 && stories.some((s) => s.minutes <= 1)) options.push("Quick read");
      options.push(...GENRES.filter((g) => stories.some((s) => s.genre === g)));
      if (!options.includes(filter)) filter = "All";

      chips.replaceChildren(
        ...options.map((name) =>
          el("button", {
            class: "chip",
            type: "button",
            "aria-pressed": String(name === filter),
            text: name,
            onclick: () => {
              filter = name;
              const url = new URL(location.href);
              if (name === "All") url.searchParams.delete("genre");
              else url.searchParams.set("genre", name);
              history.replaceState(null, "", url);
              renderChips();
              render();
            },
          })
        )
      );
      chips.closest(".tabs-bar").hidden = options.length < 2;
    }

    function render() {
      if (!stories.length) {
        lead.replaceChildren(
          state({
            image: "assets/illustrations/EmptyShelf.png", w: 141, h: 120,
            title: "No stories yet",
            text: "Be the first to write one. Stories published in the app show up here.",
          })
        );
        grid.replaceChildren();
        end.replaceChildren();
        return;
      }
      const list = visible();
      const [first, ...rest] = list;
      lead.replaceChildren(card(first, "lead"));
      grid.replaceChildren(...rest.map((s) => card(s, "tile")));
      end.replaceChildren(
        state({
          image: "assets/illustrations/AllCaughtUp.png", w: 87, h: 120,
          title: "You’re all caught up",
          text: "New stories show up here as soon as they’re published in the app.",
        })
      );
    }

    async function load() {
      renderLoading();
      try {
        stories = await fetchLatest();
        renderChips();
        render();
      } catch (_) {
        renderError();
      }
    }

    load();
  }

  // MARK: - Story page

  function initStory(article) {
    const id = new URLSearchParams(location.search).get("id") || "";
    const upNext = document.querySelector(".up-next");
    const upNextCards = upNext.querySelector(".up-next-cards");

    function renderLoading() {
      article.replaceChildren(
        el("div", { class: "wrap narrow skeleton", "aria-hidden": "true" }, el("div", { class: "bar s" }), el("div", { class: "bar t" }), el("div", { class: "bar t" }), el("div", { class: "bar" }), el("div", { class: "bar" }), el("div", { class: "bar" }), el("div", { class: "bar s" }))
      );
    }

    function renderMissing(error) {
      document.title = "Story not found · Storyds";
      article.replaceChildren(
        el(
          "div",
          { class: "wrap narrow" },
          state(
            error
              ? { image: "assets/illustrations/Unplugged.svg", w: 141, h: 120, title: "Couldn’t load this story", text: "Check your connection and try again.", action: el("button", { class: "btn ghost", type: "button", text: "Try again", onclick: load }) }
              : { image: "assets/illustrations/TornPage.svg", w: 141, h: 120, title: "This story isn’t here", text: "It may have been deleted by its writer.", action: el("a", { class: "btn ghost", href: "./", text: "Read other stories" }) }
          )
        )
      );
    }

    function render(story) {
      document.title = `${story.title || "Untitled"} · Storyds`;
      const description = document.querySelector('meta[name="description"]');
      if (description) description.setAttribute("content", excerpt(story.content, 160));

      article.replaceChildren(
        el(
          "div",
          { class: "wrap narrow fade-in" },
          el("a", { class: "crumb", href: "./", text: "← All stories" }),
          meta(story),
          el("h1", { text: story.title || "Untitled" }),
          byline(story, "lg"),
          story.cover ? el("img", { class: "story-cover", src: story.cover, alt: "" }) : null,
          el("div", { class: "story-body" }, ...paragraphs(story.content).map((p) => el("p", { text: p }))),
          el("div", { class: "the-end", text: "The end" }),
          el(
            "div",
            { class: "after-story" },
            el("img", { src: "assets/mark.png", alt: "", width: 41, height: 48 }),
            el(
              "div",
              {},
              el("p", { text: "There’s a whole feed of stories like this one. Swipe through them in the Storyds app." }),
              el("a", { class: "btn", href: "about.html#download", text: "Get the app" })
            )
          ),
          el("a", {
            class: "report",
            href: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Report story " + story.id)}&body=${encodeURIComponent(
              `Story: ${story.title || "Untitled"} by ${story.author}\nID: ${story.id}\n\nWhat's wrong with this story?\n`
            )}`,
            text: "Report this story",
          })
        )
      );
    }

    function renderUpNext(story, latest) {
      // The next older stories, wrapping around to the newest
      const others = latest.filter((s) => s.id !== story.id);
      if (!others.length) {
        upNext.hidden = true;
        return;
      }
      const index = latest.findIndex((s) => s.id === story.id);
      const ordered = index >= 0 ? [...latest.slice(index + 1), ...latest.slice(0, index)] : others;
      upNextCards.replaceChildren(...ordered.slice(0, 3).map((s) => card(s, "tile")));
      upNext.hidden = false;
    }

    async function load() {
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        renderMissing(false);
        return;
      }
      renderLoading();
      try {
        const latest = await fetchLatest();
        const story = latest.find((s) => s.id === id) || (await fetchStory(id));
        if (!story) {
          renderMissing(false);
          return;
        }
        render(story);
        renderUpNext(story, latest);
      } catch (_) {
        renderMissing(true);
      }
    }

    // Reading progress across the story body
    const bar = document.querySelector(".progress");
    const onScroll = () => {
      const body = article.querySelector(".story-body");
      if (!body || !bar) return;
      const r = body.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      const done = Math.min(1, Math.max(0, (window.innerHeight * 0.4 - r.top) / Math.max(total, 1)));
      bar.style.transform = `scaleX(${done})`;
      bar.classList.toggle("on", done > 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    load();
  }

  const feed = document.querySelector(".feed");
  if (feed) initFeed(feed);
  const article = document.querySelector(".story-article");
  if (article) initStory(article);
})();
