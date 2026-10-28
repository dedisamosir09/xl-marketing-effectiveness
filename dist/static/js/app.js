const mobileBreakpoint = window.matchMedia("(max-width: 900px)");

function setSidebar(open) {
  document.body.classList.toggle("sidebar-open", open);
  document.querySelectorAll("[data-menu-button]").forEach((button) => {
    button.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll("[data-sidebar-overlay]").forEach((overlay) => {
    overlay.hidden = !open;
  });
}

function activateDashboardPage(routeKey, options = {}) {
  const page = document.querySelector(`[data-dashboard-page="${routeKey}"]`);
  if (!page) return false;

  document.querySelectorAll("[data-dashboard-page]").forEach((item) => {
    item.hidden = item !== page;
  });
  document.querySelectorAll("[data-dashboard-route]").forEach((link) => {
    const active = link.dataset.dashboardRoute === routeKey;
    link.classList.toggle("active", active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  const collapsed = document.body.classList.contains("sidebar-collapsed");
  document.body.className = page.dataset.bodyClass || "";
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  setSidebar(false);

  if (options.scroll !== false) {
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  window.dispatchEvent(new Event("resize"));
  return true;
}

// Desktop: the menu button hides or shows the sidebar; the choice is remembered in this browser.
const SIDEBAR_KEY = "xl-sidebar-collapsed";

function setCollapsed(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  document.querySelectorAll("[data-menu-button]").forEach((button) => {
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", collapsed ? "Show navigation" : "Hide navigation");
  });
  try { window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0"); } catch (_error) { /* optional */ }
  // Charts size themselves to the page width: redraw once the slide has finished.
  window.setTimeout(() => window.dispatchEvent(new Event("resize")), 220);
}

function restoreCollapsed() {
  let collapsed = false;
  try { collapsed = window.localStorage.getItem(SIDEBAR_KEY) === "1"; } catch (_error) { /* optional */ }
  if (mobileBreakpoint.matches) {
    document.querySelectorAll("[data-menu-button]").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Open navigation");
    });
  } else if (collapsed) {
    setCollapsed(true);
  }
}

document.addEventListener("click", (event) => {
  const menuButton = event.target.closest("[data-menu-button]");
  if (menuButton) {
    if (mobileBreakpoint.matches) setSidebar(!document.body.classList.contains("sidebar-open"));
    else setCollapsed(!document.body.classList.contains("sidebar-collapsed"));
    return;
  }

  if (event.target.closest("[data-sidebar-overlay]")) {
    setSidebar(false);
    return;
  }

  const routeLink = event.target.closest("[data-dashboard-route]");
  if (!routeLink) return;
  event.preventDefault();
  activateDashboardPage(routeLink.dataset.dashboardRoute);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setSidebar(false);
});

mobileBreakpoint.addEventListener("change", (event) => {
  if (!event.matches) setSidebar(false);
});

restoreCollapsed();
