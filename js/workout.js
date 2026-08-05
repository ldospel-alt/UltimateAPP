// Logika pro stránku Cvičení: přidávání tréninků, historie, progres grafy, maximální váhy

const WORKOUT_KEY = "gym_workouts";

let chartInstance = null;

function getWorkouts() {
  return Storage.read(WORKOUT_KEY, []);
}

function saveWorkouts(list) {
  Storage.write(WORKOUT_KEY, list);
}

// ---- Formulář na nový trénink ----

function createExerciseBlock() {
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

  wrap.querySelector(".sets-container").appendChild(createSetRow());
  return wrap;
}

function createSetRow() {
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

  return { id: Storage.uid(), date, exercises };
}

function resetForm() {
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
  workouts.push(session);
  saveWorkouts(workouts);
  resetForm();
  renderAll();
}

// ---- Historie tréninků ----

function deleteSession(id) {
  if (!confirm("Opravdu smazat tento trénink?")) return;
  const workouts = getWorkouts().filter((w) => w.id !== id);
  saveWorkouts(workouts);
  renderAll();
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
      <div class="session-date">${formatDate(session.date)}</div>
      <div class="session-ex">${exSummary}</div>
      <div class="session-actions">
        <button class="btn ghost small del-session">Smazat</button>
      </div>
    `;
    item.querySelector(".del-session").addEventListener("click", () => deleteSession(session.id));
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
    document.getElementById("maxWeightValue").textContent = "–";
    document.getElementById("maxWeightDate").textContent = "–";
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  emptyHint.style.display = "none";
  canvas.style.display = "block";

  const labels = [];
  const data = [];
  let prWeight = -Infinity;
  let prDate = "";

  workouts.forEach((w) => {
    const ex = w.exercises.find((e) => e.name === exerciseName);
    const maxWeight = Math.max(...ex.sets.map((s) => s.weight));
    labels.push(formatDate(w.date));
    data.push(maxWeight);
    if (maxWeight > prWeight) {
      prWeight = maxWeight;
      prDate = w.date;
    }
  });

  document.getElementById("maxWeightValue").textContent = `${prWeight} kg`;
  document.getElementById("maxWeightDate").textContent = formatDate(prDate);

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${exerciseName} – max váha (kg)`,
          data,
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
  document.getElementById("progressExercise").addEventListener("change", renderProgress);
  renderAll();
});
