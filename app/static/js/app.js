const menuButton = document.querySelector("[data-menu-button]");
const sidebarOverlay = document.querySelector("[data-sidebar-overlay]");
const mobileBreakpoint = window.matchMedia("(max-width: 900px)");

function setSidebar(open) {
  document.body.classList.toggle("sidebar-open", open);
  menuButton?.setAttribute("aria-expanded", String(open));
  if (sidebarOverlay) sidebarOverlay.hidden = !open;
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

