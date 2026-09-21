const menuButton = document.querySelector("[data-menu-button]");
const sidebarOverlay = document.querySelector("[data-sidebar-overlay]");
const mobileBreakpoint = window.matchMedia("(max-width: 900px)");
const modulePanels = Array.from(document.querySelectorAll("[data-module-panel]"));
const moduleLinks = Array.from(document.querySelectorAll("[data-module-link]"));
const bodyClasses = modulePanels.map((panel) => panel.dataset.bodyClass).filter(Boolean);
const currentShortLabel = document.querySelector("[data-current-short-label]");
const currentPageLabel = document.querySelector("[data-current-page-label]");
const currentPageDescription = document.querySelector("[data-current-page-description]");
const pageActionSlot = document.querySelector("[data-page-action-slot]");

function setSidebar(open) {
  document.body.classList.toggle("sidebar-open", open);
  menuButton?.setAttribute("aria-expanded", String(open));
  if (sidebarOverlay) sidebarOverlay.hidden = !open;
}

function getModuleFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("module") || window.location.hash.replace(/^#module-?/, "");
}

function updateIframeUrl(moduleKey, replace = false) {
  if (!moduleKey) return;
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("module", moduleKey);
  nextUrl.hash = "";
  const method = replace ? "replaceState" : "pushState";
  window.history?.[method]?.({ moduleKey }, "", nextUrl);
}

function activateModule(moduleKey, options = {}) {
  if (modulePanels.length <= 1) return false;

  const nextPanel = modulePanels.find((panel) => panel.dataset.modulePanel === moduleKey);
  if (!nextPanel) return false;

  modulePanels.forEach((panel) => {
    const active = panel === nextPanel;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });

  moduleLinks.forEach((link) => {
    const active = link.dataset.moduleLink === moduleKey;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (bodyClasses.length) document.body.classList.remove(...bodyClasses);
  if (nextPanel.dataset.bodyClass) document.body.classList.add(nextPanel.dataset.bodyClass);

  if (currentShortLabel) currentShortLabel.textContent = nextPanel.dataset.shortLabel || "";
  if (currentPageLabel) currentPageLabel.textContent = nextPanel.dataset.pageLabel || "";
  if (currentPageDescription) currentPageDescription.textContent = nextPanel.dataset.pageDescription || "";
  if (pageActionSlot) {
    const actionTemplate = document.querySelector(`[data-page-action-template="${moduleKey}"]`);
    pageActionSlot.innerHTML = actionTemplate?.innerHTML || "";
  }

  setSidebar(false);
  if (!options.skipHistory) updateIframeUrl(moduleKey, options.replaceHistory);
  if (!options.preserveScroll) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  return true;
}

menuButton?.addEventListener("click", () => {
  setSidebar(!document.body.classList.contains("sidebar-open"));
});

sidebarOverlay?.addEventListener("click", () => setSidebar(false));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setSidebar(false);
});

mobileBreakpoint.addEventListener("change", (event) => {
  if (!event.matches) setSidebar(false);
});

if (modulePanels.length > 1) {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-module-link]");
    if (!link) return;

    event.preventDefault();
    activateModule(link.dataset.moduleLink);
  });

  window.addEventListener("popstate", () => {
    activateModule(getModuleFromUrl() || modulePanels[0]?.dataset.modulePanel, {
      skipHistory: true,
      preserveScroll: true,
    });
  });

  activateModule(getModuleFromUrl() || document.querySelector("[data-module-panel].active")?.dataset.modulePanel, {
    replaceHistory: true,
    preserveScroll: true,
  });
}
