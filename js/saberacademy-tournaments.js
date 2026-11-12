const TOURNAMENT_INDEX_URL = "data/saberacademy/index.xml";
const TOURNAMENT_REPOSITORY = "ldospel-alt/UltimateAPP";
const TOURNAMENT_BRANCH = "main";
const TOURNAMENT_CACHE_KEY = "saberacademy_tournaments_cache";
const TOURNAMENT_TOKEN_KEY = "saberacademy_tournaments_github_token";
const TOURNAMENT_CODE_KEY = "saberacademy_tournaments_coach_unlocked";
const COACH_CODE_HASH = "ad6be8a78114780878b121b639396e562cd80bcbc3b99a9a265c6af3f969b391";
const MAX_COMPETITIVE_DUELS = 10;

let tournamentConfig = null;
let tournamentData = null;
let tournamentSha = null;
let tournamentReadOnly = false;
let tournamentUnlocked = false;
let editingTournamentId = null;

function tournamentPath(season = selectedSeason(), type = selectedType()) {
  return `data/saberacademy/tournaments/${season}-${type}.json`;
}

function rawTournamentUrl(path = tournamentPath()) {
  return `https://raw.githubusercontent.com/${TOURNAMENT_REPOSITORY}/${TOURNAMENT_BRANCH}/${path}`;
}

function contentsTournamentUrl(path = tournamentPath()) {
  return `https://api.github.com/repos/${TOURNAMENT_REPOSITORY}/contents/${path}`;
}

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

function selectedSeason() {
  return document.getElementById("tournamentSeason").value;
}

function selectedType() {
  return document.querySelector("[data-tournament-type].active")?.dataset.tournamentType || "championship";
}

function selectedDefinition() {
  return tournamentConfig?.seasons.find((season) => season.id === selectedSeason()) || null;
}

function isReadOnlyTournament() {
  return Boolean(selectedDefinition()?.readonly);
}

function getCoachName() {
  return getAppSettings().nickname || "neznámý";
}

function getToken() {
  return localStorage.getItem(TOURNAMENT_TOKEN_KEY) || "";
}

function setStatus(message, error = false) {
  const element = document.getElementById("tournamentStatus");
  element.textContent = message;
  element.style.color = error ? "var(--red)" : "";
}

function emptyTournamentData() {
  return { season: selectedSeason(), type: selectedType(), participants: [], duels: [], updatedAt: "" };
}

function normalizeTournamentData(value) {
  if (!value || typeof value !== "object") return emptyTournamentData();
  return {
    season: String(value.season || selectedSeason()),
    type: String(value.type || selectedType()),
    participants: Array.isArray(value.participants)
      ? value.participants.filter((participant) => participant?.name).map((participant) => ({ name: String(participant.name).trim(), costume: Boolean(participant.costume) }))
      : [],
    duels: Array.isArray(value.duels) ? value.duels.filter((duel) => duel?.id).map((duel) => ({ ...duel, costume: Boolean(duel.costume), secondHand: Boolean(duel.secondHand) })) : [],
    standings: Array.isArray(value.standings) ? value.standings : null,
    updatedAt: String(value.updatedAt || ""),
  };
}

function cacheKey(path = tournamentPath()) {
  return `${TOURNAMENT_CACHE_KEY}:${path}`;
}

function cacheTournamentData(data, path = tournamentPath()) {
  Storage.write(cacheKey(path), data);
}

function cachedTournamentData(path = tournamentPath()) {
  return Storage.read(cacheKey(path), null);
}

function byteBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeContent(value) {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function loadTournament(force = false) {
  const path = tournamentPath();
  tournamentSha = null;
  try {
    const suffix = force ? `?v=${Date.now()}` : "";
    tournamentData = normalizeTournamentData(await fetchJson(`${rawTournamentUrl(path)}${suffix}`));
    cacheTournamentData(tournamentData, path);
    tournamentReadOnly = false;
    setStatus("Výsledky jsou aktuální.");
  } catch (rawError) {
    try {
      tournamentData = normalizeTournamentData(await fetchJson(`${path}${force ? `?v=${Date.now()}` : ""}`));
      cacheTournamentData(tournamentData, path);
      tournamentReadOnly = false;
      setStatus("Výsledky načteny z aplikace.");
    } catch (pageError) {
      const cached = cachedTournamentData(path);
      if (cached) {
        tournamentData = normalizeTournamentData(cached);
        tournamentReadOnly = true;
        setStatus("Jsi offline nebo server není dostupný – zobrazuji poslední uložené výsledky. Zápis je vypnutý.", true);
      } else if (rawError.status === 404 || pageError.status === 404) {
        tournamentData = emptyTournamentData();
        tournamentReadOnly = false;
        setStatus(isReadOnlyTournament() ? "Data nejsou k dispozici." : "Turnaj ještě nezačal. Trenér jej může založit prvním zápisem nebo přidáním účastníka.");
      } else {
        tournamentData = emptyTournamentData();
        tournamentReadOnly = true;
        setStatus("Výsledky se nepodařilo načíst.", true);
      }
    }
  }
  renderTournament();
}

async function getRepositoryDocument(path) {
  const response = await fetch(contentsTournamentUrl(path), {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${getToken()}` },
  });
  if (response.status === 404) return { data: emptyTournamentData(), sha: null };
  if (!response.ok) throw new Error(`GitHub vrátil ${response.status}. Zkontroluj token a oprávnění Contents: write.`);
  const content = await response.json();
  return { data: normalizeTournamentData(JSON.parse(decodeContent(content.content))), sha: content.sha };
}

async function writeTournament(mutator, attempt = 0) {
  if (!tournamentUnlocked || tournamentReadOnly || isReadOnlyTournament()) throw new Error("Zápis není odemčen nebo nejsi online.");
  if (!getToken()) throw new Error("Nejdřív nastav GitHub token s oprávněním Contents: write.");
  const path = tournamentPath();
  const remote = await getRepositoryDocument(path);
  const next = normalizeTournamentData(mutator(remote.data));
  next.season = selectedSeason();
  next.type = selectedType();
  next.updatedAt = new Date().toISOString();
  const body = {
    message: `Tournament update by ${getCoachName()}`,
    content: byteBase64(`${JSON.stringify(next, null, 2)}\n`),
    branch: TOURNAMENT_BRANCH,
  };
  if (remote.sha) body.sha = remote.sha;
  const response = await fetch(contentsTournamentUrl(path), {
    method: "PUT",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 409 && attempt < 1) return writeTournament(mutator, attempt + 1);
  if (!response.ok) throw new Error(response.status === 409 ? "Soubor se změnil i při opakování. Stáhni čerstvá data a zkus zápis znovu." : `GitHub vrátil ${response.status}.`);
  tournamentData = next;
  tournamentSha = (await response.json()).content?.sha || null;
  cacheTournamentData(next, path);
  renderTournament();
}

function buildStandings(data) {
  if (Array.isArray(data.standings)) return sortStandings(data.standings.map((row) => ({ ...row })));
  const rows = new Map(data.participants.map((participant) => [participant.name, {
    name: participant.name, costume: Boolean(participant.costume), duels: 0, competitive: 0, given: 0, received: 0, wins: 0, difference: 0, winsOneZero: 0, winsSecondHand: 0, costumeDuels: 0, note: "",
  }]));
  data.duels.forEach((duel) => {
    const scoreA = Number(duel.scoreA);
    const scoreB = Number(duel.scoreB);
    if (!rows.has(duel.a) || !rows.has(duel.b) || !Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return;
    const a = rows.get(duel.a);
    const b = rows.get(duel.b);
    a.duels += 1; b.duels += 1;
    a.given += scoreA; a.received += scoreB;
    b.given += scoreB; b.received += scoreA;
    if (duel.costume) { a.costumeDuels += 1; b.costumeDuels += 1; }
    if (scoreA > scoreB) {
      a.wins += 1;
      if (scoreA === 1 && scoreB === 0) a.winsOneZero += 1;
      if (duel.secondHand) a.winsSecondHand += 1;
    } else if (scoreB > scoreA) {
      b.wins += 1;
      if (scoreB === 1 && scoreA === 0) b.winsOneZero += 1;
      if (duel.secondHand) b.winsSecondHand += 1;
    }
  });
  return sortStandings(Array.from(rows.values()).map((row) => ({ ...row, competitive: Math.min(row.duels, MAX_COMPETITIVE_DUELS), difference: row.given - row.received })));
}

function sortStandings(rows) {
  return rows.sort((a, b) => b.wins - a.wins || b.difference - a.difference || b.given - a.given || a.name.localeCompare(b.name, "cs"));
}

function renderStandings() {
  const rows = buildStandings(tournamentData);
  const table = document.getElementById("tournamentStandings");
  table.replaceChildren();
  document.getElementById("tournamentEmptyHint").hidden = rows.length > 0;
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    [row.name, row.costume ? "Ano" : "Ne", row.duels, row.competitive, row.given, row.received, row.wins, row.difference, row.winsOneZero, row.winsSecondHand, row.costumeDuels, row.note || "—"].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      tr.append(cell);
    });
    table.append(tr);
  });
}

function canWrite() {
  return tournamentUnlocked && !tournamentReadOnly && !isReadOnlyTournament() && Boolean(getToken());
}

function renderParticipants() {
  const container = document.getElementById("tournamentParticipants");
  container.replaceChildren();
  tournamentData.participants.forEach((participant) => {
    const row = document.createElement("div");
    row.className = "saber-tournament-participant";
    row.textContent = `${participant.name}${participant.costume ? " · Kostým" : ""}`;
    const remove = document.createElement("button");
    remove.className = "btn ghost small";
    remove.textContent = "Odstranit";
    remove.disabled = !canWrite();
    remove.addEventListener("click", () => removeParticipant(participant.name));
    row.append(remove);
    container.append(row);
  });
}

function populateParticipantSelects() {
  const names = tournamentData.participants.map((participant) => participant.name);
  ["tournamentA", "tournamentB"].forEach((id) => {
    const select = document.getElementById(id);
    const previous = select.value;
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Vyber účastníka";
    select.append(placeholder);
    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = name === previous;
      select.append(option);
    });
  });
}

function editOrDeleteButtons(duel) {
  if (!canWrite() || duel.author !== getCoachName()) return null;
  const actions = document.createElement("div");
  actions.className = "saber-tournament-actions";
  [["Upravit", () => editDuel(duel.id)], ["Smazat", () => deleteDuel(duel.id)]].forEach(([label, action]) => {
    const button = document.createElement("button");
    button.className = "btn ghost small";
    button.textContent = label;
    button.addEventListener("click", action);
    actions.append(button);
  });
  return actions;
}

function renderDuels() {
  const card = document.getElementById("tournamentResultsCard");
  const container = document.getElementById("tournamentResults");
  card.hidden = isReadOnlyTournament() || !tournamentData.duels.length;
  container.replaceChildren();
  tournamentData.duels.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).forEach((duel) => {
    const item = document.createElement("article");
    item.className = "saber-tournament-record";
    const heading = document.createElement("strong");
    heading.textContent = `${duel.a} ${duel.scoreA} : ${duel.scoreB} ${duel.b}`;
    const details = document.createElement("p");
    details.textContent = `${duel.date || "—"}${duel.costume ? " · Kostým" : ""}${duel.secondHand ? " · Výhra 2. rukou" : ""}`;
    const author = document.createElement("p");
    author.className = "saberacademy-note";
    author.textContent = `Zapsal: ${duel.author || "neznámý"}${duel.createdAt ? ` · ${new Date(duel.createdAt).toLocaleString("cs-CZ")}` : ""}`;
    item.append(heading, details);
    if (duel.note) { const note = document.createElement("p"); note.textContent = duel.note; item.append(note); }
    item.append(author);
    const actions = editOrDeleteButtons(duel);
    if (actions) item.append(actions);
    container.append(item);
  });
}

function renderTournament() {
  document.getElementById("tournamentUpdatedAt").textContent = tournamentData.updatedAt ? `Poslední aktualizace: ${new Date(tournamentData.updatedAt).toLocaleString("cs-CZ")}` : "";
  document.getElementById("unlockTournamentBtn").hidden = isReadOnlyTournament();
  document.getElementById("unlockTournamentBtn").disabled = tournamentUnlocked;
  document.getElementById("unlockTournamentBtn").textContent = tournamentUnlocked ? "Zápis odemčen" : "Zapisovat (trenér)";
  document.getElementById("tournamentCoachCard").hidden = !tournamentUnlocked || isReadOnlyTournament();
  document.getElementById("tournamentFormCard").hidden = !canWrite();
  renderStandings();
  renderDuels();
  renderParticipants();
  populateParticipantSelects();
}

function resetDuelForm() {
  editingTournamentId = null;
  document.getElementById("tournamentFormTitle").textContent = "Zapsat duel";
  document.getElementById("saveTournamentBtn").textContent = "Uložit duel";
  document.getElementById("cancelTournamentEditBtn").hidden = true;
  document.getElementById("tournamentDate").value = todayInputValue();
  document.getElementById("tournamentA").value = "";
  document.getElementById("tournamentB").value = "";
  document.getElementById("tournamentScoreA").value = "";
  document.getElementById("tournamentScoreB").value = "";
  document.getElementById("tournamentCostume").checked = false;
  document.getElementById("tournamentSecondHand").checked = false;
  document.getElementById("tournamentNote").value = "";
}

async function saveDuel() {
  const duel = {
    id: editingTournamentId || Storage.uid(),
    date: document.getElementById("tournamentDate").value,
    a: document.getElementById("tournamentA").value,
    b: document.getElementById("tournamentB").value,
    scoreA: Number(document.getElementById("tournamentScoreA").value),
    scoreB: Number(document.getElementById("tournamentScoreB").value),
    costume: document.getElementById("tournamentCostume").checked,
    secondHand: document.getElementById("tournamentSecondHand").checked,
    note: document.getElementById("tournamentNote").value.trim(),
    author: getCoachName(),
    createdAt: new Date().toISOString(),
  };
  if (!duel.date || !duel.a || !duel.b || duel.a === duel.b || !Number.isInteger(duel.scoreA) || duel.scoreA < 0 || !Number.isInteger(duel.scoreB) || duel.scoreB < 0) {
    setStatus("Vyber dva různé účastníky a vyplň platné skóre.", true);
    return;
  }
  try {
    await writeTournament((data) => {
      const index = data.duels.findIndex((item) => item.id === duel.id);
      if (index >= 0) duel.createdAt = data.duels[index].createdAt;
      if (index >= 0) data.duels[index] = duel;
      else data.duels.push(duel);
      return data;
    });
    resetDuelForm();
    setStatus("Duel uložen.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function editDuel(id) {
  const duel = tournamentData.duels.find((item) => item.id === id && item.author === getCoachName());
  if (!duel || !canWrite()) return;
  editingTournamentId = id;
  document.getElementById("tournamentFormTitle").textContent = "Upravit duel";
  document.getElementById("saveTournamentBtn").textContent = "Uložit změny";
  document.getElementById("cancelTournamentEditBtn").hidden = false;
  document.getElementById("tournamentDate").value = duel.date;
  document.getElementById("tournamentA").value = duel.a;
  document.getElementById("tournamentB").value = duel.b;
  document.getElementById("tournamentScoreA").value = duel.scoreA;
  document.getElementById("tournamentScoreB").value = duel.scoreB;
  document.getElementById("tournamentCostume").checked = duel.costume;
  document.getElementById("tournamentSecondHand").checked = duel.secondHand;
  document.getElementById("tournamentNote").value = duel.note || "";
}

async function deleteDuel(id) {
  const duel = tournamentData.duels.find((item) => item.id === id && item.author === getCoachName());
  if (!duel || !canWrite() || !confirm("Opravdu smazat duel?")) return;
  try {
    await writeTournament((data) => ({ ...data, duels: data.duels.filter((item) => item.id !== id) }));
    setStatus("Duel smazán.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function addParticipant() {
  const name = document.getElementById("participantName").value.trim();
  const costume = document.getElementById("participantCostume").checked;
  if (!name) return;
  try {
    await writeTournament((data) => {
      if (data.participants.some((participant) => participant.name.localeCompare(name, "cs", { sensitivity: "accent" }) === 0)) throw new Error("Účastník už existuje.");
      data.participants.push({ name, costume });
      return data;
    });
    document.getElementById("participantName").value = "";
    document.getElementById("participantCostume").checked = false;
    setStatus("Účastník přidán.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function removeParticipant(name) {
  if (!canWrite() || !confirm(`Odstranit ${name}?`)) return;
  try {
    await writeTournament((data) => {
      if (data.duels.some((duel) => duel.a === name || duel.b === name)) throw new Error("Účastníka nelze odstranit, protože má zapsaný duel.");
      data.participants = data.participants.filter((participant) => participant.name !== name);
      return data;
    });
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function unlockCoach() {
  const code = prompt("Zadej trenérský kód:");
  if (code === null) return;
  if (await sha256(code) !== COACH_CODE_HASH) {
    setStatus("Kód není správný.", true);
    return;
  }
  tournamentUnlocked = true;
  sessionStorage.setItem(TOURNAMENT_CODE_KEY, "1");
  renderTournament();
  setStatus("Zápis je odemčen pro tuto relaci. Pro skutečný zápis nastav GitHub token.");
}

function buildConfig(xml) {
  const root = xml?.querySelector("tournaments");
  return {
    seasons: Array.from(root?.querySelectorAll(":scope > season") || []).map((season) => ({
      id: season.getAttribute("id") || "",
      readonly: season.getAttribute("readonly") === "true",
      types: Array.from(season.querySelectorAll(":scope > type")).map((type) => ({ id: type.getAttribute("id") || "", title: type.getAttribute("title") || "" })),
    })).filter((season) => season.id),
  };
}

function configureControls() {
  const select = document.getElementById("tournamentSeason");
  const desired = currentTournamentSeason();
  select.replaceChildren(...tournamentConfig.seasons.map((season) => {
    const option = document.createElement("option");
    option.value = season.id; option.textContent = season.id; option.selected = season.id === (tournamentConfig.seasons.some((item) => item.id === desired) ? desired : tournamentConfig.seasons.at(-1).id);
    return option;
  }));
  const typeButtons = Array.from(document.querySelectorAll("[data-tournament-type]"));
  const updateTypes = () => {
    const types = selectedDefinition()?.types || [];
    if (!types.some((type) => type.id === selectedType())) typeButtons.forEach((button) => button.classList.toggle("active", button.dataset.tournamentType === types[0]?.id));
    typeButtons.forEach((button) => { button.hidden = !types.some((type) => type.id === button.dataset.tournamentType); });
  };
  typeButtons.forEach((button) => button.addEventListener("click", async () => {
    typeButtons.forEach((item) => item.classList.toggle("active", item === button));
    resetDuelForm();
    await loadTournament();
  }));
  select.addEventListener("change", async () => { updateTypes(); resetDuelForm(); await loadTournament(); });
  typeButtons[0].classList.add("active");
  updateTypes();
}

document.addEventListener("DOMContentLoaded", async () => {
  tournamentConfig = buildConfig(await fetchTournamentIndex());
  if (!tournamentConfig.seasons.length) { setStatus("Konfigurace turnajů se nepodařila načíst.", true); return; }
  tournamentUnlocked = sessionStorage.getItem(TOURNAMENT_CODE_KEY) === "1";
  configureControls();
  document.getElementById("refreshTournamentBtn").addEventListener("click", () => loadTournament(true));
  document.getElementById("unlockTournamentBtn").addEventListener("click", unlockCoach);
  document.getElementById("saveTournamentTokenBtn").addEventListener("click", () => {
    const token = document.getElementById("tournamentToken").value.trim();
    if (!token) { setStatus("Vlož GitHub token.", true); return; }
    localStorage.setItem(TOURNAMENT_TOKEN_KEY, token);
    document.getElementById("tournamentToken").value = "";
    renderTournament();
    setStatus("GitHub token uložen pouze v tomto zařízení.");
  });
  document.getElementById("removeTournamentTokenBtn").addEventListener("click", () => { localStorage.removeItem(TOURNAMENT_TOKEN_KEY); renderTournament(); });
  document.getElementById("addParticipantBtn").addEventListener("click", addParticipant);
  document.getElementById("saveTournamentBtn").addEventListener("click", saveDuel);
  document.getElementById("cancelTournamentEditBtn").addEventListener("click", resetDuelForm);
  resetDuelForm();
  await loadTournament();
});
