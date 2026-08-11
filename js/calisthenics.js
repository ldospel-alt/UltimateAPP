const CALISTHENICS_KEY = "gym_calisthenics";

const EXERCISE_TYPES = {
  reps: "Počet opakování",
  duration: "Doba trvání (sekundy)",
  "distance-time": "Vzdálenost + čas",
  swim: "Styl + vzdálenost",
};

const DEFAULT_EXERCISES = {
  "běh": { name: "Běh", type: "distance-time" },
  "kolo": { name: "Kolo", type: "distance-time" },
  "plavání": { name: "Plavání", type: "swim" },
};

let chartInstance = null;
let editingSessionId = null;

function getSessions() {
  return Storage.read(CALISTHENICS_KEY, []);
}

function saveSessions(list) {
  Storage.write(CALISTHENICS_KEY, list);
}

function exerciseKey(name) {
  return String(name || "").trim().toLocaleLowerCase("cs");
}

function getFixedExerciseType(name) {
  const defaultExercise = DEFAULT_EXERCISES[exerciseKey(name)];
  if (defaultExercise) return defaultExercise.type;

  for (const session of getSessions()) {
    const exercise = session.exercises.find((item) => exerciseKey(item.name) === exerciseKey(name));
    if (exercise && EXERCISE_TYPES[exercise.type]) return exercise.type;
  }
  return null;
}

function getExerciseType(name, fallback = "reps") {
  const fixedType = getFixedExerciseType(name);
  if (fixedType) return fixedType;
  return EXERCISE_TYPES[fallback] ? fallback : "reps";
}

function createTypeSelect(type, allowedTypes = Object.keys(EXERCISE_TYPES)) {
  const select = document.createElement("select");
  select.className = "ex-type";
  select.setAttribute("aria-label", "Typ měřených údajů");
  allowedTypes.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = EXERCISE_TYPES[value];
    select.appendChild(option);
  });
  select.value = allowedTypes.includes(type) ? type : allowedTypes[0];
  return select;
}

function createEntryRow(type, entry = null) {
  const row = document.createElement("div");
  row.className = "set-row performance-row";

  if (type === "distance-time") {
    row.innerHTML = `
      <input type="number" inputmode="decimal" class="entry-distance" placeholder="Vzdálenost (km)" min="0" step="0.01" />
      <input type="text" inputmode="text" class="entry-time" placeholder="Čas (např. 25:30)" autocomplete="off" />
      <button type="button" class="remove-set">✕</button>
    `;
    if (entry) {
      row.querySelector(".entry-distance").value = entry.distance ?? "";
      row.querySelector(".entry-time").value = entry.time ?? "";
    }
  } else if (type === "swim") {
    row.innerHTML = `
      <input type="text" class="entry-style" placeholder="Styl (např. kraul)" autocomplete="off" />
      <input type="number" inputmode="decimal" class="entry-distance" placeholder="Vzdálenost (m)" min="0" step="1" />
      <button type="button" class="remove-set">✕</button>
    `;
    if (entry) {
      row.querySelector(".entry-style").value = entry.style ?? "";
      row.querySelector(".entry-distance").value = entry.distance ?? "";
    }
  } else if (type === "duration") {
    row.innerHTML = `
      <input type="number" inputmode="numeric" class="entry-duration" placeholder="Doba trvání (sekundy)" min="0" step="1" />
      <button type="button" class="remove-set">✕</button>
    `;
    if (entry) row.querySelector(".entry-duration").value = entry.duration ?? "";
  } else {
    row.innerHTML = `
      <input type="number" inputmode="numeric" class="entry-reps" placeholder="Počet opakování" min="0" step="1" />
      <button type="button" class="remove-set">✕</button>
    `;
    if (entry) row.querySelector(".entry-reps").value = entry.reps ?? "";
  }

  row.querySelector(".remove-set").addEventListener("click", () => {
    const container = row.parentElement;
    if (container.children.length > 1) row.remove();
  });
  return row;
}

function renderExerciseEntries(block, entries = [null]) {
  const container = block.querySelector(".entries-container");
  const type = block.querySelector(".ex-type").value;
  container.innerHTML = "";
  (entries.length ? entries : [null]).forEach((entry) => {
    container.appendChild(createEntryRow(type, entry));
  });
}

function exerciseCategory(exercise, requestedCategory = null) {
  if (requestedCategory) return requestedCategory;
  if (exercise?.type === "swim") return "swim";
  if (
    exercise?.type === "distance-time" &&
    ["běh", "kolo"].includes(exerciseKey(exercise.name))
  ) {
    return "cardio";
  }
  if (["reps", "duration"].includes(exercise?.type)) return "exercise";
  return "legacy";
}

function createExerciseBlock(exercise = null, forcedType = null, requestedCategory = null) {
  const wrap = document.createElement("div");
  wrap.className = "exercise-block";
  wrap.dataset.forcedType = forcedType || "";
  wrap.dataset.category = exerciseCategory(exercise, requestedCategory);
  wrap.innerHTML = `
    <div class="ex-header">
      <span class="exercise-name-control"></span>
      <button type="button" class="btn ghost small remove-exercise">✕</button>
    </div>
    <div class="exercise-type-row"></div>
    <div class="entries-container"></div>
    <button type="button" class="btn ghost small add-entry">+ Přidat výkon</button>
  `;

  const nameControl = wrap.querySelector(".exercise-name-control");
  let nameInput;
  if (wrap.dataset.category === "cardio") {
    nameInput = document.createElement("select");
    nameInput.className = "ex-name";
    ["Běh", "Kolo"].forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      nameInput.appendChild(option);
    });
  } else {
    nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "ex-name";
    nameInput.placeholder = "Název cviku";
    nameInput.setAttribute("list", "exerciseNamesList");
    nameInput.autocomplete = "off";
  }
  nameControl.appendChild(nameInput);

  const initialType = forcedType || exercise?.type || getExerciseType(exercise?.name);
  const allowedTypes = wrap.dataset.category === "exercise"
    ? ["reps", "duration"]
    : [initialType];
  const typeSelect = createTypeSelect(initialType, allowedTypes);
  typeSelect.disabled =
    allowedTypes.length === 1 || Boolean(getFixedExerciseType(exercise?.name));
  const typeRow = wrap.querySelector(".exercise-type-row");
  typeRow.hidden = wrap.dataset.category !== "exercise";
  typeRow.appendChild(typeSelect);
  nameInput.value = wrap.dataset.category === "cardio"
    ? DEFAULT_EXERCISES[exerciseKey(exercise?.name)]?.name || "Běh"
    : exercise?.name || "";

  wrap.querySelector(".remove-exercise").addEventListener("click", () => wrap.remove());
  wrap.querySelector(".add-entry").addEventListener("click", () => {
    wrap.querySelector(".entries-container").appendChild(createEntryRow(typeSelect.value));
  });
  typeSelect.addEventListener("change", () => renderExerciseEntries(wrap));
  nameInput.addEventListener("input", () => {
    if (wrap.dataset.category !== "exercise") return;
    const fixedType = getFixedExerciseType(nameInput.value);
    typeSelect.disabled = Boolean(fixedType);
    if (fixedType && ["reps", "duration"].includes(fixedType) && fixedType !== typeSelect.value) {
      typeSelect.value = fixedType;
      renderExerciseEntries(wrap);
    }
  });

  renderExerciseEntries(wrap, exercise?.entries || [null]);
  return wrap;
}

function entryHasAnyValue(row) {
  return Array.from(row.querySelectorAll("input")).some((input) => input.value.trim() !== "");
}

function collectEntry(row, type) {
  if (type === "distance-time") {
    const distance = Number.parseFloat(row.querySelector(".entry-distance").value);
    const time = row.querySelector(".entry-time").value.trim();
    return Number.isFinite(distance) && distance >= 0 && time ? { distance, time } : null;
  }
  if (type === "swim") {
    const style = row.querySelector(".entry-style").value.trim();
    const distance = Number.parseFloat(row.querySelector(".entry-distance").value);
    return style && Number.isFinite(distance) && distance >= 0 ? { style, distance } : null;
  }
  if (type === "duration") {
    const duration = Number.parseInt(row.querySelector(".entry-duration").value, 10);
    return Number.isInteger(duration) && duration >= 0 ? { duration } : null;
  }

  const reps = Number.parseInt(row.querySelector(".entry-reps").value, 10);
  return Number.isInteger(reps) && reps >= 0 ? { reps } : null;
}

function collectSessionFromForm() {
  const exercises = [];
  let invalid = false;

  document.querySelectorAll("#exerciseList .exercise-block").forEach((block) => {
    const name = block.querySelector(".ex-name").value.trim();
    const selectedType = block.querySelector(".ex-type").value;
    const fixedType = getFixedExerciseType(name);
    if (
      block.dataset.category === "exercise" &&
      fixedType &&
      !["reps", "duration"].includes(fixedType)
    ) {
      invalid = true;
      return;
    }
    const type = block.dataset.category === "exercise"
      ? (
        fixedType && ["reps", "duration"].includes(fixedType)
          ? fixedType
          : selectedType
      )
      : block.dataset.forcedType || getExerciseType(name, selectedType);
    if (!name) {
      if (Array.from(block.querySelectorAll(".performance-row")).some(entryHasAnyValue)) invalid = true;
      return;
    }

    const entries = [];
    block.querySelectorAll(".performance-row").forEach((row) => {
      const entry = collectEntry(row, type);
      if (entry) entries.push(entry);
      else if (entryHasAnyValue(row)) invalid = true;
    });
    if (entries.length > 0) {
      const existing = exercises.find((exercise) => exerciseKey(exercise.name) === exerciseKey(name));
      if (existing && existing.type !== type) {
        invalid = true;
      } else if (existing) {
        existing.entries.push(...entries);
      } else {
        exercises.push({ name, type, entries });
      }
    }
  });

  return {
    date: document.getElementById("sessionDate").value || todayInputValue(),
    exercises,
    invalid,
  };
}

function resetForm() {
  editingSessionId = null;
  document.getElementById("calisthenicsFormTitle").textContent = "Nový trénink";
  document.getElementById("saveSessionBtn").textContent = "Uložit trénink";
  document.getElementById("cancelEditSessionBtn").style.display = "none";
  document.getElementById("sessionDate").value = todayInputValue();
  const list = document.getElementById("exerciseList");
  list.innerHTML = "";
}

function saveSession() {
  const session = collectSessionFromForm();
  if (session.invalid) {
    alert("Doplň prosím všechny údaje u rozepsaných výkonů.");
    return;
  }
  if (session.exercises.length === 0) {
    alert("Přidej aspoň jeden cvik s vyplněným výkonem.");
    return;
  }

  delete session.invalid;
  const sessions = getSessions();
  if (editingSessionId) {
    saveSessions(sessions.map((item) =>
      item.id === editingSessionId ? { ...item, ...session } : item
    ));
  } else {
    sessions.push({ id: Storage.uid(), ...session });
    saveSessions(sessions);
  }
  resetForm();
  renderAll();
}

function deleteSession(id) {
  if (!confirm("Opravdu smazat tento trénink?")) return;
  saveSessions(getSessions().filter((session) => session.id !== id));
  if (editingSessionId === id) resetForm();
  renderAll();
}

function editSession(id) {
  const session = getSessions().find((item) => item.id === id);
  if (!session) return;

  editingSessionId = id;
  document.getElementById("calisthenicsFormTitle").textContent = "Upravit trénink";
  document.getElementById("saveSessionBtn").textContent = "Uložit změny";
  document.getElementById("cancelEditSessionBtn").style.display = "block";
  document.getElementById("sessionDate").value = session.date || todayInputValue();

  const list = document.getElementById("exerciseList");
  list.innerHTML = "";
  session.exercises.forEach((exercise) => list.appendChild(createExerciseBlock(exercise)));
  if (session.exercises.length === 0) list.appendChild(createExerciseBlock());
  document.getElementById("calisthenicsFormTitle").scrollIntoView({ behavior: "smooth" });
}

function metricInfo(type) {
  if (type === "distance-time") {
    return { label: "nejdelší vzdálenost", unit: "km", chartLabel: "vzdálenost (km)" };
  }
  if (type === "swim") {
    return { label: "nejdelší vzdálenost", unit: "m", chartLabel: "vzdálenost (m)" };
  }
  if (type === "duration") {
    return { label: "nejdelší trvání", unit: "s", chartLabel: "doba trvání (s)" };
  }
  return { label: "maximum opakování", unit: "opak.", chartLabel: "počet opakování" };
}

function entryMetric(entry, type) {
  if (type === "reps") return entry.reps;
  if (type === "duration") return entry.duration;
  return entry.distance;
}

function exerciseSummary(exercise) {
  const info = metricInfo(exercise.type);
  const values = exercise.entries.map((entry) => entryMetric(entry, exercise.type));
  return `${exercise.name} (max ${Math.max(...values)} ${info.unit})`;
}

function entryDescription(entry, type) {
  if (type === "distance-time") return `${entry.distance} km · čas ${entry.time}`;
  if (type === "swim") return `${entry.style} · ${entry.distance} m`;
  if (type === "duration") return `${entry.duration} sekund`;
  return `${entry.reps} opakování`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSessionsList() {
  const sessions = getSessions().slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const container = document.getElementById("sessionsList");
  document.getElementById("sessionsEmptyHint").style.display = sessions.length === 0 ? "block" : "none";
  container.innerHTML = "";

  sessions.forEach((session) => {
    const item = document.createElement("div");
    item.className = "session-item";
    const summary = session.exercises.map(exerciseSummary).join(" • ");
    item.innerHTML = `
      <button class="session-toggle" type="button" aria-expanded="false">
        <span>
          <span class="session-date">${escapeHtml(formatDate(session.date))}</span>
          <span class="session-ex">${escapeHtml(summary)}</span>
        </span>
        <span class="session-chevron">⌄</span>
      </button>
      <div class="session-details" hidden></div>
      <div class="session-actions">
        <button class="btn ghost small edit-session">Upravit</button>
        <button class="btn ghost small del-session">Smazat</button>
      </div>
    `;

    const details = item.querySelector(".session-details");
    session.exercises.forEach((exercise) => {
      const exerciseElement = document.createElement("div");
      exerciseElement.className = "session-detail-exercise";
      const title = document.createElement("strong");
      title.textContent = exercise.name;
      exerciseElement.appendChild(title);

      const entries = document.createElement("div");
      entries.className = "session-detail-sets";
      exercise.entries.forEach((entry, index) => {
        const row = document.createElement("div");
        row.textContent = `${index + 1}. výkon: ${entryDescription(entry, exercise.type)}`;
        entries.appendChild(row);
      });
      exerciseElement.appendChild(entries);
      details.appendChild(exerciseElement);
    });

    const toggle = item.querySelector(".session-toggle");
    toggle.addEventListener("click", () => {
      const willOpen = details.hidden;
      details.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
      item.classList.toggle("expanded", willOpen);
    });
    item.querySelector(".edit-session").addEventListener("click", () => editSession(session.id));
    item.querySelector(".del-session").addEventListener("click", () => deleteSession(session.id));
    container.appendChild(item);
  });
}

function renderStats() {
  const sessions = getSessions();
  document.getElementById("statSessions").textContent = sessions.length;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  document.getElementById("statWeek").textContent =
    sessions.filter((session) => new Date(session.date) >= weekAgo).length;

  const names = new Set();
  sessions.forEach((session) => session.exercises.forEach((exercise) => names.add(exerciseKey(exercise.name))));
  document.getElementById("statExercises").textContent = names.size;
}

function getAllExerciseNames() {
  const names = new Map();
  Object.values(DEFAULT_EXERCISES).forEach((exercise) => names.set(exerciseKey(exercise.name), exercise.name));
  getSessions().forEach((session) => {
    session.exercises.forEach((exercise) => names.set(exerciseKey(exercise.name), exercise.name));
  });
  return Array.from(names.values()).sort((a, b) => a.localeCompare(b, "cs"));
}

function populateExerciseChoices() {
  const names = getAllExerciseNames();
  const datalist = document.getElementById("exerciseNamesList");
  datalist.innerHTML = "";
  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    datalist.appendChild(option);
  });

  const select = document.getElementById("progressExercise");
  const previous = select.value;
  select.innerHTML = "";
  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
  if (names.includes(previous)) select.value = previous;
}

function renderProgress() {
  const exerciseName = document.getElementById("progressExercise").value;
  const canvas = document.getElementById("progressChart");
  const emptyHint = document.getElementById("progressEmptyHint");
  const matching = getSessions()
    .map((session) => ({
      session,
      exercise: session.exercises.find((exercise) => exerciseKey(exercise.name) === exerciseKey(exerciseName)),
    }))
    .filter((item) => item.exercise)
    .sort((a, b) => (a.session.date > b.session.date ? 1 : -1));

  if (!exerciseName || matching.length === 0) {
    emptyHint.style.display = "block";
    canvas.style.display = "none";
    document.getElementById("bestValue").textContent = "–";
    document.getElementById("bestDate").textContent = "–";
    document.getElementById("bestValueLabel").textContent = "nejlepší výkon";
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  emptyHint.style.display = "none";
  canvas.style.display = "block";
  const type = matching[0].exercise.type;
  const info = metricInfo(type);
  const labels = [];
  const values = [];
  let bestValue = -Infinity;
  let bestDate = "";

  matching.forEach(({ session, exercise }) => {
    const value = Math.max(...exercise.entries.map((entry) => entryMetric(entry, exercise.type)));
    labels.push(formatDate(session.date));
    values.push(value);
    if (value > bestValue) {
      bestValue = value;
      bestDate = session.date;
    }
  });

  document.getElementById("bestValue").textContent = `${bestValue} ${info.unit}`;
  document.getElementById("bestDate").textContent = formatDate(bestDate);
  document.getElementById("bestValueLabel").textContent = info.label;

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: `${exerciseName} – ${info.chartLabel}`,
        data: values,
        borderColor: "#3ecf72",
        backgroundColor: "rgba(62,207,114,0.2)",
        tension: 0.25,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: "#3ecf72",
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#f2f2f5" } } },
      scales: {
        x: { ticks: { color: "#9a9ea8" }, grid: { color: "#2a2e38" } },
        y: { ticks: { color: "#9a9ea8" }, grid: { color: "#2a2e38" }, beginAtZero: true },
      },
    },
  });
}

function addExerciseByName(name = "", forcedType = null, category = null) {
  const blocks = Array.from(document.querySelectorAll("#exerciseList .exercise-block"));
  const existing = blocks
    .map((block) => block.querySelector(".ex-name"))
    .find((input) => name && exerciseKey(input.value) === exerciseKey(name));
  if (existing) {
    existing.focus();
    return;
  }

  const type = forcedType || getExerciseType(name);
  const exercise = name ? { name, type, entries: [] } : null;
  const block = createExerciseBlock(exercise, forcedType, category);
  document.getElementById("exerciseList").appendChild(block);
  block.querySelector(".ex-name").focus();
}

function renderAll() {
  renderStats();
  renderSessionsList();
  populateExerciseChoices();
  renderProgress();
}

document.addEventListener("DOMContentLoaded", () => {
  resetForm();
  document.querySelectorAll(".quick-exercise").forEach((button) => {
    button.addEventListener("click", () =>
      addExerciseByName(button.dataset.name, button.dataset.type, button.dataset.category)
    );
  });
  document.getElementById("saveSessionBtn").addEventListener("click", saveSession);
  document.getElementById("cancelEditSessionBtn").addEventListener("click", resetForm);
  document.getElementById("progressExercise").addEventListener("change", renderProgress);
  renderAll();
});
