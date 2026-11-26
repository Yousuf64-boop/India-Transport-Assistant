"""Core text-to-SQL logic: schema -> Claude -> validated, read-only query -> DataFrame."""
import json
import os
import re
import sqlite3
from pathlib import Path

import anthropic
import pandas as pd

DB_PATH = Path(os.getenv("DB_PATH", Path(__file__).parent / "shop.db"))
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5")
MAX_ROWS = 500
MAX_RETRIES = 2
MAX_HISTORY = 5  # earlier turns sent to Claude as context for follow-ups

FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|truncate)\b", re.I
)

SYSTEM = """You are a careful data analyst writing SQLite queries.
Given a database schema and a question, reply with ONLY a JSON object (no markdown):
{"sql": "<one read-only SELECT query>", "explanation": "<one sentence on what it does>",
 "chart": {"type": "bar" | "line" | "pie" | "none", "x": "<column>",
           "y": "<numeric column, or a list of them>", "series": "<optional column>"}}

Rules:
- Use only tables and columns that exist in the schema. Never guess names.
- One SELECT statement (CTEs allowed). No writes, no PRAGMA.
- Dates are ISO text (YYYY-MM-DD); use strftime() to group by month or year.
- Give result columns clear aliases. Every chart field must be a column alias in the result.
- Chart types: "line" for trends over time, "bar" for comparing categories, "pie" only for
  shares of a total with at most 6 slices, otherwise "none".
- For a breakdown over two dimensions (e.g. revenue by month and category), return one row per
  pair and set "series" to the second dimension. Omit "series" otherwise. When several numeric
  columns share the same x, set "y" to a list of them instead.
- If the question cannot be answered from the schema, return
  {"sql": "", "explanation": "<why>", "chart": {"type": "none"}}."""

# Extra context that only applies to the bundled sample database
SAMPLE_HINTS = (
    "Revenue = SUM(order_items.quantity * products.price), "
    "excluding cancelled orders unless the question says otherwise."
)

_client = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY
    return _client


def connect(path=None) -> sqlite3.Connection:
    """Open a SQLite file read-only, so even a bad query cannot change data."""
    uri = f"{Path(path or DB_PATH).resolve().as_uri()}?mode=ro"
    return sqlite3.connect(uri, uri=True, check_same_thread=False)


def get_schema(con: sqlite3.Connection) -> str:
    rows = con.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return "\n".join(r[0] for r in rows)


def validate(sql: str) -> str:
    sql = sql.strip().rstrip(";").strip()
    if not re.match(r"(?is)^(select|with)\b", sql):
        raise ValueError("Only SELECT queries are allowed.")
    if ";" in sql:
        raise ValueError("Only one statement is allowed.")
    if FORBIDDEN.search(sql):
        raise ValueError("Query contains a disallowed keyword.")
    return sql


def run_query(con: sqlite3.Connection, sql: str) -> pd.DataFrame:
    sql = validate(sql)
    return pd.read_sql_query(f"SELECT * FROM ({sql}) LIMIT {MAX_ROWS}", con)


def parse_plan(text: str) -> dict:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    return json.loads(text)


def build_prompt(question: str, schema: str, history: list[dict] | None, hints: str = "") -> str:
    parts = [f"Schema:\n{schema}"]
    if hints:
        parts.append(f"Notes about this database:\n{hints}")
    if history:
        turns = "\n\n".join(f"Q: {h['question']}\nSQL: {h['sql']}" for h in history[-MAX_HISTORY:])
        parts.append(f"Earlier in this conversation:\n{turns}")
        parts.append(
            'The new question may refer to the earlier ones (e.g. "now by city", "only 2026"). '
            "Reuse or modify the earlier SQL when that is what it asks for."
        )
    parts.append(f"Question: {question}")
    return "\n\n".join(parts)


def ask(question: str, con: sqlite3.Connection, history: list[dict] | None = None, hints: str = "") -> dict:
    """Return {"plan": {...}, "df": DataFrame | None}. Retries with the error on failure.

    history: earlier turns as [{"question": ..., "sql": ...}], oldest first.
    hints: optional notes about the database (business rules, naming quirks).
    """
    messages = [{"role": "user", "content": build_prompt(question, get_schema(con), history, hints)}]
    last_error = None
    for _ in range(MAX_RETRIES + 1):
        resp = client().messages.create(model=MODEL, max_tokens=1000, system=SYSTEM, messages=messages)
        text = resp.content[0].text
        try:
            plan = parse_plan(text)
            if not plan.get("sql"):
                return {"plan": plan, "df": None}
            return {"plan": plan, "df": run_query(con, plan["sql"])}
        except Exception as e:  # bad JSON, invalid SQL, blocked query...
            last_error = e
            messages += [
                {"role": "assistant", "content": text},
                {"role": "user", "content": f"That failed with: {e}. Fix it and reply with JSON only."},
            ]
    raise RuntimeError(f"Could not produce a working query: {last_error}")
