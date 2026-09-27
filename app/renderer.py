from html import escape
from pathlib import Path
from string import Template

from .navigation import MENU_ITEMS, get_menu_item


TEMPLATE_PATH = Path(__file__).parent / "templates" / "dashboard.html"
CAMPAIGN_TEMPLATE_PATH = Path(__file__).parent / "templates" / "campaign_performance.html"
MTA_TEMPLATE_PATH = Path(__file__).parent / "templates" / "mta.html"
MMM_TEMPLATE_PATH = Path(__file__).parent / "templates" / "mmm.html"
GEO_TEMPLATE_PATH = Path(__file__).parent / "templates" / "geo.html"

ICONS = {
    "chart": '<svg viewBox="0 0 24 24"><path d="M5 19v-4m5 4V9m5 10v-7m5 7V5M3 10l5-4 4 3 7-6"/></svg>',
    "journey": '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.3"/><circle cx="18" cy="18" r="2.3"/><path d="M8.3 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.7"/></svg>',
    "building": '<svg viewBox="0 0 24 24"><path d="M3 9h18M5 9V6l7-3 7 3v3M5 20v-8m5 8v-8m4 8v-8m5 8v-8M3 21h18"/></svg>',
    "radar": '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M11 4v3m0 8v3m-7-7h3m8 0h3m-4.2 2.8L20 20m-9-9 4-4"/></svg>',
}


def render_navigation(active_key):
    links = []
    for item in MENU_ITEMS:
        is_active = item["key"] == active_key
        active_class = " active" if is_active else ""
        current = ' aria-current="page"' if is_active else ""
        links.append(
            f'<li><a class="nav-link{active_class}" href="{escape(item["path"])}"{current}>'
            f'<span class="nav-icon" aria-hidden="true">{ICONS[item["icon"]]}</span>'
            f'<span>{escape(item["label"])}</span></a></li>'
        )
    return "".join(links)


def render_page(key):
    active_page = get_menu_item(key)
    page_index = MENU_ITEMS.index(active_page) + 1
    template = Template(TEMPLATE_PATH.read_text(encoding="utf-8"))

    if key == "campaign-performance":
        content_html = CAMPAIGN_TEMPLATE_PATH.read_text(encoding="utf-8")
        page_action_html = (
            '<div class="page-heading-meta">'
            '<span class="demo-badge"><span></span> Demo dataset</span>'
            '<span class="freshness">Data through 24 Aug 2026, 23:59 WIB</span>'
            '</div>'
        )
        body_class = "campaign-page"
        environment_label = "Interactive demo"
        page_styles_html = '<link rel="stylesheet" href="/static/css/campaign.css">'
        page_scripts_html = '<script src="/static/js/campaign.js" defer></script>'
    elif key == "mta":
        content_html = MTA_TEMPLATE_PATH.read_text(encoding="utf-8")
        page_action_html = (
            '<div class="page-heading-meta">'
            '<span class="demo-badge"><span></span> Demo journey data</span>'
            '<span class="freshness">Data through 24 Aug 2026, 23:59 WIB</span>'
            '</div>'
        )
        body_class = "mta-page"
        environment_label = "Interactive demo"
        page_styles_html = '<link rel="stylesheet" href="/static/css/mta.css">'
        page_scripts_html = '<script src="/static/js/mta.js" defer></script>'
    elif key == "mmm":
        content_html = MMM_TEMPLATE_PATH.read_text(encoding="utf-8")
        page_action_html = (
            '<div class="page-heading-meta">'
            '<span class="demo-badge"><span></span> Demo MMM model</span>'
            '<span class="freshness">Model data through 24 Aug 2026</span>'
            '</div>'
        )
        body_class = "mmm-page"
        environment_label = "Interactive demo"
        page_styles_html = '<link rel="stylesheet" href="/static/css/mmm.css">'
        page_scripts_html = '<script src="/static/js/mmm.js" defer></script>'
    elif key == "geo-intelligence":
        content_html = GEO_TEMPLATE_PATH.read_text(encoding="utf-8")
        page_action_html = (
            '<div class="page-heading-meta">'
            '<span class="demo-badge"><span></span> Demo geo opportunity data</span>'
            '<span class="freshness">Market and media data through 24 Aug 2026</span>'
            '</div>'
        )
        body_class = "geo-page"
        environment_label = "Interactive demo"
        page_styles_html = '<link rel="stylesheet" href="/static/css/geo.css">'
        page_scripts_html = '<script src="/static/js/geo.js" defer></script>'
    else:
        content_html = (
            '<div class="content-stage">'
            '<div class="stage-grid" aria-hidden="true"></div>'
            '<div class="stage-glow stage-glow-one" aria-hidden="true"></div>'
            '<div class="stage-glow stage-glow-two" aria-hidden="true"></div>'
            '<div class="empty-state">'
            '<div class="empty-icon" aria-hidden="true">'
            '<svg viewBox="0 0 32 32"><rect x="5" y="6" width="22" height="20" rx="4"/>'
            '<path d="M5 12h22M11 18h4m-4 4h10"/></svg>'
            '</div>'
            '<p class="empty-kicker">Module workspace</p>'
            '<h2>Ready for dashboard configuration</h2>'
            '<p>Metrics, filters, visualizations, and business recommendations will be added in the next stage.</p>'
            '</div>'
            f'<div class="stage-number" aria-hidden="true">{page_index:02d}</div>'
            '</div>'
        )
        page_action_html = '<span class="readiness-badge"><span></span> Structure ready</span>'
        body_class = "placeholder-page"
        environment_label = "Prototype"
        page_styles_html = ""
        page_scripts_html = ""

    return template.substitute(
        page_label=escape(active_page["label"]),
        short_label=escape(active_page["short_label"]),
        page_description=escape(active_page["description"]),
        menu_html=render_navigation(key),
        content_html=content_html,
        page_action_html=page_action_html,
        body_class=body_class,
        environment_label=environment_label,
        page_styles_html=page_styles_html,
        page_scripts_html=page_scripts_html,
    )
