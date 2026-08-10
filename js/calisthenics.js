const CALISTHENICS_KEY = "gym_calisthenics";

const EXERCISE_TYPES = {
  reps: "Počet opakování",
  "distance-time": "Vzdálenost + čas",
  swim: "Styl + vzdálenost",
};

const DEFAULT_EXERCISES = {
  "běh": { name: "Běh", type: "distance-time" },
  "kliky": { name: "Kliky", type: "reps" },
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

function createTypeSelect(type) {
  const select = document.createElement("select");
  select.className = "ex-type";
  select.setAttribute("aria-label", "Typ měřených údajů");
  Object.entries(EXERCISE_TYPES).forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
  select.value = EXERCISE_TYPES[type] ? type : "reps";
  return select;
}

function createEntryRow(type, entry = null) {
  const row = document.createElement("div");
  row.className = "set-row performance-row";

  if (type === "distance-time") {
    row.innerHTML = `
      <input type="number" inputmode="decimal" class="entry-distance" placeholder="Vzdálenost (km)" min="0" step="0.01" />
      <input type="text" inputmode="numeric" class="entry-time" placeholder="Čas (např. 25:30)" />
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

function createExerciseBlock(exercise = null) {
  const wrap = document.createElement("div");
  wrap.className = "exercise-block";
  wrap.innerHTML = `
    <div class="ex-header">
      <input type="text" class="ex-name" placeholder="Název cviku" list="exerciseNamesList" autocomplete="off" />
      <button type="button" class="btn ghost small remove-exercise">✕</button>
    </div>
    <div class="exercise-type-row"></div>
    <div class="entries-container"></div>
    <button type="button" class="btn ghost small add-entry">+ Přidat výkon</button>
  `;

  const nameInput = wrap.querySelector(".ex-name");
  const initialType = exercise?.type || getExerciseType(exercise?.name);
  const typeSelect = createTypeSelect(initialType);
  typeSelect.disabled = Boolean(getFixedExerciseType(exercise?.name));
  wrap.querySelector(".exercise-type-row").appendChild(typeSelect);
  nameInput.value = exercise?.name || "";

  wrap.querySelector(".remove-exercise").addEventListener("click", () => wrap.remove());
  wrap.querySelector(".add-entry").addEventListener("click", () => {
    wrap.querySelector(".entries-container").appendChild(createEntryRow(typeSelect.value));
  });
  typeSelect.addEventListener("change", () => renderExerciseEntries(wrap));
  nameInput.addEventListener("input", () => {
    const fixedType = getFixedExerciseType(nameInput.value);
    typeSelect.disabled = Boolean(fixedType);
    if (fixedType && fixedType !== typeSelect.value) {
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

  const reps = Number.parseInt(row.querySelector(".entry-reps").value, 10);
  return Number.isInteger(reps) && reps >= 0 ? { reps } : null;
}

function collectSessionFromForm() {
  const exercises = [];
  let invalid = false;

  document.querySelectorAll("#exerciseList .exercise-block").forEach((block) => {
    const name = block.querySelector(".ex-name").value.trim();
    const type = getExerciseType(name, block.querySelector(".ex-type").value);
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
    if (entries.length > 0) exercises.push({ name, type, entries });
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
  list.appendChild(createExerciseBlock());
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
  return { label: "maximum opakování", unit: "opak.", chartLabel: "počet opakování" };
}

function entryMetric(entry, type) {
  return type === "reps" ? entry.reps : entry.distance;
}

function exerciseSummary(exercise) {
  const info = metricInfo(exercise.type);
  const values = exercise.entries.map((entry) => entryMetric(entry, exercise.type));
  return `${exercise.name} (max ${Math.max(...values)} ${info.unit})`;
}

function entryDescription(entry, type) {
  if (type === "distance-time") return `${entry.distance} km · čas ${entry.time}`;
  if (type === "swim") return `${entry.style} · ${entry.distance} m`;
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

function addExerciseByName(name = "") {
  const blocks = Array.from(document.querySelectorAll("#exerciseList .exercise-block"));
  const existing = blocks
    .map((block) => block.querySelector(".ex-name"))
    .find((input) => name && exerciseKey(input.value) === exerciseKey(name));
  if (existing) {
    existing.focus();
    return;
  }

  const emptyBlock = blocks.find((block) =>
    block.querySelector(".ex-name").value.trim() === "" &&
    !Array.from(block.querySelectorAll(".performance-row input")).some((input) => input.value.trim() !== "")
  );
  if (emptyBlock) {
    const nameInput = emptyBlock.querySelector(".ex-name");
    if (name) {
      nameInput.value = name;
      emptyBlock.querySelector(".ex-type").value = getExerciseType(name);
      emptyBlock.querySelector(".ex-type").disabled = Boolean(getFixedExerciseType(name));
      renderExerciseEntries(emptyBlock);
    }
    nameInput.focus();
    return;
  }

  const exercise = name ? { name, type: getExerciseType(name), entries: [] } : null;
  const block = createExerciseBlock(exercise);
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
    button.addEventListener("click", () => addExerciseByName(button.dataset.name));
  });
  document.getElementById("addExerciseBtn").addEventListener("click", () => addExerciseByName());
  document.getElementById("saveSessionBtn").addEventListener("click", saveSession);
  document.getElementById("cancelEditSessionBtn").addEventListener("click", resetForm);
  document.getElementById("progressExercise").addEventListener("change", renderProgress);
  renderAll();
});
