const state = {
  page: "dashboard",
  tasks: [],
  events: [],
  sessions: [],
  selectedDate: localDateKey(new Date()),
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  editingTask: null,
  editingEvent: null,
  statsPeriod: "week",
  statsAnchor: new Date(),
  timer: readTimer(),
  reminderPermission: "default",
  reminderToastTimer: null,
};

const categoryColors = {
  Study: "#9d8ab3",
  Work: "#849eb4",
  Wellness: "#819d83",
  Entertainment: "#ce9e92",
  Sleep: "#8293af",
  Home: "#c7a66f",
  Other: "#a4a092",
};

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function prettyDate(value, options = { weekday: "short", month: "short", day: "numeric" }) {
  if (!value) return "Any day";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, day));
}

function durationLabel(seconds) {
  const wholeMinutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(wholeMinutes / 60);
  const minutes = wholeMinutes % 60;
  if (hours && minutes) return `${hours} hr ${minutes} min`;
  if (hours) return `${hours} hr`;
  return `${minutes} min`;
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(state.reminderToastTimer);
  state.reminderToastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* Keep a useful fallback below. */ }
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function localTimerElapsed() {
  const base = Math.max(0, Number(state.timer.elapsedSeconds) || 0);
  return state.timer.running && state.timer.startedAt
    ? base + Math.floor((Date.now() - state.timer.startedAt) / 1000)
    : base;
}

function readTimer() {
  try {
    const timer = JSON.parse(localStorage.getItem("daily-task-tracker-timer") || "null");
    if (!timer || typeof timer !== "object") return emptyTimer();
    return {
      title: typeof timer.title === "string" ? timer.title : "",
      category: typeof timer.category === "string" ? timer.category : "Study",
      startedAt: Number(timer.startedAt) || null,
      elapsedSeconds: Math.max(0, Number(timer.elapsedSeconds) || 0),
      running: Boolean(timer.running),
      sessionStartedAt: Number(timer.sessionStartedAt) || null,
    };
  } catch { return emptyTimer(); }
}

function emptyTimer() {
  return { title: "", category: "Study", startedAt: null, elapsedSeconds: 0, running: false, sessionStartedAt: null };
}

function saveTimer() {
  localStorage.setItem("daily-task-tracker-timer", JSON.stringify(state.timer));
}

function elapsedClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const r = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${r}`;
}

function navigate(page) {
  state.page = page;
  document.querySelectorAll(".page").forEach((node) => {
    const active = node.id === `page-${page}`;
    node.hidden = !active;
    node.classList.toggle("active", active);
  });
  document.querySelectorAll(".nav-link").forEach((node) => node.classList.toggle("active", node.dataset.page === page));
  const titles = { dashboard: "Today", tasks: "Tasks", focus: "Focus", calendar: "Calendar", stats: "Time review" };
  document.getElementById("crumb-title").textContent = titles[page] || "Today";
  history.replaceState(null, "", `#${page}`);
  renderPage(page);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function taskTime(task) {
  if (task.start_time && task.end_time) return `${task.start_time} – ${task.end_time}`;
  return task.start_time || task.end_time || task.category;
}

function renderTask(task, compact = false) {
  const completed = task.completed ? " completed" : "";
  const date = task.due_date ? `${prettyDate(task.due_date)}${task.start_time ? ` · ${task.start_time}` : ""}` : task.category;
  const priority = task.priority !== "Normal" ? `<span class="priority ${task.priority.toLowerCase()}">${escapeHtml(task.priority)}</span>` : "";
  return `<article class="task-row${completed}" data-task-row="${task.id}">
    <input class="task-check" type="checkbox" aria-label="Mark ${escapeHtml(task.title)} complete" ${task.completed ? "checked" : ""} data-action="toggle-task" data-id="${task.id}">
    <div class="task-main"><div class="task-title">${escapeHtml(task.title)}</div><div class="task-meta">${escapeHtml(date)}${task.due_date ? ` · ${escapeHtml(task.category)}` : ""}</div></div>
    ${compact ? `<span class="tag">${escapeHtml(task.category)}</span>` : `<div class="row-actions">${priority}<button class="mini-action" title="Edit task" aria-label="Edit task" data-action="edit-task" data-id="${task.id}">✎</button><button class="mini-action" title="Delete task" aria-label="Delete task" data-action="delete-task" data-id="${task.id}">×</button></div>`}
  </article>`;
}

function renderUpcoming(item, dateText) {
  const time = item.start_time || item.event_time;
  const type = item.event_type || item.category || "Task";
  const title = item.title;
  return `<div class="upcoming-row"><span class="upcoming-time">${escapeHtml(time || dateText)}</span><span class="upcoming-rule"></span><div><div class="upcoming-title">${escapeHtml(title)}</div><div class="upcoming-sub">${escapeHtml(dateText)}</div></div><span class="tag">${escapeHtml(type)}</span></div>`;
}

function renderDashboard() {
  const today = localDateKey(new Date());
  const todayTasks = state.tasks.filter((task) => task.due_date === today);
  const upcomingTasks = state.tasks.filter((task) => task.due_date >= today && !task.completed);
  const completed = todayTasks.filter((task) => task.completed).length;
  const todaySeconds = state.sessions
    .filter((session) => localDateKey(new Date(session.start_at)) === today)
    .reduce((total, session) => total + session.duration_seconds, 0)
    + (state.timer.running && state.timer.sessionStartedAt ? localTimerElapsed() : 0);
  const upcomingEvents = state.events.filter((event) => event.event_date >= today).sort((a, b) => {
    const left = `${a.event_date} ${a.event_time || "23:59"}`;
    const right = `${b.event_date} ${b.event_time || "23:59"}`;
    return left.localeCompare(right);
  });
  document.getElementById("dashboard-date").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  document.getElementById("dash-planned").textContent = todayTasks.length;
  document.getElementById("dash-done").textContent = completed;
  document.getElementById("dash-time").textContent = durationLabel(todaySeconds);
  document.getElementById("dashboard-focus-time").textContent = durationLabel(todaySeconds);
  document.getElementById("dashboard-tasks").innerHTML = todayTasks.length
    ? todayTasks.map((task) => renderTask(task, true)).join("")
    : `<div class="empty-state">A clear little slate. Add one thing you would like to make room for today.</div>`;
  const items = [
    ...upcomingTasks.map((task) => ({ ...task, kind: "task" })),
    ...upcomingEvents.map((event) => ({ ...event, date: event.event_date, time: event.event_time, kind: "event" })),
  ].sort((a, b) => `${a.due_date || a.date} ${a.start_time || a.time || ""}`.localeCompare(`${b.due_date || b.date} ${b.start_time || b.time || ""}`)).slice(0, 5);
  document.getElementById("dashboard-upcoming").innerHTML = items.length
    ? items.map((item) => renderUpcoming(item, prettyDate(item.due_date || item.date))).join("")
    : `<div class="empty-state">Room to make plans. Your next commitment can go on the calendar.</div>`;
}

function renderTasks() {
  const sorted = [...state.tasks].sort((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    return `${a.due_date || "9999"} ${a.start_time || ""}`.localeCompare(`${b.due_date || "9999"} ${b.start_time || ""}`);
  });
  document.getElementById("task-count").textContent = String(state.tasks.length);
  document.getElementById("tasks-list").innerHTML = sorted.length
    ? sorted.map((task) => renderTask(task)).join("")
    : `<div class="empty-state">Nothing on the list yet. Add a task when you are ready.</div>`;
}

function renderFocus() {
  document.getElementById("focus-title-input").value = state.timer.title;
  document.getElementById("focus-category").value = state.timer.category;
  document.getElementById("timer-face").textContent = elapsedClock(localTimerElapsed());
  document.getElementById("timer-toggle").innerHTML = state.timer.running ? "<span aria-hidden=\"true\">Ⅱ</span> Pause" : (state.timer.elapsedSeconds ? "<span aria-hidden=\"true\">▶</span> Resume" : "<span aria-hidden=\"true\">▶</span> Start");
  document.getElementById("timer-stop").disabled = !state.timer.running && !state.timer.elapsedSeconds;
  document.getElementById("timer-caption").textContent = state.timer.running ? `In progress · ${state.timer.title || state.timer.category}` : state.timer.elapsedSeconds ? "Paused. Pick up where you left off." : "A quiet moment to get started.";
  const recent = [...state.sessions].sort((a, b) => b.start_at.localeCompare(a.start_at)).slice(0, 7);
  document.getElementById("recent-sessions").innerHTML = recent.length ? recent.map((session) => {
    const started = new Date(session.start_at);
    const label = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(started);
    return `<div class="session-row"><div><strong>${escapeHtml(session.title)}</strong><small>${escapeHtml(session.category)} · ${escapeHtml(label)}</small></div><span class="session-duration">${durationLabel(session.duration_seconds)}</span></div>`;
  }).join("") : `<div class="empty-state">Your saved focus sessions will show up here.</div>`;
}

function renderCalendar() {
  const month = state.calendarMonth;
  document.getElementById("calendar-month").textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month);
  document.getElementById("agenda-date").textContent = prettyDate(state.selectedDate, { weekday: "long", month: "long", day: "numeric" });
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let html = weekdays.map((day) => `<div class="weekday">${day}</div>`).join("");
  const today = localDateKey(new Date());
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const key = localDateKey(day);
    const classes = ["calendar-day"];
    if (day.getMonth() !== month.getMonth()) classes.push("outside");
    if (key === today) classes.push("today");
    if (key === state.selectedDate) classes.push("selected");
    if (state.events.some((event) => event.event_date === key)) classes.push("has-event");
    html += `<button class="${classes.join(" ")}" data-calendar-date="${key}" aria-label="${escapeHtml(prettyDate(key, { weekday: "long", month: "long", day: "numeric", year: "numeric" }))}" aria-pressed="${key === state.selectedDate}">${day.getDate()}</button>`;
  }
  document.getElementById("calendar-grid").innerHTML = html;
  const events = state.events.filter((event) => event.event_date === state.selectedDate).sort((a, b) => (a.event_time || "").localeCompare(b.event_time || ""));
  document.getElementById("day-events").innerHTML = events.length ? events.map((event) => `
    <article class="event-row"><span class="event-marker"></span><div class="event-copy"><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.event_type)}${event.event_time ? ` · ${escapeHtml(event.event_time)}` : ""}${event.notes ? ` · ${escapeHtml(event.notes)}` : ""}</p></div><div class="row-actions"><button class="mini-action" title="Edit event" aria-label="Edit event" data-action="edit-event" data-id="${event.id}">✎</button><button class="mini-action" title="Delete event" aria-label="Delete event" data-action="delete-event" data-id="${event.id}">×</button></div></article>`).join("")
    : `<div class="empty-state">An open day. Add a birthday, exam, or something else you would like to remember.</div>`;
}

function startOfWeek(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function getStatsRange() {
  const anchor = state.statsAnchor;
  if (state.statsPeriod === "week") {
    const start = startOfWeek(anchor);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start, end, title: `${prettyDate(localDateKey(start), { month: "short", day: "numeric" })} – ${prettyDate(localDateKey(end), { month: "short", day: "numeric", year: "numeric" })}`, days: Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)) };
  }
  if (state.statsPeriod === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { start, end, title: new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(anchor), days: Array.from({ length: end.getDate() }, (_, index) => new Date(anchor.getFullYear(), anchor.getMonth(), index + 1)) };
  }
  const start = new Date(anchor.getFullYear(), 0, 1);
  const end = new Date(anchor.getFullYear(), 11, 31);
  return { start, end, title: String(anchor.getFullYear()), days: Array.from({ length: 12 }, (_, index) => new Date(anchor.getFullYear(), index, 1)) };
}

function renderStats() {
  const range = getStatsRange();
  const selected = state.sessions.filter((session) => {
    const date = new Date(session.start_at);
    return date >= range.start && date <= new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate(), 23, 59, 59, 999);
  });
  const total = selected.reduce((sum, session) => sum + session.duration_seconds, 0);
  const dayCount = state.statsPeriod === "week" ? 7 : state.statsPeriod === "month" ? range.days.length : (new Date(range.start.getFullYear(), 1, 29).getMonth() === 1 ? 366 : 365);
  document.getElementById("stats-range").textContent = range.title;
  document.getElementById("stats-total").textContent = durationLabel(total);
  document.getElementById("stats-average").textContent = durationLabel(total / dayCount);
  document.getElementById("stats-count").textContent = String(selected.length);
  document.getElementById("donut-total").textContent = durationLabel(total);

  const grouped = new Map();
  selected.forEach((session) => grouped.set(session.category, (grouped.get(session.category) || 0) + session.duration_seconds));
  const categories = [...grouped].sort((a, b) => b[1] - a[1]);
  const colors = categories.map(([category]) => categoryColors[category] || categoryColors.Other);
  let cursor = 0;
  const stops = categories.map(([, seconds], index) => {
    const start = cursor;
    cursor += total ? seconds / total * 100 : 0;
    return `${colors[index]} ${start}% ${cursor}%`;
  });
  document.getElementById("donut").style.background = stops.length ? `conic-gradient(${stops.join(",")})` : "#eae7df";
  document.getElementById("legend").innerHTML = categories.length ? categories.slice(0, 7).map(([category, seconds], index) => `
    <div class="legend-row"><span class="legend-swatch" style="background:${colors[index]}"></span><span>${escapeHtml(category)}</span><strong>${Math.round(seconds / total * 100)}%</strong></div>`).join("") : `<div class="empty-state">Your activity mix will appear here.</div>`;

  const values = range.days.map((day) => {
    const key = state.statsPeriod === "year" ? day.getMonth() : localDateKey(day);
    const seconds = selected.filter((session) => {
      const date = new Date(session.start_at);
      return state.statsPeriod === "year" ? date.getMonth() === key : localDateKey(date) === key;
    }).reduce((sum, session) => sum + session.duration_seconds, 0);
    return { day, seconds };
  });
  const max = Math.max(1, ...values.map((item) => item.seconds));
  document.getElementById("bar-chart").innerHTML = values.map(({ day, seconds }) => {
    const height = seconds ? Math.max(5, seconds / max * 100) : 0;
    const label = state.statsPeriod === "year" ? new Intl.DateTimeFormat(undefined, { month: "short" }).format(day) : state.statsPeriod === "month" ? String(day.getDate()) : new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day);
    const isToday = localDateKey(day) === localDateKey(new Date());
    return `<div class="bar-column${isToday ? " today" : ""}" title="${escapeHtml(label)}: ${escapeHtml(durationLabel(seconds))}"><span class="bar-value">${seconds ? escapeHtml(durationLabel(seconds)) : ""}</span><span class="bar-fill" style="height:${height}%"></span><span class="bar-label">${escapeHtml(label)}</span></div>`;
  }).join("");

  const observations = [];
  if (!selected.length) {
    observations.push({ title: "Start with noticing", message: "Track a few real sessions, then come back. Nothing here is a score." });
  } else {
    const top = categories[0];
    observations.push({ title: `${top[0]} has the largest share`, message: `It makes up ${Math.round(top[1] / total * 100)}% of the time you tracked in this period. Does that feel right for this season?` });
    const entertainment = (grouped.get("Entertainment") || 0) / total;
    const sleep = (grouped.get("Sleep") || 0) / total;
    if (entertainment > .35) observations.push({ title: "Entertainment is over a third of tracked time", message: "This is only a prompt for curiosity, not a problem to fix.", link: ["https://www.apa.org/topics/social-media-internet/technology-use", "APA guidance on technology use"] });
    if (sleep > .45) observations.push({ title: "Sleep takes a large share of tracked time", message: "This may reflect what you chose to track. For a reference point, see the CDC’s general sleep recommendations.", link: ["https://www.cdc.gov/sleep/about/index.html", "CDC sleep recommendations"] });
    if (sleep < .23 && selected.length >= 3) observations.push({ title: "Sleep is under 23% of tracked time", message: "Time tracking can be incomplete, so this may not reflect your real sleep. The CDC has general sleep guidance.", link: ["https://www.cdc.gov/sleep/about/index.html", "CDC sleep recommendations"] });
    observations.push({ title: "Small adjustments count, if you want them to", message: "Use your task plan to make room for what you would like more of. There is no ideal mix here." });
  }
  document.getElementById("suggestions").innerHTML = observations.map((item) => `<div class="suggestion"><span class="suggestion-mark" aria-hidden="true">✳</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}${item.link ? ` <a href="${escapeHtml(item.link[0])}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.link[1])}</a>.` : ""}</p></div></div>`).join("");
}

async function refreshData() {
  try {
    const [tasks, events, sessions] = await Promise.all([api("/api/tasks"), api("/api/events"), api("/api/sessions")]);
    state.tasks = tasks;
    state.events = events;
    state.sessions = sessions;
    document.getElementById("today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date());
    renderPage(state.page);
    checkReminders();
  } catch (error) {
    showToast(error.message || "Could not load your planner data.", true);
  }
}

function renderPage(page) {
  if (page === "dashboard") renderDashboard();
  if (page === "tasks") renderTasks();
  if (page === "focus") renderFocus();
  if (page === "calendar") renderCalendar();
  if (page === "stats") renderStats();
}

function resetTaskForm() {
  state.editingTask = null;
  document.getElementById("task-form").reset();
  document.getElementById("task-date").value = localDateKey(new Date());
  document.getElementById("task-form-title").textContent = "New task";
  document.getElementById("task-form-eyebrow").textContent = "Add something to your day";
  document.getElementById("task-submit").textContent = "Add task";
  document.getElementById("task-cancel-edit").hidden = true;
}

function editTask(task) {
  state.editingTask = task.id;
  document.getElementById("task-title").value = task.title;
  document.getElementById("task-category").value = task.category;
  document.getElementById("task-priority").value = task.priority;
  document.getElementById("task-date").value = task.due_date || "";
  document.getElementById("task-start").value = task.start_time || "";
  document.getElementById("task-end").value = task.end_time || "";
  document.getElementById("task-reminder").value = task.reminder_minutes ?? "";
  document.getElementById("task-form-title").textContent = "Edit task";
  document.getElementById("task-form-eyebrow").textContent = "Make a change";
  document.getElementById("task-submit").textContent = "Save changes";
  document.getElementById("task-cancel-edit").hidden = false;
  document.getElementById("task-title").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetEventForm() {
  state.editingEvent = null;
  document.getElementById("event-form").reset();
  document.getElementById("event-date").value = state.selectedDate;
  document.getElementById("event-form-title").textContent = "Add event";
  document.getElementById("event-form-eyebrow").textContent = "Make a note of it";
  document.getElementById("event-submit").textContent = "Add event";
  document.getElementById("event-cancel-edit").hidden = true;
}

function editEvent(event) {
  state.editingEvent = event.id;
  document.getElementById("event-title").value = event.title;
  document.getElementById("event-type").value = event.event_type;
  document.getElementById("event-date").value = event.event_date;
  document.getElementById("event-time").value = event.event_time || "";
  document.getElementById("event-reminder").value = event.reminder_minutes ?? "";
  document.getElementById("event-notes").value = event.notes || "";
  document.getElementById("event-form-title").textContent = "Edit event";
  document.getElementById("event-form-eyebrow").textContent = "Update the details";
  document.getElementById("event-submit").textContent = "Save changes";
  document.getElementById("event-cancel-edit").hidden = false;
  document.getElementById("event-title").focus();
}

function reminderStorage() {
  try { return new Set(JSON.parse(localStorage.getItem("daily-task-tracker-reminders") || "[]")); }
  catch { return new Set(); }
}

function checkReminders() {
  const now = Date.now();
  const sent = reminderStorage();
  const candidates = [
    ...state.tasks.filter((task) => task.reminder_minutes !== null && task.reminder_minutes !== undefined && task.due_date && task.start_time)
      .map((task) => ({ id: `task-${task.id}`, title: task.title, body: "Your planned activity is coming up.", date: task.due_date, time: task.start_time, minutes: task.reminder_minutes, skip: task.completed })),
    ...state.events.filter((event) => event.reminder_minutes !== null && event.reminder_minutes !== undefined)
      .map((event) => ({ id: `event-${event.id}`, title: event.title, body: `${event.event_type} reminder`, date: event.event_date, time: event.event_time || "09:00", minutes: event.reminder_minutes, skip: false })),
  ];
  for (const item of candidates) {
    if (item.skip) continue;
    const trigger = new Date(`${item.date}T${item.time}:00`).getTime() - item.minutes * 60_000;
    const key = `${item.id}-${item.date}-${item.time}-${item.minutes}`;
    if (trigger <= now + 30_000 && trigger >= now - 60_000 && !sent.has(key)) {
      sent.add(key);
      showToast(`${item.title}: ${item.body}`);
      if ("Notification" in window && Notification.permission === "granted") new Notification(item.title, { body: item.body });
    }
  }
  localStorage.setItem("daily-task-tracker-reminders", JSON.stringify([...sent].slice(-250)));
}

function setTimerInputsLocked(locked) {
  document.getElementById("focus-title-input").readOnly = locked;
  document.getElementById("focus-category").disabled = locked;
}

document.querySelectorAll(".nav-link").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.page)));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.go)));
document.querySelectorAll("[data-quick]").forEach((button) => button.addEventListener("click", () => {
  state.timer.title = "";
  state.timer.category = button.dataset.quick;
  state.timer.elapsedSeconds = 0;
  state.timer.running = true;
  state.timer.startedAt = Date.now();
  state.timer.sessionStartedAt = Date.now();
  saveTimer();
  navigate("focus");
  setTimerInputsLocked(true);
  showToast(`${button.dataset.quick} timer started.`);
}));

document.getElementById("task-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const data = Object.fromEntries(form.entries());
  if (!data.reminderMinutes) delete data.reminderMinutes;
  try {
    await api(state.editingTask ? `/api/tasks/${state.editingTask}` : "/api/tasks", {
      method: state.editingTask ? "PATCH" : "POST", body: JSON.stringify(data),
    });
    showToast(state.editingTask ? "Task updated." : "Task added to your plan.");
    resetTaskForm();
    await refreshData();
  } catch (error) { showToast(error.message, true); }
});

document.getElementById("task-cancel-edit").addEventListener("click", resetTaskForm);
document.getElementById("event-cancel-edit").addEventListener("click", resetEventForm);

document.getElementById("tasks-list").addEventListener("change", async (event) => {
  const input = event.target.closest('[data-action="toggle-task"]');
  if (!input) return;
  try {
    await api(`/api/tasks/${input.dataset.id}`, { method: "PATCH", body: JSON.stringify({ completed: input.checked }) });
    await refreshData();
  } catch (error) { showToast(error.message, true); await refreshData(); }
});
document.getElementById("dashboard-tasks").addEventListener("change", async (event) => {
  const input = event.target.closest('[data-action="toggle-task"]');
  if (!input) return;
  try {
    await api(`/api/tasks/${input.dataset.id}`, { method: "PATCH", body: JSON.stringify({ completed: input.checked }) });
    await refreshData();
  } catch (error) { showToast(error.message, true); await refreshData(); }
});
document.getElementById("tasks-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const task = state.tasks.find((item) => item.id === Number(button.dataset.id));
  if (!task) return;
  if (button.dataset.action === "edit-task") editTask(task);
  if (button.dataset.action === "delete-task" && window.confirm(`Delete “${task.title}”?`)) {
    try { await api(`/api/tasks/${task.id}`, { method: "DELETE" }); showToast("Task removed."); await refreshData(); }
    catch (error) { showToast(error.message, true); }
  }
});

document.getElementById("event-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const data = Object.fromEntries(form.entries());
  if (!data.reminderMinutes) delete data.reminderMinutes;
  try {
    await api(state.editingEvent ? `/api/events/${state.editingEvent}` : "/api/events", {
      method: state.editingEvent ? "PATCH" : "POST", body: JSON.stringify(data),
    });
    showToast(state.editingEvent ? "Event updated." : "Event added to your calendar.");
    const date = data.date;
    if (!state.editingEvent) state.selectedDate = date;
    resetEventForm();
    await refreshData();
  } catch (error) { showToast(error.message, true); }
});

document.getElementById("calendar-grid").addEventListener("click", (event) => {
  const day = event.target.closest("[data-calendar-date]");
  if (!day) return;
  state.selectedDate = day.dataset.calendarDate;
  document.getElementById("event-date").value = state.selectedDate;
  renderCalendar();
});
document.getElementById("calendar-prev").addEventListener("click", () => { state.calendarMonth.setMonth(state.calendarMonth.getMonth() - 1); renderCalendar(); });
document.getElementById("calendar-next").addEventListener("click", () => { state.calendarMonth.setMonth(state.calendarMonth.getMonth() + 1); renderCalendar(); });
document.getElementById("calendar-today").addEventListener("click", () => {
  const now = new Date();
  state.calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  state.selectedDate = localDateKey(now);
  document.getElementById("event-date").value = state.selectedDate;
  renderCalendar();
});
document.getElementById("day-events").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const item = state.events.find((entry) => entry.id === Number(button.dataset.id));
  if (!item) return;
  if (button.dataset.action === "edit-event") editEvent(item);
  if (button.dataset.action === "delete-event" && window.confirm(`Delete “${item.title}”?`)) {
    try { await api(`/api/events/${item.id}`, { method: "DELETE" }); showToast("Event removed."); await refreshData(); }
    catch (error) { showToast(error.message, true); }
  }
});

document.getElementById("timer-toggle").addEventListener("click", () => {
  const button = document.getElementById("timer-toggle");
  if (state.timer.running) {
    state.timer.elapsedSeconds = localTimerElapsed();
    state.timer.running = false;
    state.timer.startedAt = null;
    button.innerHTML = "<span aria-hidden=\"true\">▶</span> Resume";
    setTimerInputsLocked(false);
    showToast("Timer paused.");
  } else {
    if (!state.timer.elapsedSeconds) {
      state.timer.title = document.getElementById("focus-title-input").value.trim() || document.getElementById("focus-category").value;
      state.timer.category = document.getElementById("focus-category").value;
      state.timer.sessionStartedAt = Date.now();
    }
    state.timer.startedAt = Date.now();
    state.timer.running = true;
    setTimerInputsLocked(true);
    showToast(state.timer.elapsedSeconds ? "Timer resumed." : "Timer started.");
  }
  saveTimer();
  renderFocus();
});

document.getElementById("timer-stop").addEventListener("click", async () => {
  if (!state.timer.elapsedSeconds && !state.timer.running) return;
  const duration = localTimerElapsed();
  const end = Date.now();
  const start = state.timer.sessionStartedAt || end - duration * 1000;
  const session = {
    title: state.timer.title || state.timer.category || "Activity",
    category: state.timer.category,
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    durationSeconds: Math.max(1, duration),
  };
  try {
    await api("/api/sessions", { method: "POST", body: JSON.stringify(session) });
    state.timer = emptyTimer();
    saveTimer();
    setTimerInputsLocked(false);
    showToast("Focus session saved.");
    await refreshData();
  } catch (error) { showToast(error.message, true); }
});

document.getElementById("focus-title-input").addEventListener("input", (event) => { state.timer.title = event.target.value; saveTimer(); });
document.getElementById("focus-category").addEventListener("change", (event) => { state.timer.category = event.target.value; saveTimer(); });

document.getElementById("enable-reminders").addEventListener("click", async () => {
  if (!("Notification" in window)) {
    showToast("Browser notifications are not supported here.", true);
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    document.getElementById("reminder-label").textContent = permission === "granted" ? "Reminders on" : "Reminders";
    showToast(permission === "granted" ? "Browser reminders are enabled." : "Browser notifications were not enabled.");
  } catch { showToast("Could not enable browser notifications.", true); }
});

document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => {
  state.statsPeriod = button.dataset.period;
  state.statsAnchor = new Date();
  document.querySelectorAll("[data-period]").forEach((tab) => tab.classList.toggle("active", tab === button));
  renderStats();
}));
document.getElementById("stats-prev").addEventListener("click", () => {
  const amount = state.statsPeriod === "week" ? -7 : state.statsPeriod === "month" ? -1 : -12;
  if (state.statsPeriod === "week") state.statsAnchor.setDate(state.statsAnchor.getDate() + amount);
  else if (state.statsPeriod === "month") state.statsAnchor.setMonth(state.statsAnchor.getMonth() + amount);
  else state.statsAnchor.setFullYear(state.statsAnchor.getFullYear() + amount);
  renderStats();
});
document.getElementById("stats-next").addEventListener("click", () => {
  const amount = state.statsPeriod === "week" ? 7 : state.statsPeriod === "month" ? 1 : 12;
  if (state.statsPeriod === "week") state.statsAnchor.setDate(state.statsAnchor.getDate() + amount);
  else if (state.statsPeriod === "month") state.statsAnchor.setMonth(state.statsAnchor.getMonth() + amount);
  else state.statsAnchor.setFullYear(state.statsAnchor.getFullYear() + amount);
  renderStats();
});

window.addEventListener("hashchange", () => {
  const page = location.hash.slice(1);
  if (["dashboard", "tasks", "focus", "calendar", "stats"].includes(page)) navigate(page);
});

const today = localDateKey(new Date());
document.getElementById("task-date").value = today;
document.getElementById("event-date").value = today;
if (state.timer.running) setTimerInputsLocked(true);
const initialPage = location.hash.slice(1);
if (["dashboard", "tasks", "focus", "calendar", "stats"].includes(initialPage)) state.page = initialPage;
refreshData().then(() => navigate(state.page));
setInterval(() => {
  if (state.timer.running) {
    document.getElementById("timer-face").textContent = elapsedClock(localTimerElapsed());
    const total = state.sessions.filter((session) => localDateKey(new Date(session.start_at)) === localDateKey(new Date())).reduce((sum, session) => sum + session.duration_seconds, 0) + localTimerElapsed();
    document.getElementById("dash-time").textContent = durationLabel(total);
    document.getElementById("dashboard-focus-time").textContent = durationLabel(total);
  }
}, 1000);
setInterval(checkReminders, 15000);
