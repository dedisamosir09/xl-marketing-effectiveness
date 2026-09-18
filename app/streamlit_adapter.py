"""Render the existing dashboard as a self-contained Streamlit component."""

from base64 import b64encode
from functools import lru_cache
import json
from pathlib import Path

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


def _inline_script(html: str, filename: str, script: str | None = None) -> str:
    marker = f'<script src="/static/js/{filename}" defer></script>'
    script = script if script is not None else _read_text(STATIC_ROOT / "js" / filename)
    safe_script = script.replace("</script", "<\\/script")
    return html.replace(marker, f"<script>\n{safe_script}\n</script>")


def _embed_images(html: str) -> str:
    for path in (STATIC_ROOT / "img").glob("*.svg"):
        uri = _data_uri(path.read_bytes(), "image/svg+xml")
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
