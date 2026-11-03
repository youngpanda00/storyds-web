// Storyds website: header border on scroll, the auto-swiping phone feed,
// reveal-on-scroll, and a reading progress bar over the sample story.

(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Header gets a hairline once the page scrolls
  const header = document.querySelector(".site-header");
  const onScroll = () => header && header.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Phone feed: page through the stories like a swipe up, then loop back to the first
  const feed = document.querySelector(".feed");
  const track = document.querySelector(".feed-track");
  if (feed && track) {
    const pages = track.querySelectorAll(".page");
    let index = 0;

    const size = () => {
      const h = feed.clientHeight;
      track.style.setProperty("--page-h", h + "px");
      pages.forEach((p) => (p.style.height = h + "px"));
      track.style.transform = `translateY(${-index * h}px)`;
    };
    size();
    window.addEventListener("resize", size);

    if (!reduceMotion) {
      setInterval(() => {
        if (document.hidden) return;
        index = (index + 1) % pages.length;
        track.style.transform = `translateY(${-index * feed.clientHeight}px)`;
      }, 3800);
    }
  }

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

  // Reading progress across the sample story
  const story = document.querySelector(".story-sample article");
  const bar = document.querySelector(".progress");
  if (story && bar) {
    const update = () => {
      const r = story.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.5;
      const done = Math.min(1, Math.max(0, (window.innerHeight * 0.5 - r.top) / total));
      bar.style.width = done * 100 + "%";
      bar.classList.toggle("on", done > 0 && done < 1);
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
  }
})();
