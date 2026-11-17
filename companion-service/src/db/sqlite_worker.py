#!/usr/bin/env python3
import sys
import json
import sqlite3
import os

db_path = sys.argv[1]
os.makedirs(os.path.dirname(db_path), exist_ok=True)
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.executescript('''
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS activity_events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    project TEXT NOT NULL,
    agent_id TEXT,
    agent_name TEXT,
    model_id TEXT,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER,
    task_id TEXT,
    details_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON activity_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_proj ON activity_events(project);
CREATE INDEX IF NOT EXISTS idx_events_cat ON activity_events(category);
CREATE INDEX IF NOT EXISTS idx_events_task ON activity_events(task_id);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    project TEXT NOT NULL,
    prompt TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_origin TEXT NOT NULL,
    model_id TEXT NOT NULL,
    execution_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER DEFAULT 0,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    trace_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    project TEXT NOT NULL,
    task_id TEXT,
    agent_id TEXT,
    category TEXT NOT NULL,
    operation TEXT NOT NULL,
    command_or_path TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    status TEXT NOT NULL,
    resolution_note TEXT
);

CREATE TABLE IF NOT EXISTS model_selections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    model_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    scope TEXT NOT NULL,
    parameters_json TEXT
);

CREATE TABLE IF NOT EXISTS paired_devices (
    device_id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    paired_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_ip TEXT,
    token_hash TEXT NOT NULL,
    revoked INTEGER DEFAULT 0
);
''')
conn.commit()

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        req_id = req.get("id")
        action = req.get("action")
        sql = req.get("sql", "")
        params = req.get("params", [])
        if action == "exec":
            cur.execute(sql, params)
            conn.commit()
            res = {"id": req_id, "ok": True, "rowcount": cur.rowcount, "lastrowid": cur.lastrowid}
        elif action == "query":
            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]
            res = {"id": req_id, "ok": True, "rows": rows}
        else:
            res = {"id": req_id, "ok": False, "error": f"Unknown action: {action}"}
    except Exception as e:
        res = {"id": req.get("id"), "ok": False, "error": str(e)}
    sys.stdout.write(json.dumps(res) + "\n")
    sys.stdout.flush()
