const MILITARY_TEMPLATES_KEY = "gym_military_templates";
let militaryBlocks = [];
let activeWorkout = null;
let militaryAudioContext = null;

function formatSeconds(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function normalizeBlock(block) {
  const name = String(block?.name || "").trim();
  const exerciseSeconds = Math.max(0, Math.round(Number(block?.exerciseSeconds) || 0));
  const restSeconds = Math.max(0, Math.round(Number(block?.restSeconds) || 0));
  const extraRestSeconds = Math.max(0, Math.round(Number(block?.extraRestSeconds) || 0));
  const section = String(block?.section || "").trim();
  return { name, exerciseSeconds, restSeconds, extraRestSeconds, section };
}

function validBlocks(blocks) {
  return blocks.map(normalizeBlock).filter((block) => block.name && block.exerciseSeconds > 0);
}

function workoutSegments(blocks) {
  return validBlocks(blocks).flatMap((block, index) => {
    const segments = [{ type: "exercise", name: block.name, section: block.section, seconds: block.exerciseSeconds, blockIndex: index }];
    if (block.restSeconds > 0) {
      segments.push({ type: "rest", name: "Odpočinek", section: block.section, seconds: block.restSeconds, blockIndex: index });
    }
    if (block.extraRestSeconds > 0) {
      segments.push({ type: "rest", name: "Odpočinek bloku", section: block.section, seconds: block.extraRestSeconds, blockIndex: index });
    }
    return segments;
  });
}

function totalWorkoutSeconds(blocks) {
  return workoutSegments(blocks).reduce((sum, segment) => sum + segment.seconds, 0);
}

function createRoundPreset(rounds) {
  const exercises = ["Kliky", "Dřepy", "Plank", "Skákání", "Mountain climbers"];
  return Array.from({ length: rounds }, (_, round) =>
    exercises.map((name) => ({
      name,
      exerciseSeconds: 40,
      restSeconds: 20,
      section: `Kolo ${round + 1}/${rounds}`,
    }))
  ).flat();
}

function createThirtyMinutePreset() {
  const blockA = ["Kliky", "Dřepy", "Plank", "Výpady"];
  const blockB = ["Angličáky", "Mountain climbers", "Vysoká kolena", "Skokové dřepy"];
  const buildBlock = (names, label) => Array.from({ length: 2 }, (_, round) =>
    names.map((name, index) => ({
      name,
      exerciseSeconds: 45,
      restSeconds: 15,
      extraRestSeconds: index === names.length - 1 ? 60 : 0,
      section: `${label} ${round + 1}/2`,
    }))
  ).flat();
  const finisher = Array.from({ length: 20 }, (_, index) => ({
    name: index % 2 === 0 ? "Sprint na místě" : "Plank",
    exerciseSeconds: 30,
    restSeconds: 0,
    section: "Finisher",
  }));
  return [...buildBlock(blockA, "Blok A"), ...buildBlock(blockB, "Blok B"), ...finisher];
}

function presetBlocks(minutes) {
  if (minutes === 10) return createRoundPreset(2);
  if (minutes === 20) return createRoundPreset(4);
  if (minutes === 30) return createThirtyMinutePreset();
  return [];
}

function getTemplates() {
  const rawTemplates = Storage.read(MILITARY_TEMPLATES_KEY, []);
  return Array.isArray(rawTemplates)
    ? rawTemplates
      .filter((template) => template && typeof template.name === "string" && Array.isArray(template.blocks))
      .map((template) => ({ id: String(template.id || Storage.uid()), name: template.name.trim(), blocks: validBlocks(template.blocks) }))
      .filter((template) => template.name && template.blocks.length)
    : [];
}

function saveTemplates(templates) {
  Storage.write(MILITARY_TEMPLATES_KEY, templates);
}

function renderBuilder() {
  const list = document.getElementById("militaryExerciseList");
  list.innerHTML = "";
  militaryBlocks.forEach((block, index) => {
    const row = document.createElement("article");
    row.className = "military-block";
    row.innerHTML = `
      <div class="military-block-header">
        <strong>${index + 1}. interval</strong>
        <div>
          <button class="btn ghost small military-up" type="button" aria-label="Posunout interval nahoru">↑</button>
          <button class="btn ghost small military-down" type="button" aria-label="Posunout interval dolů">↓</button>
          <button class="btn ghost small military-remove" type="button" aria-label="Odstranit interval">✕</button>
        </div>
      </div>
      <div class="field"><label>Název cviku</label><input class="military-name" type="text" value="${escapeHtml(block.name)}" placeholder="Např. Kliky" /></div>
      <div class="military-time-fields">
        <div class="field"><label>Cvik (sek.)</label><input class="military-exercise-seconds" type="number" min="1" inputmode="numeric" value="${block.exerciseSeconds || ""}" /></div>
        <div class="field"><label>Pauza (sek.)</label><input class="military-rest-seconds" type="number" min="0" inputmode="numeric" value="${block.restSeconds || 0}" /></div>
      </div>
    `;
    row.querySelector(".military-name").addEventListener("input", (event) => { militaryBlocks[index].name = event.target.value; });
    row.querySelector(".military-exercise-seconds").addEventListener("input", (event) => { militaryBlocks[index].exerciseSeconds = Number(event.target.value); updateDuration(); });
    row.querySelector(".military-rest-seconds").addEventListener("input", (event) => { militaryBlocks[index].restSeconds = Number(event.target.value); updateDuration(); });
    row.querySelector(".military-remove").addEventListener("click", () => { militaryBlocks.splice(index, 1); renderBuilder(); });
    row.querySelector(".military-up").addEventListener("click", () => moveBlock(index, -1));
    row.querySelector(".military-down").addEventListener("click", () => moveBlock(index, 1));
    row.querySelector(".military-up").disabled = index === 0;
    row.querySelector(".military-down").disabled = index === militaryBlocks.length - 1;
    list.appendChild(row);
  });
  updateDuration();
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value || "";
  return element.innerHTML;
}

function moveBlock(index, direction) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= militaryBlocks.length) return;
  [militaryBlocks[index], militaryBlocks[nextIndex]] = [militaryBlocks[nextIndex], militaryBlocks[index]];
  renderBuilder();
}

function updateDuration() {
  document.getElementById("militaryDuration").textContent = `Celkem: ${formatSeconds(totalWorkoutSeconds(militaryBlocks))}`;
}

function renderTemplates() {
  const container = document.getElementById("militaryTemplates");
  const empty = document.getElementById("militaryTemplatesEmpty");
  const templates = getTemplates();
  container.innerHTML = "";
  empty.hidden = templates.length > 0;
  templates.forEach((template) => {
    const row = document.createElement("div");
    row.className = "military-template";
    const label = document.createElement("span");
    label.textContent = `${template.name} (${formatSeconds(totalWorkoutSeconds(template.blocks))})`;
    const load = document.createElement("button");
    load.className = "btn secondary small";
    load.type = "button";
    load.textContent = "Načíst";
    load.addEventListener("click", () => {
      militaryBlocks = template.blocks.map(normalizeBlock);
      document.getElementById("militaryTemplateName").value = template.name;
      renderBuilder();
    });
    const remove = document.createElement("button");
    remove.className = "btn ghost small";
    remove.type = "button";
    remove.textContent = "Smazat";
    remove.addEventListener("click", () => {
      saveTemplates(templates.filter((item) => item.id !== template.id));
      renderTemplates();
    });
    row.append(label, load, remove);
    container.appendChild(row);
  });
}

function saveCurrentTemplate() {
  const name = document.getElementById("militaryTemplateName").value.trim();
  const blocks = validBlocks(militaryBlocks);
  if (!name || !blocks.length) {
    alert("Zadej název a alespoň jeden interval s názvem a délkou cviku.");
    return;
  }
  const templates = getTemplates();
  const existing = templates.find((template) => template.name.toLocaleLowerCase("cs") === name.toLocaleLowerCase("cs"));
  const nextTemplate = { id: existing?.id || Storage.uid(), name, blocks };
  saveTemplates(existing ? templates.map((template) => template.id === existing.id ? nextTemplate : template) : [...templates, nextTemplate]);
  renderTemplates();
}

function beep() {
  try {
    if (!militaryAudioContext) militaryAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (militaryAudioContext.state === "suspended") militaryAudioContext.resume();
    const oscillator = militaryAudioContext.createOscillator();
    const gain = militaryAudioContext.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.07, militaryAudioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, militaryAudioContext.currentTime + 0.08);
    oscillator.connect(gain).connect(militaryAudioContext.destination);
    oscillator.start();
    oscillator.stop(militaryAudioContext.currentTime + 0.08);
  } catch {
    // Web Audio may be unavailable or blocked; the visual countdown remains usable.
  }
}

function updateActiveWorkout() {
  if (!activeWorkout) return;
  const segment = activeWorkout.segments[activeWorkout.index];
  const totalElapsed = activeWorkout.segments.slice(0, activeWorkout.index).reduce((sum, item) => sum + item.seconds, 0) + (segment.seconds - activeWorkout.remaining);
  document.getElementById("militaryActiveSection").textContent = segment.section;
  document.getElementById("militaryActiveType").textContent = segment.type === "exercise" ? "CVIK" : "PAUZA";
  document.getElementById("militaryActiveName").textContent = segment.name;
  document.getElementById("militaryCountdown").textContent = formatSeconds(activeWorkout.remaining);
  document.getElementById("militaryProgress").textContent = `Interval ${segment.blockIndex + 1}/${activeWorkout.blockCount} · ${formatSeconds(totalElapsed)}/${formatSeconds(activeWorkout.totalSeconds)}`;
  document.getElementById("militaryProgressBar").style.width = `${Math.min(100, (totalElapsed / activeWorkout.totalSeconds) * 100)}%`;
  document.getElementById("pauseMilitaryWorkoutBtn").textContent = activeWorkout.paused ? "Pokračovat" : "Pauza";
}

function finishWorkout() {
  clearInterval(activeWorkout?.timer);
  activeWorkout = null;
  document.getElementById("militaryActiveWorkout").hidden = true;
  if (document.fullscreenElement) document.exitFullscreen?.();
}

function advanceWorkout() {
  activeWorkout.index += 1;
  if (activeWorkout.index >= activeWorkout.segments.length) {
    finishWorkout();
    return;
  }
  activeWorkout.remaining = activeWorkout.segments[activeWorkout.index].seconds;
  updateActiveWorkout();
}

function workoutTick() {
  if (!activeWorkout || activeWorkout.paused) return;
  activeWorkout.remaining -= 1;
  if (activeWorkout.remaining > 0 && activeWorkout.remaining <= 5) beep();
  if (activeWorkout.remaining <= 0) advanceWorkout();
  else updateActiveWorkout();
}

function startWorkout() {
  const segments = workoutSegments(militaryBlocks);
  if (!segments.length) {
    alert("Přidej alespoň jeden interval s názvem a délkou cviku.");
    return;
  }
  beep();
  activeWorkout = {
    segments,
    blockCount: validBlocks(militaryBlocks).length,
    totalSeconds: totalWorkoutSeconds(militaryBlocks),
    index: 0,
    remaining: segments[0].seconds,
    paused: false,
    timer: null,
  };
  document.getElementById("militaryActiveWorkout").hidden = false;
  document.getElementById("militaryActiveWorkout").requestFullscreen?.().catch(() => {});
  updateActiveWorkout();
  activeWorkout.timer = setInterval(workoutTick, 1000);
}

document.addEventListener("DOMContentLoaded", () => {
  militaryBlocks = [{ name: "", exerciseSeconds: 30, restSeconds: 15, section: "" }];
  renderBuilder();
  renderTemplates();
  document.getElementById("addMilitaryExerciseBtn").addEventListener("click", () => { militaryBlocks.push({ name: "", exerciseSeconds: 30, restSeconds: 15, section: "" }); renderBuilder(); });
  document.querySelectorAll(".preset-btn").forEach((button) => button.addEventListener("click", () => { militaryBlocks = presetBlocks(Number(button.dataset.preset)); document.getElementById("militaryTemplateName").value = `${button.dataset.preset} min military`; renderBuilder(); }));
  document.getElementById("saveMilitaryTemplateBtn").addEventListener("click", saveCurrentTemplate);
  document.getElementById("startMilitaryWorkoutBtn").addEventListener("click", startWorkout);
  document.getElementById("pauseMilitaryWorkoutBtn").addEventListener("click", () => { activeWorkout.paused = !activeWorkout.paused; updateActiveWorkout(); });
  document.getElementById("skipMilitaryWorkoutBtn").addEventListener("click", advanceWorkout);
  document.getElementById("stopMilitaryWorkoutBtn").addEventListener("click", finishWorkout);
});
