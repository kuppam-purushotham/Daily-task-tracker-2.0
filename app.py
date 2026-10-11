from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterator

from flask import Flask, jsonify, render_template, request


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATABASE = BASE_DIR / "instance" / "daily-task-tracker.sqlite3"
DATABASE_PATH = Path(os.environ.get("DATABASE_PATH", str(DEFAULT_DATABASE)))

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 128 * 1024


@contextmanager
def database() -> Iterator[sqlite3.Connection]:
    """Open a short-lived connection and ensure writes are committed."""
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database() -> None:
    with database() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'Other',
                due_date TEXT,
                start_time TEXT,
                end_time TEXT,
                priority TEXT NOT NULL DEFAULT 'Normal',
                completed INTEGER NOT NULL DEFAULT 0,
                reminder_minutes INTEGER,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                event_type TEXT NOT NULL DEFAULT 'Other',
                event_date TEXT NOT NULL,
                event_time TEXT,
                reminder_minutes INTEGER,
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'Other',
                start_at TEXT NOT NULL,
                end_at TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL
            );
            """
        )


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def json_body() -> dict[str, Any]:
    value = request.get_json(silent=True)
    return value if isinstance(value, dict) else {}


def required_text(value: Any, field: str, maximum: int = 180) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} is required.")
    cleaned = value.strip()
    if len(cleaned) > maximum:
        raise ValueError(f"{field} must be {maximum} characters or fewer.")
    return cleaned


def optional_date(value: Any, field: str) -> str | None:
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a date.")
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise ValueError(f"{field} must use YYYY-MM-DD format.") from exc


def required_date(value: Any, field: str) -> str:
    parsed = optional_date(value, field)
    if parsed is None:
        raise ValueError(f"{field} is required.")
    return parsed


def optional_time(value: Any, field: str) -> str | None:
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a time.")
    try:
        return datetime.strptime(value, "%H:%M").strftime("%H:%M")
    except ValueError as exc:
        raise ValueError(f"{field} must use HH:MM format.") from exc


def optional_reminder(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        minutes = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Reminder must be a number of minutes.") from exc
    if minutes not in (0, 5, 15, 30, 60, 1440):
        raise ValueError("Choose one of the available reminder times.")
    return minutes


def row_dict(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    if "completed" in result:
        result["completed"] = bool(result["completed"])
    return result


def fetch_all(query: str, values: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with database() as connection:
        rows = connection.execute(query, values).fetchall()
    return [row_dict(row) for row in rows]


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/tasks")
def list_tasks():
    return jsonify(fetch_all("SELECT * FROM tasks ORDER BY due_date, start_time, id"))


@app.post("/api/tasks")
def create_task():
    body = json_body()
    try:
        title = required_text(body.get("title"), "Task title")
        category = required_text(body.get("category", "Other"), "Category", 40)
        due_date = optional_date(body.get("dueDate"), "Due date")
        start_time = optional_time(body.get("startTime"), "Start time")
        end_time = optional_time(body.get("endTime"), "End time")
        priority = body.get("priority", "Normal")
        if priority not in ("Low", "Normal", "High"):
            raise ValueError("Choose a valid priority.")
        reminder = optional_reminder(body.get("reminderMinutes"))
    except ValueError as exc:
        return error(str(exc))

    with database() as connection:
        cursor = connection.execute(
            """INSERT INTO tasks
               (title, category, due_date, start_time, end_time, priority,
                reminder_minutes, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (title, category, due_date, start_time, end_time, priority,
             reminder, datetime.now().astimezone().isoformat(timespec="seconds")),
        )
        task = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    return jsonify(row_dict(task)), 201


@app.patch("/api/tasks/<int:item_id>")
def update_task(item_id: int):
    body = json_body()
    fields = {
        "title": ("title", lambda v: required_text(v, "Task title")),
        "category": ("category", lambda v: required_text(v, "Category", 40)),
        "dueDate": ("due_date", lambda v: optional_date(v, "Due date")),
        "startTime": ("start_time", lambda v: optional_time(v, "Start time")),
        "endTime": ("end_time", lambda v: optional_time(v, "End time")),
        "priority": ("priority", lambda v: v if v in ("Low", "Normal", "High") else (_ for _ in ()).throw(ValueError("Choose a valid priority."))),
        "completed": ("completed", lambda v: int(bool(v)) if isinstance(v, bool) else (_ for _ in ()).throw(ValueError("Completed must be true or false."))),
        "reminderMinutes": ("reminder_minutes", optional_reminder),
    }
    changes = []
    values: list[Any] = []
    try:
        for key, value in body.items():
            if key not in fields:
                continue
            column, convert = fields[key]
            changes.append(f"{column} = ?")
            values.append(convert(value))
    except ValueError as exc:
        return error(str(exc))
    if not changes:
        return error("There are no task changes to save.")

    with database() as connection:
        values.append(item_id)
        cursor = connection.execute(
            f"UPDATE tasks SET {', '.join(changes)} WHERE id = ?", values
        )
        if cursor.rowcount == 0:
            return error("Task not found.", 404)
        task = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (item_id,)
        ).fetchone()
    return jsonify(row_dict(task))


@app.delete("/api/tasks/<int:item_id>")
def delete_task(item_id: int):
    with database() as connection:
        cursor = connection.execute("DELETE FROM tasks WHERE id = ?", (item_id,))
    if cursor.rowcount == 0:
        return error("Task not found.", 404)
    return jsonify({"deleted": True})


@app.get("/api/events")
def list_events():
    return jsonify(fetch_all("SELECT * FROM events ORDER BY event_date, event_time, id"))


@app.post("/api/events")
def create_event():
    body = json_body()
    try:
        title = required_text(body.get("title"), "Event title")
        event_type = required_text(body.get("type", "Other"), "Event type", 40)
        event_date = optional_date(body.get("date"), "Event date")
        if event_date is None:
            raise ValueError("Event date is required.")
        event_time = optional_time(body.get("time"), "Event time")
        reminder = optional_reminder(body.get("reminderMinutes"))
        notes = body.get("notes", "")
        if not isinstance(notes, str) or len(notes) > 1000:
            raise ValueError("Notes must be 1,000 characters or fewer.")
    except ValueError as exc:
        return error(str(exc))

    with database() as connection:
        cursor = connection.execute(
            """INSERT INTO events
               (title, event_type, event_date, event_time, reminder_minutes,
                notes, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (title, event_type, event_date, event_time, reminder, notes.strip(),
             datetime.now().astimezone().isoformat(timespec="seconds")),
        )
        event = connection.execute(
            "SELECT * FROM events WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    return jsonify(row_dict(event)), 201


@app.patch("/api/events/<int:item_id>")
def update_event(item_id: int):
    body = json_body()
    fields = {
        "title": ("title", lambda v: required_text(v, "Event title")),
        "type": ("event_type", lambda v: required_text(v, "Event type", 40)),
        "date": ("event_date", lambda v: required_date(v, "Event date")),
        "time": ("event_time", lambda v: optional_time(v, "Event time")),
        "reminderMinutes": ("reminder_minutes", optional_reminder),
        "notes": ("notes", lambda v: v.strip() if isinstance(v, str) and len(v) <= 1000 else (_ for _ in ()).throw(ValueError("Notes must be 1,000 characters or fewer."))),
    }
    changes = []
    values: list[Any] = []
    try:
        for key, value in body.items():
            if key not in fields:
                continue
            column, convert = fields[key]
            changes.append(f"{column} = ?")
            values.append(convert(value))
    except ValueError as exc:
        return error(str(exc))
    if not changes:
        return error("There are no event changes to save.")

    with database() as connection:
        values.append(item_id)
        cursor = connection.execute(
            f"UPDATE events SET {', '.join(changes)} WHERE id = ?", values
        )
        if cursor.rowcount == 0:
            return error("Event not found.", 404)
        event = connection.execute(
            "SELECT * FROM events WHERE id = ?", (item_id,)
        ).fetchone()
    return jsonify(row_dict(event))


@app.delete("/api/events/<int:item_id>")
def delete_event(item_id: int):
    with database() as connection:
        cursor = connection.execute("DELETE FROM events WHERE id = ?", (item_id,))
    if cursor.rowcount == 0:
        return error("Event not found.", 404)
    return jsonify({"deleted": True})


@app.get("/api/sessions")
def list_sessions():
    return jsonify(fetch_all("SELECT * FROM sessions ORDER BY start_at DESC"))


@app.post("/api/sessions")
def create_session():
    body = json_body()
    try:
        title = required_text(body.get("title"), "Activity title")
        category = required_text(body.get("category", "Other"), "Category", 40)
        start_at = required_text(body.get("startAt"), "Start time", 40)
        end_at = required_text(body.get("endAt"), "End time", 40)
        start = datetime.fromisoformat(start_at.replace("Z", "+00:00"))
        end = datetime.fromisoformat(end_at.replace("Z", "+00:00"))
        duration = int(body.get("durationSeconds", 0))
        if end <= start:
            raise ValueError("Activity end must be after its start.")
        if not 1 <= duration <= 24 * 60 * 60:
            raise ValueError("Activity duration must be between 1 second and 24 hours.")
    except (ValueError, TypeError) as exc:
        return error(str(exc) or "Activity details are invalid.")

    with database() as connection:
        cursor = connection.execute(
            """INSERT INTO sessions
               (title, category, start_at, end_at, duration_seconds)
               VALUES (?, ?, ?, ?, ?)""",
            (title, category, start.isoformat(), end.isoformat(), duration),
        )
        session = connection.execute(
            "SELECT * FROM sessions WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    return jsonify(row_dict(session)), 201


initialize_database()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
