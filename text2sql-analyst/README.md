# Ask Your Data: a Text-to-SQL Analyst

Ask questions about a database in plain English. Claude writes the SQL, the app runs it safely, and you get the query, a results table, and a chart. Follow-up questions work ("now only 2026"), and you can upload your own SQLite file.

## Features

- **Natural language to SQL** using the Claude API, with the schema supplied automatically
- **Self-correcting:** if a query fails, the error is sent back to Claude for up to two retries
- **Safe by design:** read-only database connection, SELECT-only validation, single statement, row limit
- **Conversation memory:** follow-up questions reuse earlier queries
- **Charts:** bar (stacked), line (multi-series), and pie, chosen by Claude to fit the result
- **Bring your own data:** upload any SQLite file; only table definitions and questions are sent to Claude, never data rows
- **Accuracy tests:** `evaluate.py` scores the analyst against reference queries

## How it works

```
question -> prompt (schema + history + hints) -> Claude -> JSON {sql, chart, explanation}
         -> validate -> run read-only -> table + chart   (on error: retry with the error message)
```

## Quick start

Requires Python 3.10+.

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=your_key      # Windows: set ANTHROPIC_API_KEY=your_key
python seed_db.py                      # optional: the app creates the sample DB if missing
streamlit run app.py
```

Try: "Total revenue by month in 2026", "Orders by status for each month in 2026", "Revenue share by category".

## Measure accuracy

```bash
python evaluate.py --verbose
CLAUDE_MODEL=claude-haiku-5-5 python evaluate.py    # compare models
```

The script runs 12 questions (10 with reference queries, 2 unanswerable on purpose), compares results, and saves details to `eval_results.json`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | (required) | Your Claude API key |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Model used to write SQL |
| `DB_PATH` | `shop.db` | Default database file |
| `MAX_QUESTIONS_PER_SESSION` | `30` | Soft cap per browser session |

## Deploy

### Streamlit Community Cloud (free)

1. Push this folder to a GitHub repository.
2. Go to share.streamlit.io, choose **New app**, pick the repo, and set the main file to `app.py`.
3. Under **Advanced settings → Secrets**, add: `ANTHROPIC_API_KEY = "your_key"`
4. Deploy. The sample database is created automatically on first load.

### Docker

```bash
docker build -t ask-your-data .
docker run -p 8501:8501 -e ANTHROPIC_API_KEY=your_key ask-your-data
```

Then open http://localhost:8501.

**Before sharing a public link,** set a monthly spend limit for your API key in the Anthropic Console. The per-session cap is only a soft guard, since refreshing the page resets it.

## Safety notes

- The database opens in read-only mode, so writes fail even if validation is bypassed.
- A keyword filter also rejects non-SELECT statements. It is deliberately strict and may block harmless queries that use words like `replace`, even inside string literals.
- Uploaded files are opened read-only and are not shared between sessions.

## Limitations

- SQLite only. Other databases need a different `connect()` and dialect notes in the prompt.
- The whole schema goes into each prompt, so databases with hundreds of tables need schema filtering first.
- Generated SQL can be wrong. Always check the SQL shown in the app, and add failing questions to `evaluate.py`.

## Project structure

```
app.py          Streamlit chat UI and charts
text2sql.py     Prompting, validation, execution, retries
seed_db.py      Builds the sample e-commerce database
evaluate.py     Accuracy tests against reference queries
Dockerfile      Container image
```
