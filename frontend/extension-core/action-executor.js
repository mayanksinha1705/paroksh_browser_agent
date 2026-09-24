(function () {
  // Google Forms (and most modern form UIs) build radio/checkbox/dropdown
  // questions out of styled <div role="radio">/"checkbox"/"option"/"listbox">
  // rather than native <input>. The original selector only matched
  // button/link/input/select/contenteditable, so every custom-control
  // question on a Google Form was completely invisible to the manifest —
  // the agent wasn't skipping those fields, it never saw them to begin with.
  const INTERACTIVE_SELECTOR = 'button, [role="button"], a, input, textarea, select, [contenteditable="true"], [onclick], [role="radio"], [role="checkbox"], [role="option"], [role="listbox"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="switch"], [role="combobox"], [aria-checked]';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const TYPE_SPEED_MIN = 10, TYPE_SPEED_MAX = 30, SETTLE_TIME = 150;

  function normalize(t) { return String(t || "").trim().toLowerCase(); }
  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (window.getComputedStyle(el).display === 'none' || window.getComputedStyle(el).visibility === 'hidden') return false;
    // Only count elements actually within the current scroll viewport.
    // Previously this let off-screen elements (already scrolled past, or
    // further down a long form) into the manifest with coordinates that
    // didn't match the screenshot at all — the model would try to act on
    // (or scroll toward) a field it thought was still visible, and the
    // fixed 50-element cap got eaten up by off-screen elements, crowding
    // out fields that WERE currently on screen.
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
    if (rect.right <= 0 || rect.left >= window.innerWidth) return false;
    return true;
  }

  function deepQuerySelectorAll(selector, root = document) {
    const results = Array.from(root.querySelectorAll(selector));
    root.querySelectorAll("*").forEach(el => { if (el.shadowRoot) results.push(...deepQuerySelectorAll(selector, el.shadowRoot)); });
    return results;
  }

  function labelFor(el) {
    return [el.getAttribute("aria-label"), el.placeholder, el.innerText, el.title, el.id].find(c => c && String(c).trim()) || "(unlabeled)";
  }

  let markedElements = [];

  function getElementRects() {
    const candidates = deepQuerySelectorAll(INTERACTIVE_SELECTOR).filter(isVisible);
    const kept = [];
    for (const el of candidates) { if (!kept.some(other => other.contains(el))) kept.push(el); }
    markedElements = [];
    const manifest = kept.slice(0, 50).map((el, idx) => {
      const id = idx + 1;
      const rect = el.getBoundingClientRect();
      markedElements.push({ id, el });
      return { id, tag: el.tagName.toLowerCase(), label: labelFor(el), x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    });
    return { elements: manifest, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
  }

  function resolveElement(action, selector) {
    let el = markedElements.find(m => m.id === action.element_id)?.el;
    if (el) return el;
    const candidates = deepQuerySelectorAll(selector).filter(isVisible);
    el = candidates.find(c => normalize(labelFor(c)).includes(normalize(action.target)) || normalize(action.target).includes(normalize(labelFor(c))));
    if (el) return el;
    if (action.x != null && action.y != null) el = document.elementFromPoint(action.x, action.y);
    return el || null;
  }

  // Used by background.js right before it dispatches a trusted CDP click.
  // The rectangle background.js computed at the START of the step (before
  // the screenshot/OCR/redaction/LLM round-trip) can be stale by the time
  // the click actually fires — a promo banner loading in, the Gmail chat
  // rail collapsing, anything reflowing — and a coordinate-only CDP click
  // has no way to notice it's now clicking empty space, unlike the old
  // DOM-reference click (which scrolled to and clicked the live element).
  // This re-reads the SAME cached element reference from the last
  // getElementRects() call (so element_id numbering can't drift) and
  // returns its current on-screen center after scrolling it into view.
  async function resolveElementPoint(elementId) {
    const entry = markedElements.find(m => m.id === elementId);
    const el = entry?.el;
    if (!el || !el.isConnected) return null;
    el.scrollIntoView({ block: "center", behavior: "auto" });
    await sleep(SETTLE_TIME);
    if (!isVisible(el)) return null;
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    return { x, y, hit: isTopmostAt(el, x, y) };
  }

  // Hit-test: would a REAL mouse click at (x, y) actually reach `el` (or
  // something inside/around it)? A DOM el.click() ignores overlays and
  // clipping; a trusted CDP click does not. Walks into open shadow roots so
  // web-component UIs are handled. Returns true when uncertain (null hit) so
  // we never block a click we can't disprove.
  function isTopmostAt(el, x, y) {
    let hit = document.elementFromPoint(x, y);
    if (!hit) return true;
    while (hit.shadowRoot) {
      const inner = hit.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === hit) break;
      hit = inner;
    }
    return hit === el || el.contains(hit) || hit.contains(el);
  }

  async function showClickAnimation(el) {
    const rect = el.getBoundingClientRect();
    const dot = document.createElement('div');
    dot.style.cssText = `position:fixed; top:${rect.top + rect.height/2}px; left:${rect.left + rect.width/2}px; width:20px; height:20px; background:rgba(66,133,244,0.6); border-radius:50%; pointer-events:none; z-index:2147483647; transform:translate(-50%,-50%); transition:all 0.3s ease-out;`;
    document.body.appendChild(dot);
    await sleep(10);
    dot.style.width = '40px'; dot.style.height = '40px'; dot.style.opacity = '0';
    setTimeout(() => dot.remove(), 300);
  }

  // ---------------------------------------------------------------------
  // Completion verification
  //
  // Previously the model's own {"action":"DONE"} was trusted blindly by
  // background.js — there was no code-side check that a form had actually
  // been submitted. A model that gets over-confident mid-form (a very
  // common failure mode on long multi-question pages) would just end the
  // run there, and the extension reported success on an incomplete form.
  // This gives background.js real signal to check against before it
  // accepts DONE, instead of relying purely on the model self-grading.
  // ---------------------------------------------------------------------
  const FORM_CONFIRMATION_PHRASES = [
    "response has been recorded",
    "response was recorded",
    "recorded your response",
    "response has been submitted",
    "your response has been received",
    "submit another response",
    "thanks for filling out this form",
    "thank you for completing",
    "thank you for your submission",
    "form submitted",
  ];

  function isGoogleFormsPage() {
    return location.hostname.includes("docs.google.com") && location.pathname.includes("/forms/");
  }

  function isConfirmationVisible() {
    const text = normalize(document.body.innerText).slice(0, 6000);
    return FORM_CONFIRMATION_PHRASES.some(p => text.includes(p));
  }

  function hasUnfilledNativeRequiredFields() {
    // Native <form required> fields (checkout pages, college portals, plain
    // HTML surveys) expose real browser validity we can check directly,
    // without needing per-site heuristics.
    return Array.from(document.forms).some(f => typeof f.checkValidity === "function" && !f.checkValidity());
  }

  function verifyCompletion() {
    const googleForm = isGoogleFormsPage();
    return {
      isGoogleForm: googleForm,
      confirmed: googleForm ? isConfirmationVisible() : true,
      hasUnfilledRequired: hasUnfilledNativeRequiredFields(),
    };
  }

  async function doClick(action) {
    const el = resolveElement(action, 'button, [role="button"], a, input[type="submit"], [onclick], [role="radio"], [role="checkbox"], [role="option"], [role="listbox"], [aria-checked]');
    if (!el) throw new Error("Element not found");
    el.scrollIntoView({ block: "center", behavior: "auto" });
    await sleep(SETTLE_TIME);
    await showClickAnimation(el);
    el.click();
    return `Clicked ${action.target || "element"}`;
  }

  async function doType(action) {
    if (window.location.hostname.includes("docs.google.com")) throw new Error("TRUSTED_INPUT_REQUIRED");
    const el = resolveElement(action, 'input, textarea, [contenteditable="true"]');
    if (!el) throw new Error("Field not found");
    el.focus();
    const text = action.text || "";
    if (el.isContentEditable) {
      el.innerText = "";
      for (let i = 1; i <= text.length; i++) {
        el.innerText = text.slice(0, i);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(Math.random() * (TYPE_SPEED_MAX - TYPE_SPEED_MIN) + TYPE_SPEED_MIN);
      }
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return `Typed ${action.text}`;
  }

  async function doKey(action) {
    // A synthetic KeyboardEvent (isTrusted: false) does NOT trigger the
    // browser's own default action for a key — form submission on Enter,
    // a search box firing its search, native contentEditable newline
    // handling, etc. — and many sites explicitly ignore untrusted events
    // as an anti-automation measure. There is no way to make this trusted
    // from inside the page's own JS context, so every KEY action is routed
    // to background.js's CDP-based trusted input path instead of silently
    // pretending a plain dispatchEvent() worked.
    throw new Error("TRUSTED_INPUT_REQUIRED");
  }

  async function doHover(action) {
    // Fallback only — the default path for HOVER is background.js's
    // trusted CDP Input.dispatchMouseEvent("mouseMoved", ...), which
    // triggers real :hover state and mouseenter/mouseover. This synthetic
    // version only runs if trusted input couldn't be attached at all.
    const el = resolveElement(action, INTERACTIVE_SELECTOR);
    if (!el) throw new Error("Element not found");
    el.scrollIntoView({ block: "center", behavior: "auto" });
    await sleep(SETTLE_TIME);
    const rect = el.getBoundingClientRect();
    const opts = { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    el.dispatchEvent(new MouseEvent("mouseover", opts));
    el.dispatchEvent(new MouseEvent("mouseenter", opts));
    el.dispatchEvent(new MouseEvent("mousemove", opts));
    return `Hovered ${action.target || "element"}`;
  }

  async function execute(action) {
    switch (action.action) {
      case "CLICK": return await doClick(action);
      case "TYPE": return await doType(action);
      case "KEY": return await doKey(action);
      case "HOVER": return await doHover(action);
      case "SCROLL": window.scrollBy({ top: action.direction === "down" ? action.amount : -action.amount, behavior: "auto" }); return `Scrolled`;
      case "NAVIGATE": return `Navigating...`;
      default: throw new Error("Unsupported action");
    }
  }

  window.AIAgentExecutor = { execute, getElementRects, verifyCompletion, resolveElementPoint };
})();
