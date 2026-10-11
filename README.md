# Daily Task Tracker

A small, single-user daily planner built with Python, Flask, SQLite, HTML, CSS, and JavaScript. It includes task planning, an activity timer, a calendar, reminders, and weekly/monthly/yearly time summaries.

## Run it on your computer

Install Python 3.10 or newer. Then open a terminal in this folder and run:

```bash
python -m venv .venv
```

Activate the environment:

- Windows PowerShell: `.venv\Scripts\Activate.ps1`
- macOS or Linux: `source .venv/bin/activate`

Install the packages and start the app:

```bash
python -m pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000> in your browser. The app creates its SQLite database automatically the first time it starts. It does not need a separate database installation.

## Features

- Add, edit, complete, and remove tasks, with a date, time, category, priority, and optional reminder.
- Start, pause, resume, and save timed activity sessions.
- Add calendar events such as birthdays, exams, and parties.
- Review tracked time by week, month, or year with a daily/monthly bar chart, a category breakdown, and simple, non-judgmental suggestions.
- Keep tasks, events, and completed activity sessions in a local SQLite database.
- Enable browser notifications from inside the app. Reminders are checked while the app is open; the browser cannot deliver them after the app is closed.

## Project files

```text
app.py                 Flask pages and JSON API; creates the SQLite tables
templates/index.html   App pages and forms
static/css/style.css   Responsive light theme
static/js/app.js       Navigation, timer, calendar, charts, and API calls
requirements.txt       Python packages
Procfile               Production web-server command
.gitignore             Excludes local databases, environments, and secrets
```

The SQLite database is created in `instance/daily-task-tracker.sqlite3` by default. Set `DATABASE_PATH` to store it elsewhere. The database is intentionally excluded from Git so private tasks and event details are not uploaded.

## Put the source on GitHub

1. Create a new **empty** repository on GitHub. Do not initialize it with a README or other files.
2. Extract this ZIP into a folder on your computer.
3. Use GitHub Desktop: choose **File → New repository**, create a repository named `daily-task-tracker`, then copy the extracted project files into that repository folder.
4. In GitHub Desktop, review the changed files, enter a summary such as `Add Daily Task Tracker`, click **Commit to main**, and then click **Publish repository**.

Do not add the generated SQLite database or your `.env` file to GitHub.

## Hosting

The `Procfile` lets many Python hosts start the Flask app with Gunicorn. For a hosted instance, configure a persistent disk and point `DATABASE_PATH` at it; many hosts erase local files when restarting or redeploying.

This starter is intended for local, single-user use and has no sign-in system. Do not publish it as a public service or enter sensitive personal information until user authentication and access controls have been added.

## License

No open-source license is included yet. Without a license, GitHub visitors do not receive permission to reuse or redistribute the code. Choose a license before inviting others to use it.
