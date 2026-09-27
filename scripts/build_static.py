from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.renderer import render_page
from app.data.campaign_performance import write_campaign_dataset
from app.data.mta import write_mta_dataset
from app.data.mmm import write_mmm_dataset
from app.data.geo import write_geo_dataset


DIST = ROOT / "dist"
ROUTES = {
    "campaign-performance": [DIST / "index.html", DIST / "campaign-performance" / "index.html"],
    "mta": [DIST / "mta" / "index.html"],
    "mmm": [DIST / "mmm" / "index.html"],
    "geo-intelligence": [DIST / "geo-intelligence" / "index.html"],
}


def build():
    if DIST.exists():
        shutil.rmtree(DIST)

    for page_key, output_paths in ROUTES.items():
        page = render_page(page_key).encode("utf-8")
        for output_path in output_paths:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(page)

    shutil.copytree(ROOT / "app" / "static", DIST / "static")
    write_campaign_dataset(DIST / "static" / "data" / "campaign-performance.json")
    write_mta_dataset(DIST / "static" / "data" / "mta.json")
    write_mmm_dataset(DIST / "static" / "data" / "mmm.json")
    write_geo_dataset(DIST / "static" / "data" / "geo.json")
    print(f"Built {sum(map(len, ROUTES.values()))} dashboard routes in {DIST}")


if __name__ == "__main__":
    build()
