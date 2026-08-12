// Logika pro stránku Gym: přidávání tréninků, historie, progres grafy, maximální váhy

const WORKOUT_KEY = "gym_workouts";

let chartInstance = null;
let maxWeightChartInstance = null;
let editingSessionId = null;

function getWorkouts() {
  return Storage.read(WORKOUT_KEY, []);
}

function saveWorkouts(list) {
  Storage.write(WORKOUT_KEY, list);
}

// ---- Formulář na nový trénink ----

function createExerciseBlock(exercise = null) {
  const wrap = document.createElement("div");
  wrap.className = "exercise-block";
  wrap.innerHTML = `
    <div class="ex-header">
      <input type="text" class="ex-name" placeholder="Název cviku (např. Bench press)" list="exerciseNamesList" autocomplete="off" />
      <button type="button" class="btn ghost small remove-exercise">✕</button>
    </div>
    <div class="sets-container"></div>
    <button type="button" class="btn ghost small add-set">+ Přidat sérii</button>
  `;

  wrap.querySelector(".remove-exercise").addEventListener("click", () => wrap.remove());
  wrap.querySelector(".add-set").addEventListener("click", () => {
    wrap.querySelector(".sets-container").appendChild(createSetRow());
  });

  const setsContainer = wrap.querySelector(".sets-container");
  const sets = exercise?.sets?.length ? exercise.sets : [null];
  sets.forEach((set) => setsContainer.appendChild(createSetRow(set)));
  if (exercise) wrap.querySelector(".ex-name").value = exercise.name || "";
  return wrap;
}

function createSetRow(set = null) {
  const row = document.createElement("div");
  row.className = "set-row";
  row.innerHTML = `
    <input type="number" inputmode="numeric" class="set-reps" placeholder="Opakování" min="0" />
    <input type="number" inputmode="decimal" class="set-weight" placeholder="Váha (kg)" min="0" step="0.5" />
    <button type="button" class="remove-set">✕</button>
  `;
  row.querySelector(".remove-set").addEventListener("click", () => {
    const container = row.parentElement;
    if (container.children.length > 1) row.remove();
  });
  if (set) {
    row.querySelector(".set-reps").value = set.reps ?? "";
    row.querySelector(".set-weight").value = set.weight ?? "";
  }
  return row;
}

function collectSessionFromForm() {
  const dateInput = document.getElementById("sessionDate");
  const date = dateInput.value || todayInputValue();

  const exerciseBlocks = document.querySelectorAll("#exerciseList .exercise-block");
  const exercises = [];

  exerciseBlocks.forEach((block) => {
    const name = block.querySelector(".ex-name").value.trim();
    if (!name) return;

    const sets = [];
    block.querySelectorAll(".set-row").forEach((row) => {
      const reps = parseFloat(row.querySelector(".set-reps").value);
      const weight = parseFloat(row.querySelector(".set-weight").value);
      if (!isNaN(reps) || !isNaN(weight)) {
        sets.push({ reps: isNaN(reps) ? 0 : reps, weight: isNaN(weight) ? 0 : weight });
      }
    });

    if (sets.length > 0) exercises.push({ name, sets });
  });

  return { date, exercises };
}

function resetForm() {
  editingSessionId = null;
  document.getElementById("workoutFormTitle").textContent = "Nový trénink";
  document.getElementById("saveSessionBtn").textContent = "Uložit trénink";
  document.getElementById("cancelEditSessionBtn").style.display = "none";
  document.getElementById("sessionDate").value = todayInputValue();
  const list = document.getElementById("exerciseList");
  list.innerHTML = "";
  list.appendChild(createExerciseBlock());
}

function saveSession() {
  const session = collectSessionFromForm();
  if (session.exercises.length === 0) {
    alert("Přidej aspoň jeden cvik s vyplněnou sérií.");
    return;
  }
  const workouts = getWorkouts();
  if (editingSessionId) {
    saveWorkouts(workouts.map((workout) =>
      workout.id === editingSessionId ? { ...workout, ...session } : workout
    ));
  } else {
    workouts.push({ id: Storage.uid(), ...session });
    saveWorkouts(workouts);
  }
  resetForm();
  renderAll();
}

// ---- Historie tréninků ----

function deleteSession(id) {
  if (!confirm("Opravdu smazat tento trénink?")) return;
  const workouts = getWorkouts().filter((w) => w.id !== id);
  saveWorkouts(workouts);
  if (editingSessionId === id) resetForm();
  renderAll();
}

function editSession(id) {
  const session = getWorkouts().find((workout) => workout.id === id);
  if (!session) return;

  editingSessionId = id;
  document.getElementById("workoutFormTitle").textContent = "Upravit trénink";
  document.getElementById("saveSessionBtn").textContent = "Uložit změny";
  document.getElementById("cancelEditSessionBtn").style.display = "block";
  document.getElementById("sessionDate").value = session.date || todayInputValue();

  const list = document.getElementById("exerciseList");
  list.innerHTML = "";
  session.exercises.forEach((exercise) => list.appendChild(createExerciseBlock(exercise)));
  if (session.exercises.length === 0) list.appendChild(createExerciseBlock());

  document.getElementById("workoutFormTitle").scrollIntoView({ behavior: "smooth" });
}

function renderSessionsList() {
  const workouts = getWorkouts().slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const container = document.getElementById("sessionsList");
  const emptyHint = document.getElementById("sessionsEmptyHint");
  container.innerHTML = "";

  emptyHint.style.display = workouts.length === 0 ? "block" : "none";

  workouts.forEach((session) => {
    const item = document.createElement("div");
    item.className = "session-item";
    const exSummary = session.exercises
      .map((ex) => {
        const maxW = Math.max(...ex.sets.map((s) => s.weight));
        return `${ex.name} (max ${maxW} kg, ${ex.sets.length} sérií)`;
      })
      .join(" • ");
    item.innerHTML = `
      <button class="session-toggle" type="button" aria-expanded="false">
        <span>
          <span class="session-date">${formatDate(session.date)}</span>
          <span class="session-ex">${exSummary}</span>
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
      const exerciseEl = document.createElement("div");
      exerciseEl.className = "session-detail-exercise";

      const title = document.createElement("strong");
      title.textContent = exercise.name;
      exerciseEl.appendChild(title);

      const sets = document.createElement("div");
      sets.className = "session-detail-sets";
      exercise.sets.forEach((set, index) => {
        const row = document.createElement("div");
        row.textContent = `${index + 1}. série: ${set.reps} opakování × ${set.weight} kg`;
        sets.appendChild(row);
      });
      exerciseEl.appendChild(sets);
      details.appendChild(exerciseEl);
    });

    const toggle = item.querySelector(".session-toggle");
    toggle.addEventListener("click", () => {
      const willOpen = details.hidden;
      details.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
      item.classList.toggle("expanded", willOpen);
    });
    item.querySelector(".edit-session").addEventListener("click", () => editSession(session.id));
    item.querySelector(".del-session").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSession(session.id);
    });
    container.appendChild(item);
  });
}

// ---- Statistiky nahoře ----

function renderStats() {
  const workouts = getWorkouts();
  document.getElementById("statSessions").textContent = workouts.length;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = workouts.filter((w) => new Date(w.date) >= weekAgo).length;
  document.getElementById("statWeek").textContent = thisWeek;

  const exerciseNames = new Set();
  workouts.forEach((w) => w.exercises.forEach((ex) => exerciseNames.add(ex.name)));
  document.getElementById("statExercises").textContent = exerciseNames.size;
}

// ---- Progres / graf ----

function getAllExerciseNames() {
  const workouts = getWorkouts();
  const names = new Set();
  workouts.forEach((w) => w.exercises.forEach((ex) => names.add(ex.name)));
  return Array.from(names).sort((a, b) => a.localeCompare(b, "cs"));
}

function populateExerciseSelect() {
  const select = document.getElementById("progressExercise");
  const previous = select.value;
  const names = getAllExerciseNames();
  select.innerHTML = "";

  if (names.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "Zatím žádné cviky";
    select.appendChild(opt);
    return;
  }

  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });

  if (names.includes(previous)) select.value = previous;
}

function populateExerciseDatalist() {
  const datalist = document.getElementById("exerciseNamesList");
  const names = getAllExerciseNames();
  datalist.innerHTML = "";
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    datalist.appendChild(opt);
  });
}

function renderProgress() {
  const select = document.getElementById("progressExercise");
  const exerciseName = select.value;
  const emptyHint = document.getElementById("progressEmptyHint");
  const canvas = document.getElementById("progressChart");

  const workouts = getWorkouts()
    .filter((w) => w.exercises.some((ex) => ex.name === exerciseName))
    .sort((a, b) => (a.date > b.date ? 1 : -1));

  if (!exerciseName || workouts.length === 0) {
    emptyHint.style.display = "block";
    canvas.style.display = "none";
    const maxWeightCanvas = document.getElementById("maxWeightChart");
    maxWeightCanvas.style.display = "none";
    document.getElementById("totalVolumeValue").textContent = "–";
    document.getElementById("totalVolumeDate").textContent = "–";
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    if (maxWeightChartInstance) { maxWeightChartInstance.destroy(); maxWeightChartInstance = null; }
    return;
  }

  emptyHint.style.display = "none";
  canvas.style.display = "block";
  const maxWeightCanvas = document.getElementById("maxWeightChart");
  maxWeightCanvas.style.display = "block";

  const labels = [];
  const totalVolumeData = [];
  const maxWeightData = [];
  let maxVolume = -Infinity;
  let maxVolumeDate = "";

  workouts.forEach((w) => {
    const ex = w.exercises.find((e) => e.name === exerciseName);
    const totalVolume = ex.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
    const maxWeight = Math.max(...ex.sets.map((s) => s.weight));
    labels.push(formatDate(w.date));
    totalVolumeData.push(totalVolume);
    maxWeightData.push(maxWeight);
    if (totalVolume > maxVolume) {
      maxVolume = totalVolume;
      maxVolumeDate = w.date;
    }
  });

  document.getElementById("totalVolumeValue").textContent = `${Math.round(maxVolume)} kg`;
  document.getElementById("totalVolumeDate").textContent = formatDate(maxVolumeDate);

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${exerciseName} – celkem nazvedáno (kg)`,
          data: totalVolumeData,
          borderColor: "#8677e0",
          backgroundColor: "rgba(134,119,224,0.25)",
          tension: 0.25,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: "#8677e0",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#f2f2f5" } } },
      scales: {
        x: { ticks: { color: "#9a9ea8" }, grid: { color: "#2a2e38" } },
        y: { ticks: { color: "#9a9ea8" }, grid: { color: "#2a2e38" } },
      },
    },
  });

  if (maxWeightChartInstance) maxWeightChartInstance.destroy();
  maxWeightChartInstance = new Chart(maxWeightCanvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${exerciseName} – maximálka série (kg)`,
          data: maxWeightData,
          borderColor: "#3ecf72",
          backgroundColor: "rgba(62,207,114,0.2)",
          tension: 0.25,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: "#3ecf72",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#f2f2f5" } } },
      scales: {
        x: { ticks: { color: "#9a9ea8" }, grid: { color: "#2a2e38" } },
        y: { ticks: { color: "#9a9ea8" }, grid: { color: "#2a2e38" } },
      },
    },
  });
}

// ---- Init ----

function renderAll() {
  renderStats();
  renderSessionsList();
  populateExerciseSelect();
  populateExerciseDatalist();
  renderProgress();
}

document.addEventListener("DOMContentLoaded", () => {
  resetForm();
  document.getElementById("addExerciseBtn").addEventListener("click", () => {
    document.getElementById("exerciseList").appendChild(createExerciseBlock());
  });
  document.getElementById("saveSessionBtn").addEventListener("click", saveSession);
  document.getElementById("cancelEditSessionBtn").addEventListener("click", resetForm);
  document.getElementById("progressExercise").addEventListener("change", renderProgress);
  renderAll();
});
