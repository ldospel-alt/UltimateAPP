const TOURNAMENT_INDEX_URL = "data/saberacademy/index.xml";
const TOURNAMENT_LOCAL_KEY = "saberacademy_tournaments_local";
const TOURNAMENT_CACHE_KEY = "saberacademy_tournaments_cache";
const TOURNAMENT_COACH_CODE_KEY = "saberacademy_tournaments_coach_code";

let tournamentConfig = null;
let tournamentRecords = [];
let tournamentSource = "local";
let tournamentUnlocked = false;
let editingTournamentId = null;

function parseTournamentXml(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  return xml.querySelector("parsererror") ? null : xml;
}

async function fetchTournamentIndex() {
  try {
    const response = await fetch(TOURNAMENT_INDEX_URL);
    return response.ok ? parseTournamentXml(await response.text()) : null;
  } catch {
    return null;
  }
}

function currentTournamentSeason(date = new Date()) {
  return String(date.getFullYear() - (date.getMonth() < 8 ? 1 : 0));
}

function getLocalTournamentRecords() {
  const value = Storage.read(TOURNAMENT_LOCAL_KEY, []);
  return Array.isArray(value) ? value : [];
}

function saveLocalTournamentRecords(records) {
  Storage.write(TOURNAMENT_LOCAL_KEY, records);
}

function coachNickname() {
  return getAppSettings().nickname || "neznámý";
}

function selectedTournamentSeason() {
  return document.getElementById("tournamentSeason").value;
}

function selectedTournamentType() {
  return document.querySelector("[data-tournament-type].active")?.dataset.tournamentType || "championship";
}

function selectedTournamentDefinition() {
  return tournamentConfig?.seasons.find((season) => season.id === selectedTournamentSeason()) || null;
}

function canWriteTournaments() {
  return tournamentUnlocked && !selectedTournamentDefinition()?.readonly && tournamentSource !== "cache";
}

function recordMatchesSelection(record) {
  return record.season === selectedTournamentSeason() && record.type === selectedTournamentType();
}

function formatTournamentDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? new Date(`${date}T12:00:00`).toLocaleDateString("cs-CZ") : "—";
}

function tournamentStatus(message, error = false) {
  const element = document.getElementById("tournamentStatus");
  element.textContent = message;
  element.style.color = error ? "var(--red)" : "";
}

function buildTournamentConfig(xml) {
  const root = xml?.querySelector("tournaments");
  if (!root) return { backend: "", seasons: [] };
  return {
    backend: root.getAttribute("backend") || "",
    seasons: Array.from(root.querySelectorAll(":scope > season")).map((season) => ({
      id: season.getAttribute("id") || "",
      readonly: season.getAttribute("readonly") === "true",
      types: Array.from(season.querySelectorAll(":scope > type")).map((type) => ({
        id: type.getAttribute("id") || "",
        title: type.getAttribute("title") || type.getAttribute("id") || "",
        url: type.getAttribute("url") || "",
        gid: type.getAttribute("gid") || "",
      })),
    })).filter((season) => season.id),
  };
}

function cacheTournamentRecords(records) {
  Storage.write(TOURNAMENT_CACHE_KEY, records);
}

async function readBackendRecords() {
  const params = new URLSearchParams({ season: selectedTournamentSeason(), type: selectedTournamentType() });
  const response = await fetch(`${tournamentConfig.backend}?${params}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Server vrátil ${response.status}.`);
  const payload = await response.json();
  if (!Array.isArray(payload.records)) throw new Error("Server vrátil neplatná data.");
  return payload.records;
}

async function loadWritableTournament() {
  const notice = document.getElementById("tournamentBackendNotice");
  if (!tournamentConfig.backend) {
    tournamentSource = "local";
    tournamentRecords = getLocalTournamentRecords();
    notice.hidden = false;
    notice.textContent = "Sdílený server není nastaven – záznamy se ukládají jen v tomto zařízení.";
    return;
  }
  try {
    tournamentRecords = await readBackendRecords();
    cacheTournamentRecords(tournamentRecords);
    tournamentSource = "backend";
    notice.hidden = true;
  } catch {
    tournamentRecords = Storage.read(TOURNAMENT_CACHE_KEY, []);
    tournamentRecords = Array.isArray(tournamentRecords) ? tournamentRecords : [];
    tournamentSource = "cache";
    notice.hidden = false;
    notice.textContent = "Sdílený server není dostupný – zobrazuji poslední uložené výsledky. Zápis je offline vypnutý.";
  }
}

async function postTournament(action, record) {
  const response = await fetch(tournamentConfig.backend, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, code: sessionStorage.getItem(TOURNAMENT_COACH_CODE_KEY) || "", record }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Záznam se nepodařilo uložit.");
  tournamentRecords = Array.isArray(payload.records) ? payload.records : tournamentRecords;
  cacheTournamentRecords(tournamentRecords);
}

function updateTournamentForm() {
  const form = document.getElementById("tournamentFormCard");
  const unlock = document.getElementById("unlockTournamentBtn");
  form.hidden = !canWriteTournaments();
  unlock.hidden = selectedTournamentDefinition()?.readonly || tournamentSource === "cache";
  unlock.textContent = tournamentUnlocked ? "Zápis odemčen" : "Zapisovat (trenér)";
  unlock.disabled = tournamentUnlocked;
}

function populateTournamentNames() {
  const names = new Set();
  tournamentRecords.forEach((record) => {
    if (record.a) names.add(record.a);
    if (record.b) names.add(record.b);
  });
  const list = document.getElementById("tournamentNames");
  list.replaceChildren(...Array.from(names).sort((a, b) => a.localeCompare(b, "cs")).map((name) => {
    const option = document.createElement("option");
    option.value = name;
    return option;
  }));
}

function recordActions(record) {
  if (!canWriteTournaments() || record.author !== coachNickname()) return null;
  const actions = document.createElement("div");
  actions.className = "saber-tournament-actions";
  const edit = document.createElement("button");
  edit.className = "btn ghost small";
  edit.textContent = "Upravit";
  edit.addEventListener("click", () => editTournament(record.id));
  const remove = document.createElement("button");
  remove.className = "btn ghost small";
  remove.textContent = "Smazat";
  remove.addEventListener("click", () => deleteTournament(record.id));
  actions.append(edit, remove);
  return actions;
}

function renderTournamentRecords() {
  const container = document.getElementById("tournamentResults");
  const matching = tournamentRecords.filter(recordMatchesSelection).sort((left, right) => String(right.date).localeCompare(String(left.date)));
  container.replaceChildren();
  document.getElementById("tournamentEmptyHint").hidden = matching.length > 0;
  matching.forEach((record) => {
    const item = document.createElement("article");
    item.className = "saber-tournament-record";
    const title = document.createElement("strong");
    title.textContent = `${record.a} × ${record.b}`;
    const details = document.createElement("p");
    details.textContent = `${formatTournamentDate(record.date)} · ${record.result}${record.costume ? " · Kostým" : ""}`;
    const meta = document.createElement("p");
    meta.className = "saberacademy-note";
    meta.textContent = `Zapsal: ${record.author || "neznámý"}${record.createdAt ? ` · ${new Date(record.createdAt).toLocaleString("cs-CZ")}` : ""}`;
    item.append(title, details);
    if (record.note) {
      const note = document.createElement("p");
      note.textContent = record.note;
      item.append(note);
    }
    item.append(meta);
    const actions = recordActions(record);
    if (actions) item.append(actions);
    container.append(item);
  });
  populateTournamentNames();
}

function resetTournamentForm() {
  editingTournamentId = null;
  document.getElementById("tournamentFormTitle").textContent = "Zapsat zápas";
  document.getElementById("saveTournamentBtn").textContent = "Uložit zápas";
  document.getElementById("cancelTournamentEditBtn").hidden = true;
  document.getElementById("tournamentDate").value = todayInputValue();
  document.getElementById("tournamentA").value = "";
  document.getElementById("tournamentB").value = "";
  document.getElementById("tournamentResult").value = "";
  document.getElementById("tournamentCostume").checked = false;
  document.getElementById("tournamentNote").value = "";
}

async function saveTournament() {
  if (!canWriteTournaments()) return;
  const record = {
    id: editingTournamentId || Storage.uid(),
    season: selectedTournamentSeason(),
    type: selectedTournamentType(),
    date: document.getElementById("tournamentDate").value,
    a: document.getElementById("tournamentA").value.trim(),
    b: document.getElementById("tournamentB").value.trim(),
    result: document.getElementById("tournamentResult").value.trim(),
    costume: document.getElementById("tournamentCostume").checked,
    note: document.getElementById("tournamentNote").value.trim(),
    author: coachNickname(),
  };
  if (!record.date || !record.a || !record.b || !record.result) {
    tournamentStatus("Vyplň datum, oba bojovníky a výsledek.", true);
    return;
  }
  try {
    if (tournamentSource === "local") {
      const records = getLocalTournamentRecords();
      const index = records.findIndex((item) => item.id === record.id);
      const next = { ...record, createdAt: index >= 0 ? records[index].createdAt : new Date().toISOString() };
      if (index >= 0) records[index] = next;
      else records.push(next);
      saveLocalTournamentRecords(records);
      tournamentRecords = records;
    } else {
      await postTournament(editingTournamentId ? "update" : "create", record);
    }
    tournamentStatus("Zápas uložen.");
    resetTournamentForm();
    renderTournamentRecords();
  } catch (error) {
    tournamentStatus(error.message, true);
  }
}

function editTournament(id) {
  const record = tournamentRecords.find((item) => item.id === id && item.author === coachNickname());
  if (!record || !canWriteTournaments()) return;
  editingTournamentId = id;
  document.getElementById("tournamentFormTitle").textContent = "Upravit zápas";
  document.getElementById("saveTournamentBtn").textContent = "Uložit změny";
  document.getElementById("cancelTournamentEditBtn").hidden = false;
  document.getElementById("tournamentDate").value = record.date || "";
  document.getElementById("tournamentA").value = record.a || "";
  document.getElementById("tournamentB").value = record.b || "";
  document.getElementById("tournamentResult").value = record.result || "";
  document.getElementById("tournamentCostume").checked = Boolean(record.costume);
  document.getElementById("tournamentNote").value = record.note || "";
  document.getElementById("tournamentFormCard").scrollIntoView({ behavior: "smooth" });
}

async function deleteTournament(id) {
  const record = tournamentRecords.find((item) => item.id === id && item.author === coachNickname());
  if (!record || !canWriteTournaments() || !confirm("Opravdu smazat tento zápas?")) return;
  try {
    if (tournamentSource === "local") {
      tournamentRecords = getLocalTournamentRecords().filter((item) => item.id !== id);
      saveLocalTournamentRecords(tournamentRecords);
    } else {
      await postTournament("delete", record);
    }
    renderTournamentRecords();
  } catch (error) {
    tournamentStatus(error.message, true);
  }
}

async function unlockTournament() {
  const code = prompt("Zadej trenérský kód:");
  if (code === null) return;
  if (code !== "SaberAdmin" && !tournamentConfig.backend) {
    tournamentStatus("Kód není správný.", true);
    return;
  }
  try {
    sessionStorage.setItem(TOURNAMENT_COACH_CODE_KEY, code);
    if (tournamentConfig.backend) await postTournament("validate", {});
    tournamentUnlocked = true;
    updateTournamentForm();
    renderTournamentRecords();
    tournamentStatus("Zápis je odemčen pro tuto relaci.");
  } catch (error) {
    sessionStorage.removeItem(TOURNAMENT_COACH_CODE_KEY);
    tournamentStatus(error.message || "Kód není správný.", true);
  }
}

async function renderTournamentPage() {
  const season = selectedTournamentDefinition();
  const type = season?.types.find((item) => item.id === selectedTournamentType());
  const readOnly = season?.readonly;
  document.getElementById("tournamentSheetCard").hidden = !readOnly;
  document.getElementById("tournamentResultsCard").hidden = Boolean(readOnly);
  document.getElementById("tournamentFormCard").hidden = true;
  if (readOnly) {
    const url = type?.url || "";
    document.getElementById("tournamentSheetTitle").textContent = `${season.id} – ${type?.title || "Výsledky"}`;
    document.getElementById("tournamentSheet").src = url;
    document.getElementById("tournamentSheetLink").href = url;
    tournamentStatus(url ? "Výsledky jsou pouze pro čtení." : "Tabulka pro tento typ zatím není nastavená.");
    return;
  }
  await loadWritableTournament();
  updateTournamentForm();
  renderTournamentRecords();
}

function populateTournamentControls() {
  const seasons = tournamentConfig.seasons;
  const select = document.getElementById("tournamentSeason");
  const defaultSeason = seasons.some((season) => season.id === currentTournamentSeason())
    ? currentTournamentSeason()
    : seasons.at(-1)?.id;
  select.replaceChildren(...seasons.map((season) => {
    const option = document.createElement("option");
    option.value = season.id;
    option.textContent = season.id;
    option.selected = season.id === defaultSeason;
    return option;
  }));
  const typeButtons = Array.from(document.querySelectorAll("[data-tournament-type]"));
  const updateTypes = () => {
    const season = selectedTournamentDefinition();
    const firstType = season?.types[0]?.id;
    if (!season?.types.some((type) => type.id === selectedTournamentType())) {
      typeButtons.forEach((button) => button.classList.toggle("active", button.dataset.tournamentType === firstType));
    }
    typeButtons.forEach((button) => {
      button.hidden = !season?.types.some((type) => type.id === button.dataset.tournamentType);
    });
  };
  typeButtons.forEach((button) => button.addEventListener("click", async () => {
    typeButtons.forEach((item) => item.classList.toggle("active", item === button));
    await renderTournamentPage();
  }));
  select.addEventListener("change", async () => {
    updateTypes();
    resetTournamentForm();
    await renderTournamentPage();
  });
  typeButtons[0]?.classList.add("active");
  updateTypes();
}

document.addEventListener("DOMContentLoaded", async () => {
  tournamentConfig = buildTournamentConfig(await fetchTournamentIndex());
  if (!tournamentConfig.seasons.length) {
    tournamentStatus("Konfigurace turnajů se nepodařila načíst.", true);
    return;
  }
  tournamentUnlocked = Boolean(sessionStorage.getItem(TOURNAMENT_COACH_CODE_KEY));
  populateTournamentControls();
  document.getElementById("unlockTournamentBtn").addEventListener("click", unlockTournament);
  document.getElementById("saveTournamentBtn").addEventListener("click", saveTournament);
  document.getElementById("cancelTournamentEditBtn").addEventListener("click", resetTournamentForm);
  resetTournamentForm();
  await renderTournamentPage();
});
