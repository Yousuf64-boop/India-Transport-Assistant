"""Accuracy check for the text-to-SQL analyst.

Each case pairs a plain-English question with a hand-written reference query.
The script asks Claude for SQL, runs both queries on the sample database, and
compares the results. Names, column order, and extra columns are ignored.
Two cases are unanswerable on purpose: the analyst should decline them.

Usage:
    python evaluate.py              # summary
    python evaluate.py --verbose    # also print the generated SQL for every case
    CLAUDE_MODEL=claude-haiku-5-5 python evaluate.py   # try another model
"""
import argparse
import json
import sys
import time
from pathlib import Path

import pandas as pd

from text2sql import DB_PATH, MODEL, SAMPLE_HINTS, ask, connect

JOINS = """FROM order_items oi
JOIN products p ON p.product_id = oi.product_id
JOIN orders o ON o.order_id = oi.order_id"""
REVENUE = "SUM(oi.quantity * p.price)"
LIVE = "o.status != 'cancelled'"

# gold=None means the question cannot be answered from the schema.
CASES = [
    {"question": "How many customers are there?",
     "gold": "SELECT COUNT(*) FROM customers"},
    {"question": "How many orders were cancelled?",
     "gold": "SELECT COUNT(*) FROM orders WHERE status = 'cancelled'"},
    {"question": "What is the average product price in the Electronics category?",
     "gold": "SELECT AVG(price) FROM products WHERE category = 'Electronics'"},
    {"question": "How many products are in each category?",
     "gold": "SELECT category, COUNT(*) FROM products GROUP BY category"},
    {"question": "Number of orders by status",
     "gold": "SELECT status, COUNT(*) FROM orders GROUP BY status"},
    {"question": "What is the most expensive product?",
     "gold": "SELECT name, price FROM products ORDER BY price DESC LIMIT 1"},
    {"question": "How many distinct customers placed an order in 2026?",
     "gold": "SELECT COUNT(DISTINCT customer_id) FROM orders WHERE strftime('%Y', order_date) = '2026'"},
    {"question": "What is the total revenue in 2026?",
     "gold": f"SELECT {REVENUE} {JOINS} WHERE {LIVE} AND strftime('%Y', o.order_date) = '2026'"},
    {"question": "Top 3 product categories by revenue",
     "gold": f"SELECT p.category, {REVENUE} AS revenue {JOINS} WHERE {LIVE} "
             "GROUP BY p.category ORDER BY revenue DESC LIMIT 3",
     "ordered": True},
    {"question": "Which customer has spent the most in total?",
     "gold": f"SELECT c.name, {REVENUE} AS total {JOINS} "
             f"JOIN customers c ON c.customer_id = o.customer_id WHERE {LIVE} "
             "GROUP BY c.customer_id ORDER BY total DESC LIMIT 1",
     "ordered": True},
    {"question": "Total revenue by month in 2026",
     "gold": f"SELECT strftime('%Y-%m', o.order_date) AS month, {REVENUE} AS revenue {JOINS} "
             f"WHERE {LIVE} AND strftime('%Y', o.order_date) = '2026' GROUP BY month ORDER BY month",
     "ordered": True},
    {"question": "What is the average age of our customers?", "gold": None},
    {"question": "List each customer's email address", "gold": None},
]


def norm(value):
    return round(value, 2) if isinstance(value, float) else value


def columns(df: pd.DataFrame, ordered: bool) -> list:
    cols = []
    for c in df.columns:
        vals = [norm(v) for v in df[c].tolist()]
        cols.append(vals if ordered else sorted(vals, key=repr))
    return cols


def matches(got: pd.DataFrame, gold: pd.DataFrame, ordered: bool) -> bool:
    """True if every reference column appears in the result (any name, any position)."""
    if len(got) != len(gold):
        return False
    available = columns(got, ordered)
    for wanted in columns(gold, ordered):
        if wanted in available:
            available.remove(wanted)
        else:
            return False
    return True


def run_case(case: dict, con) -> dict:
    start = time.time()
    sql, note = "", ""
    try:
        result = ask(case["question"], con, hints=SAMPLE_HINTS)
        sql, got = result["plan"].get("sql", ""), result["df"]
        if case["gold"] is None:
            ok = got is None
            note = "" if ok else "should have declined but returned data"
        else:
            gold = pd.read_sql_query(case["gold"], con)
            ok = got is not None and matches(got, gold, case.get("ordered", False))
            note = "" if ok else "result differs from the reference"
    except Exception as e:
        # Failing safely counts as correct only for unanswerable questions
        ok = case["gold"] is None
        note = "failed safely" if ok else f"error: {e}"
    return {"question": case["question"], "passed": ok, "sql": sql, "note": note,
            "seconds": round(time.time() - start, 1)}


def main():
    parser = argparse.ArgumentParser(description="Evaluate text-to-SQL accuracy.")
    parser.add_argument("--verbose", action="store_true", help="print generated SQL for every case")
    args = parser.parse_args()

    if not Path(DB_PATH).exists():
        sys.exit(f"{DB_PATH} not found. Run `python seed_db.py` first.")

    con = connect()
    print(f"Model: {MODEL}\n")
    results = []
    for i, case in enumerate(CASES, 1):
        r = run_case(case, con)
        results.append(r)
        print(f"{i:>2}. {'PASS' if r['passed'] else 'FAIL'}  {r['question']}  ({r['seconds']}s)")
        if r["note"] and not r["passed"]:
            print(f"      reason: {r['note']}")
        if r["sql"] and (args.verbose or not r["passed"]):
            print("      sql: " + " ".join(r["sql"].split()))

    passed = sum(r["passed"] for r in results)
    accuracy = passed / len(results)
    print(f"\nAccuracy: {passed}/{len(results)} ({accuracy:.0%})")

    out = Path(__file__).parent / "eval_results.json"
    out.write_text(json.dumps({"model": MODEL, "accuracy": accuracy, "cases": results}, indent=2))
    print(f"Details saved to {out.name}")


if __name__ == "__main__":
    main()
