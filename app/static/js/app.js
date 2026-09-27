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

  document.body.className = page.dataset.bodyClass || "";
  setSidebar(false);

  if (options.scroll !== false) {
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  window.dispatchEvent(new Event("resize"));
  return true;
}

document.addEventListener("click", (event) => {
  const menuButton = event.target.closest("[data-menu-button]");
  if (menuButton) {
    setSidebar(!document.body.classList.contains("sidebar-open"));
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
