"""Streamlit Community Cloud entrypoint for XL Marketing Effectiveness."""

import streamlit as st

from app.streamlit_adapter import PAGE_ASSETS, build_embedded_page


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
      #MainMenu, footer, [data-testid="stToolbar"], [data-testid="stDecoration"] { display: none !important; }
      header[data-testid="stHeader"] { height: 0 !important; background: transparent !important; }
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

st.iframe(build_embedded_page(selected_module()), height=1000)
