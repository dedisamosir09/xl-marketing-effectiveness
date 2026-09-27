"""Render the existing dashboard as self-contained Streamlit components."""

from base64 import b64encode
from functools import lru_cache
import json
from pathlib import Path
from typing import Optional, Tuple

from .data.campaign_performance import generate_campaign_dataset
from .data.geo import generate_geo_dataset
from .data.mmm import generate_mmm_dataset
from .data.mta import generate_mta_dataset
from .navigation import MENU_ITEMS
from .renderer import render_page


ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = ROOT / "app" / "static"

PAGE_ASSETS = {
    "campaign-performance": {
        "css": "campaign.css",
        "js": "campaign.js",
        "data": "campaign-performance.json",
        "generator": generate_campaign_dataset,
    },
    "mta": {
        "css": "mta.css",
        "js": "mta.js",
        "data": "mta.json",
        "generator": generate_mta_dataset,
    },
    "mmm": {
        "css": "mmm.css",
        "js": "mmm.js",
        "data": "mmm.json",
        "generator": generate_mmm_dataset,
    },
    "geo-intelligence": {
        "css": "geo.css",
        "js": "geo.js",
        "data": "geo.json",
        "generator": generate_geo_dataset,
    },
}


def _data_uri(payload: bytes, mime_type: str) -> str:
    encoded = b64encode(payload).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _inline_style(html: str, filename: str) -> str:
    marker = f'<link rel="stylesheet" href="/static/css/{filename}">'
    stylesheet = _read_text(STATIC_ROOT / "css" / filename)
    return html.replace(marker, f"<style>\n{stylesheet}\n</style>")


def _inline_script(html: str, filename: str, script: Optional[str] = None) -> str:
    marker = f'<script src="/static/js/{filename}" defer></script>'
    script = script if script is not None else _read_text(STATIC_ROOT / "js" / filename)
    safe_script = script.replace("</script", "<\\/script")
    return html.replace(marker, f"<script>\n{safe_script}\n</script>")


def _style_tag(filename: str) -> str:
    stylesheet = _read_text(STATIC_ROOT / "css" / filename)
    return f"<style>\n{stylesheet}\n</style>"


def _script_tag(script: str) -> str:
    safe_script = script.replace("</script", "<\\/script")
    return f"<script>\n{safe_script}\n</script>"


def _embed_images(html: str) -> str:
    mime_types = {".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
    for path in (STATIC_ROOT / "img").iterdir():
        mime_type = mime_types.get(path.suffix.lower())
        if not mime_type:
            continue
        uri = _data_uri(path.read_bytes(), mime_type)
        html = html.replace(f"/static/img/{path.name}", uri)
    return html


def _rewrite_navigation(html: str) -> str:
    for item in MENU_ITEMS:
        original = f'href="{item["path"]}"'
        replacement = f'href="?module={item["key"]}" target="_top"'
        html = html.replace(original, replacement)
    return html.replace(
        'href="/" aria-label="XL Smart home"',
        'href="?module=campaign-performance" target="_top" aria-label="XL Smart home"',
    )


def _rewrite_navigation_for_client_router(html: str) -> str:
    for item in MENU_ITEMS:
        original = f'href="{item["path"]}"'
        replacement = f'href="#{item["key"]}" data-dashboard-route="{item["key"]}"'
        html = html.replace(original, replacement)
    return html.replace(
        'href="/" aria-label="XL Smart home"',
        'href="#campaign-performance" data-dashboard-route="campaign-performance" aria-label="XL Smart home"',
    )


def _page_script_with_embedded_data(page_key: str) -> str:
    assets = PAGE_ASSETS[page_key]
    dataset = assets["generator"]()
    data_json = json.dumps(dataset, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    data_url = _data_uri(data_json, "application/json")
    page_script = _read_text(STATIC_ROOT / "js" / assets["js"])
    return page_script.replace(f'/static/data/{assets["data"]}', data_url)


def _extract_body_fragment(html: str) -> Tuple[str, str]:
    body_marker = '<body class="'
    body_start = html.index(body_marker)
    class_start = body_start + len(body_marker)
    class_end = html.index('"', class_start)
    content_start = html.index(">", class_end) + 1
    script_start = html.rindex('<script src="/static/js/app.js" defer></script>')
    return html[class_start:class_end], html[content_start:script_start].strip()


@lru_cache(maxsize=len(PAGE_ASSETS))
def build_embedded_page(page_key: str) -> str:
    """Build one standalone HTML document for ``st.iframe``."""
    if page_key not in PAGE_ASSETS:
        raise ValueError(f"Unsupported dashboard module: {page_key}")

    assets = PAGE_ASSETS[page_key]
    html = render_page(page_key)
    html = _inline_style(html, "app.css")
    html = _inline_style(html, assets["css"])

    dataset = assets["generator"]()
    data_json = json.dumps(dataset, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    data_url = _data_uri(data_json, "application/json")
    page_script = _read_text(STATIC_ROOT / "js" / assets["js"])
    page_script = page_script.replace(f'/static/data/{assets["data"]}', data_url)

    html = _inline_script(html, "app.js")
    html = _inline_script(html, assets["js"], page_script)
    html = _embed_images(html)
    html = _rewrite_navigation(html)
    return html


@lru_cache(maxsize=len(PAGE_ASSETS))
def build_streamlit_dashboard(initial_page_key: str = "campaign-performance") -> str:
    """Build a multi-module dashboard that navigates inside Streamlit's iframe sandbox."""
    if initial_page_key not in PAGE_ASSETS:
        raise ValueError(f"Unsupported dashboard module: {initial_page_key}")

    page_fragments = []
    body_class = ""
    for item in MENU_ITEMS:
        page_key = item["key"]
        page_html = _rewrite_navigation_for_client_router(render_page(page_key))
        fragment_class, fragment_html = _extract_body_fragment(page_html)
        if page_key == initial_page_key:
            body_class = fragment_class
        hidden = "" if page_key == initial_page_key else " hidden"
        page_fragments.append(
            f'<div data-dashboard-page="{page_key}" data-body-class="{fragment_class}"{hidden}>\n'
            f"{fragment_html}\n"
            "</div>"
        )

    styles = "\n".join(
        [
            _style_tag("app.css"),
            *(_style_tag(PAGE_ASSETS[item["key"]]["css"]) for item in MENU_ITEMS),
            "<style>\n[data-dashboard-page][hidden] { display: none !important; }\n</style>",
        ]
    )
    scripts = "\n".join(
        [
            _script_tag(_read_text(STATIC_ROOT / "js" / "app.js")),
            *(_script_tag(_page_script_with_embedded_data(item["key"])) for item in MENU_ITEMS),
        ]
    )

    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="XL Marketing Effectiveness dashboard for campaign performance, MTA, MMM, and geo intelligence.">
    <meta name="theme-color" content="#172a91">
    <title>XL Marketing Effectiveness</title>
    <link rel="icon" type="image/svg+xml" href="/static/img/favicon.svg">
{styles}
  </head>
  <body class="{body_class}">
{''.join(page_fragments)}
{scripts}
  </body>
</html>"""
    return _embed_images(html)
