"""Streamlit Community Cloud entrypoint for XL Marketing Effectiveness."""

from pathlib import Path
import sys

import streamlit as st

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.streamlit_adapter import PAGE_ASSETS, build_streamlit_dashboard


DEFAULT_MODULE = "campaign-performance"


def selected_module() -> str:
    value = st.query_params.get("module", DEFAULT_MODULE)
    if isinstance(value, list):
        value = value[-1]
    return value if value in PAGE_ASSETS else DEFAULT_MODULE


st.set_page_config(
    page_title="XL Marketing Effectiveness",
    page_icon="app/static/img/favicon.svg",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
      #MainMenu, footer, [data-testid="stToolbar"], [data-testid="stDecoration"] {
        display: none !important;
        pointer-events: none !important;
      }
      header[data-testid="stHeader"] {
        height: 0 !important;
        min-height: 0 !important;
        background: transparent !important;
        pointer-events: none !important;
      }
      header[data-testid="stHeader"] * { pointer-events: none !important; }
      [data-testid="stAppViewBlockContainer"], .block-container {
        max-width: 100% !important;
        padding: 0 !important;
      }
      [data-testid="stElementContainer"] { width: 100% !important; }
      iframe[title="st.iframe"] { border: 0 !important; display: block; }
    </style>
    """,
    unsafe_allow_html=True,
)

st.iframe(build_streamlit_dashboard(selected_module()), height=1000)
