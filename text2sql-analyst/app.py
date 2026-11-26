"""Streamlit chat UI: ask in plain English, follow up naturally, see SQL, results, and charts."""
import os
import tempfile

import altair as alt
import pandas as pd
import streamlit as st

import seed_db
from text2sql import DB_PATH, SAMPLE_HINTS, ask, connect, get_schema

EXAMPLES = [
    "Total revenue by month in 2026",
    "Top 5 cities by number of orders",
    "Which product category earns the most revenue?",
    "How many orders were cancelled or returned, by month?",
    "Who are our 10 highest-spending customers?",
]
SAMPLE_LABEL = "sample shop database"
MAX_QUESTIONS = int(os.getenv("MAX_QUESTIONS_PER_SESSION", "30"))

st.set_page_config(page_title="Ask your data", page_icon="📊")


@st.cache_resource
def get_sample_con():
    if not DB_PATH.exists():  # fresh deployments have no database yet
        seed_db.main()
    return connect()


def load_source(uploaded):
    """Return (connection, label, hints) for the sample DB or an uploaded SQLite file."""
    if uploaded is None:
        return get_sample_con(), SAMPLE_LABEL, SAMPLE_HINTS
    key = f"{uploaded.name}:{uploaded.size}"
    if st.session_state.get("upload_key") != key:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
            tmp.write(uploaded.getvalue())
        new_con = connect(tmp.name)
        if not get_schema(new_con):  # raises if it isn't a SQLite file
            raise ValueError("The database has no tables.")
        st.session_state.upload_key, st.session_state.upload_con = key, new_con
    return st.session_state.upload_con, uploaded.name, ""


def render_chart(df: pd.DataFrame, chart: dict):
    """Draw the chart Claude suggested: bar (stacked when split by series), line, or pie."""
    kind, x, y, series = chart.get("type"), chart.get("x"), chart.get("y"), chart.get("series")
    ys = y if isinstance(y, list) else [y]
    cols = [x, *ys] + ([series] if series else [])
    if kind not in ("bar", "line", "pie") or not all(isinstance(c, str) and c in df for c in cols):
        return

    # Reshape to long format with fixed column names: x, value, and optionally series
    if series and len(ys) == 1:
        long = df[[x, series, ys[0]]].set_axis(["x", "series", "value"], axis=1)
    elif len(ys) > 1:
        long = df[[x, *ys]].melt(id_vars=x, var_name="series", value_name="value").rename(columns={x: "x"})
    else:
        long = df[[x, ys[0]]].set_axis(["x", "value"], axis=1)
    long["value"] = pd.to_numeric(long["value"], errors="coerce")
    if long["value"].isna().all():
        return

    has_series = "series" in long
    if kind == "pie" and (has_series or len(long) > 8):
        kind = "bar"  # pies only work for a few slices of a single measure

    tooltip = [alt.Tooltip("x:N", title=x), alt.Tooltip("value:Q", title="value")]
    if has_series:
        tooltip.append(alt.Tooltip("series:N"))
    base = alt.Chart(long)
    if kind == "pie":
        c = base.mark_arc().encode(theta="value:Q", color=alt.Color("x:N", title=x), tooltip=tooltip)
    else:
        mark = base.mark_bar() if kind == "bar" else base.mark_line(point=True)
        c = mark.encode(
            x=alt.X("x:O", sort=None, title=x),  # sort=None keeps the query's row order
            y=alt.Y("value:Q", title=ys[0] if len(ys) == 1 else None),
            color=alt.Color("series:N", title=None) if has_series else alt.value("#4C78A8"),
            tooltip=tooltip,
        )
    st.altair_chart(c, use_container_width=True)


def render_answer(turn: dict):
    if turn.get("error"):
        st.error(turn["error"])
        return
    plan, df = turn["plan"], turn["df"]
    if df is None:
        st.info(plan.get("explanation", "That question can't be answered from this database."))
        return
    st.caption(plan.get("explanation", ""))
    st.code(plan["sql"], language="sql")
    st.dataframe(df, use_container_width=True)
    render_chart(df, plan.get("chart") or {})


st.session_state.setdefault("turns", [])

with st.sidebar:
    st.header("Data source")
    uploaded = st.file_uploader("Use your own SQLite file", type=["db", "sqlite", "sqlite3"])
    try:
        con, source, hints = load_source(uploaded)
    except Exception:
        st.error("Couldn't read that file as a SQLite database. Using the sample data instead.")
        con, source, hints = get_sample_con(), SAMPLE_LABEL, SAMPLE_HINTS
    st.caption("Claude sees your table definitions and questions, not your data rows.")

    if source == SAMPLE_LABEL:
        st.header("Try these")
        for ex in EXAMPLES:
            if st.button(ex, use_container_width=True):
                st.session_state.pending = ex
    st.divider()
    if st.button("Clear conversation", use_container_width=True):
        st.session_state.turns = []
        st.rerun()
    with st.expander("Database schema"):
        st.code(get_schema(con), language="sql")

# A new data source starts a fresh conversation
if st.session_state.get("source") != source:
    st.session_state.source = source
    st.session_state.turns = []

st.title("📊 Ask your data")
st.caption(f"Querying: {source}")

# Replay the conversation so far
for turn in st.session_state.turns:
    with st.chat_message("user"):
        st.write(turn["question"])
    with st.chat_message("assistant"):
        render_answer(turn)

question = st.chat_input("Ask a question, or follow up on the last one") or st.session_state.pop("pending", None)

if question and st.session_state.get("asked", 0) >= MAX_QUESTIONS:
    st.warning("This session has reached its question limit. Refresh the page to start a new one.")
elif question:
    st.session_state.asked = st.session_state.get("asked", 0) + 1
    with st.chat_message("user"):
        st.write(question)
    with st.chat_message("assistant"):
        history = [
            {"question": t["question"], "sql": t["plan"]["sql"]}
            for t in st.session_state.turns
            if not t.get("error") and t["plan"].get("sql")
        ]
        turn = {"question": question}
        with st.spinner("Writing and running the query..."):
            try:
                turn.update(ask(question, con, history, hints))
            except Exception as e:
                turn["error"] = str(e)
        render_answer(turn)
    st.session_state.turns.append(turn)
