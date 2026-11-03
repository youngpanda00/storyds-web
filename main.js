// Storyds website: header border on scroll, reveal-on-scroll, and on the home page
// the live stories panel, which reads published stories straight from Supabase.

(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Header gets a hairline once the page scrolls
  const header = document.querySelector(".site-header");
  const onScroll = () => header && header.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Fade sections in as they enter the viewport
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  const library = document.querySelector(".library");
  if (library) initLibrary(library);
})();

// MARK: - Live stories

function initLibrary(library) {
  // Same project and anon key as the iOS app (SupabaseService.swift). The anon key is
  // public by design: access is limited by row level security (supabase/schema.sql).
  const SUPABASE_URL = "https://sdwhmsjtntwxvchxbtth.supabase.co";
  const SUPABASE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkd2htc2p0bnR3eHZjaHhidHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MjcyMjMsImV4cCI6MjEwOTIwMzIyM30.vcRbQS7sOxlDlLuJtHxGFuox6yWj4Rm4e4DRfBsAPMA";
  const SUPPORT_EMAIL = "support@storyds.app";
  const GENRES = ["Fiction", "Romance", "Slice of Life", "Fantasy", "Sci-Fi", "Dark", "Reflective"];
  const PAGE_SIZE = 60;
  const MOBILE_PREVIEW = 4;

  const list = library.querySelector(".library-list");
  const chips = library.querySelector(".chips");
  const cards = library.querySelector(".cards");
  const reader = library.querySelector(".reader");
  const readerBody = library.querySelector(".reader-body");
  const isNarrow = () => window.matchMedia("(max-width: 1023px)").matches;

  let stories = [];
  let filter = "All";
  let expanded = false;

  // ---- Data ----

  async function rest(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  async function load() {
    renderLoading();
    try {
      const posts = await rest(
        `posts?select=id,user_id,title,content,genre,image_url,created_at&order=created_at.desc&limit=${PAGE_SIZE}`
      );
      // Authors come from profiles in a second query, like the app's withAuthors().
      // Only public columns are requested.
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
      stories = posts
        .filter((p) => p.content && p.content.trim())
        .map((p) => ({
          ...p,
          author: profiles[p.user_id]?.username || "Unknown",
          avatar: safeURL(profiles[p.user_id]?.avatar_url),
          cover: safeURL(p.image_url),
          minutes: readMinutes(p.content),
        }));
      renderChips();
      route();
    } catch (err) {
      renderError();
    }
  }

  // ---- Helpers ----

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

  function excerpt(text, max = 260) {
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

  function meta(story) {
    return [story.genre, `${story.minutes} min read`].filter(Boolean).join(" · ");
  }

  function avatar(story, size) {
    const cls = "avatar" + (size === "lg" ? " lg" : "");
    if (story.avatar) {
      const img = el("img", { class: cls, src: story.avatar, alt: "", loading: "lazy" });
      // Fall back to the initial if the photo can't load
      img.addEventListener("error", () => img.replaceWith(el("span", { class: cls, text: story.author[0] || "?" })));
      return img;
    }
    return el("span", { class: cls, "aria-hidden": "true", text: story.author[0] || "?" });
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

  function visibleStories() {
    if (filter === "All") return stories;
    if (filter === "Quick read") return stories.filter((s) => s.minutes <= 1);
    return stories.filter((s) => s.genre === filter);
  }

  // ---- Rendering: list ----

  function renderChips() {
    // Only genres that have stories, so a new feed doesn't open on empty tabs
    const present = GENRES.filter((g) => stories.some((s) => s.genre === g));
    const options = ["All"];
    if (stories.some((s) => s.minutes <= 1) && stories.length > 1) options.push("Quick read");
    options.push(...present);
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
            expanded = false;
            renderChips();
            renderList();
            if (!isNarrow()) library.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
          },
        })
      )
    );
    chips.hidden = options.length < 2;
  }

  function renderLoading() {
    const skeleton = () =>
      el(
        "div",
        { class: "card skeleton", "aria-hidden": "true" },
        el("div", {}, el("div", { class: "bar s" }), el("div", { class: "bar t" }), el("div", { class: "bar" }), el("div", { class: "bar" }), el("div", { class: "bar s" })),
        el("div", { class: "thumb" })
      );
    cards.replaceChildren(skeleton(), skeleton(), skeleton());
  }

  function renderError() {
    cards.replaceChildren(
      el(
        "div",
        { class: "state" },
        el("img", { class: "doodle", src: "assets/illustrations/Unplugged.svg", alt: "", width: 141, height: 120 }),
        el("h3", { text: "Couldn’t load stories" }),
        el("p", { text: "Check your connection and try again." }),
        el("button", { class: "btn ghost", type: "button", text: "Try again", onclick: load })
      )
    );
  }

  function card(story, lead) {
    const href = `#story=${story.id}`;
    return el(
      "a",
      {
        class: "card fade-in" + (lead ? " lead" : ""),
        href,
        onclick: (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          openStory(story.id, true);
        },
      },
      el(
        "div",
        {},
        el("div", { class: "card-meta", text: meta(story) }),
        el("h3", { text: story.title || "Untitled" }),
        el("p", { class: "excerpt", text: excerpt(story.content) }),
        byline(story)
      ),
      story.cover ? el("img", { class: "thumb", src: story.cover, alt: "", loading: "lazy" }) : null
    );
  }

  function renderList() {
    const all = visibleStories();

    if (!stories.length) {
      cards.replaceChildren(
        el(
          "div",
          { class: "state" },
          el("img", { class: "doodle", src: "assets/illustrations/EmptyShelf.png", alt: "", width: 141, height: 120 }),
          el("h3", { text: "No stories yet" }),
          el("p", { text: "Be the first to write one. Stories published in the app show up here." })
        )
      );
      return;
    }

    const limit = isNarrow() && !expanded ? MOBILE_PREVIEW : all.length;
    const shown = all.slice(0, limit);
    const nodes = shown.map((s, i) => card(s, i === 0 && filter === "All"));

    if (all.length > limit) {
      nodes.push(
        el(
          "div",
          { class: "state" },
          el("button", {
            class: "btn ghost",
            type: "button",
            text: `Show ${all.length - limit} more ${all.length - limit === 1 ? "story" : "stories"}`,
            onclick: () => {
              expanded = true;
              renderList();
            },
          })
        )
      );
    } else {
      nodes.push(
        el(
          "div",
          { class: "state" },
          el("img", { class: "doodle", src: "assets/illustrations/AllCaughtUp.png", alt: "", width: 87, height: 120 }),
          el("h3", { text: "You’re all caught up" }),
          el("p", { text: "New stories show up here as soon as they’re published in the app." }),
          el("a", { class: "btn ghost", href: "#download", text: "Get Storyds for iPhone" })
        )
      );
    }
    cards.replaceChildren(...nodes);
  }

  // ---- Rendering: one story ----

  function openStory(id, push) {
    const story = stories.find((s) => s.id === id);
    if (!story) {
      showList();
      return;
    }
    if (push) history.pushState({ story: id, fromList: true }, "", `#story=${id}`);

    const queue = visibleStories();
    const next = queue[queue.indexOf(story) + 1] || null;

    readerBody.replaceChildren(
      story.cover ? el("img", { class: "cover", src: story.cover, alt: "" }) : null,
      el("div", { class: "card-meta", text: meta(story) }),
      el("h1", { text: story.title || "Untitled" }),
      byline(story, "lg"),
      el("div", { class: "story" }, ...paragraphs(story.content).map((p) => el("p", { text: p }))),
      el("div", { class: "the-end", text: "The end" }),
      el(
        "div",
        { class: "after-story" },
        el("img", { src: "assets/mark.png", alt: "", width: 41, height: 48 }),
        el(
          "div",
          {},
          el("p", { text: "There’s a whole feed of stories like this one. Swipe through them in the Storyds app." }),
          el("a", { class: "btn", href: "#download", text: "Get the app" })
        )
      ),
      el(
        "div",
        { class: "reader-actions" },
        el("a", {
          class: "report",
          href: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Report story " + story.id)}&body=${encodeURIComponent(
            `Story: ${story.title || "Untitled"} by ${story.author}\nID: ${story.id}\n\nWhat's wrong with this story?\n`
          )}`,
          text: "Report this story",
        }),
        next
          ? el("a", {
              class: "btn ghost",
              href: `#story=${next.id}`,
              text: "Next story ↓",
              onclick: (e) => {
                e.preventDefault();
                history.replaceState({ story: next.id, fromList: history.state?.fromList }, "", `#story=${next.id}`);
                openStory(next.id, false);
              },
            })
          : null
      )
    );

    list.hidden = true;
    reader.hidden = false;
    reader.classList.remove("fade-in");
    void reader.offsetWidth;
    reader.classList.add("fade-in");
    document.title = `${story.title || "Untitled"} · Storyds`;
    scrollPanelTop();
  }

  function showList() {
    reader.hidden = true;
    list.hidden = false;
    document.title = "Storyds — Short stories you can finish in one sitting";
    renderList();
  }

  function scrollPanelTop() {
    if (isNarrow()) {
      const top = library.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo({ top, behavior: "auto" });
    } else {
      library.scrollTo({ top: 0 });
    }
  }

  function route() {
    const m = location.hash.match(/^#story=([0-9a-f-]{36})$/i);
    if (m) openStory(m[1], false);
    else showList();
  }

  library.querySelector(".back").addEventListener("click", () => {
    if (history.state?.fromList) history.back();
    else {
      history.replaceState(null, "", location.pathname + location.search);
      showList();
      scrollPanelTop();
    }
  });

  window.addEventListener("popstate", () => {
    if (/^#story=/.test(location.hash)) route();
    else if (!reader.hidden) {
      showList();
      scrollPanelTop();
    }
  });

  // Re-render when crossing the one-column breakpoint (mobile shows a shorter list)
  window.matchMedia("(max-width: 1023px)").addEventListener("change", () => {
    if (reader.hidden && stories.length) renderList();
  });

  load();
}
