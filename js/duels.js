// Logika pro stránku Duely: záznam soubojů (já vs. soupeř), statistiky a graf průběhu

const DUEL_KEY = "gym_duels";
const DUEL_ELO_START_KEY = "gym_duel_elo_start";
const DUEL_ELO_STARTS_KEY = "gym_duel_elo_starts";
const DUEL_WEAPONS = ["Blade", "Double-blade", "Staff"];
const LEAGUE_CSV_URL = "https://docs.google.com/spreadsheets/d/1QD5NBWdrUu2Q9LsAINGSaiSThkKZ8VMreDJK7Afvl24/export?format=csv&gid=77153702";
const LEAGUE_RANKING_CSV_URL = "https://docs.google.com/spreadsheets/d/1QD5NBWdrUu2Q9LsAINGSaiSThkKZ8VMreDJK7Afvl24/export?format=csv&gid=0";
let duelChartInstance = null;
let eloChartInstance = null;
let currentOpponentFilter = null;
let editingDuelId = null;

function getDuels() {
  return Storage.read(DUEL_KEY, []);
}

function saveDuels(list) {
  Storage.write(DUEL_KEY, list);
}

function getLeaguePlayer() {
  return getAppSettings().nickname;
}

function leagueDuelKey(player, matchId) {
  return `${player}\u0000${matchId}`;
}

function getLeagueDuelPlayer(duel) {
  if (!duel.sourceId?.startsWith("summer-league-")) return null;
  return duel.leaguePlayer || "Lisan al Kebab";
}

function getLeagueMatchId(duel) {
  if (duel.leagueMatchId) return String(duel.leagueMatchId);
  if (!duel.sourceId?.startsWith("summer-league-")) return null;

  const player = getLeagueDuelPlayer(duel);
  const scopedPrefix = `summer-league-${encodeURIComponent(player)}-`;
  if (duel.sourceId.startsWith(scopedPrefix)) {
    return duel.sourceId.slice(scopedPrefix.length);
  }
  return duel.sourceId.slice("summer-league-".length);
}

function getStoredLeagueDuelKey(duel) {
  const player = getLeagueDuelPlayer(duel);
  const matchId = getLeagueMatchId(duel);
  return player && matchId ? leagueDuelKey(player, matchId) : null;
}

function isEloDuelForCurrentPlayer(duel) {
  const player = getLeagueDuelPlayer(duel);
  return player === null || player === getLeaguePlayer();
}

function mergeImportedDuel(duel, importedDuel) {
  return {
    ...duel,
    sourceId: importedDuel.sourceId,
    leagueMatchId: importedDuel.leagueMatchId,
    leaguePlayer: importedDuel.leaguePlayer,
    eloDelta: importedDuel.eloDelta,
  };
}

function normalizeWeapon(value) {
  return DUEL_WEAPONS.includes(value) ? value : "Blade";
}

function migrateDuelWeapons() {
  const duels = getDuels();
  let changed = false;
  const migrated = duels.map((duel) => {
    const myWeapon = normalizeWeapon(duel.myWeapon);
    const oppWeapon = normalizeWeapon(duel.oppWeapon);
    if (duel.myWeapon !== myWeapon || duel.oppWeapon !== oppWeapon) changed = true;
    return { ...duel, myWeapon, oppWeapon };
  });
  if (changed) saveDuels(migrated);
}

function getEloStart() {
  const player = getLeaguePlayer();
  const starts = Storage.read(DUEL_ELO_STARTS_KEY, {});
  const playerValue = starts && typeof starts === "object" ? starts[player] : null;
  if (typeof playerValue === "number" && Number.isFinite(playerValue)) return playerValue;

  const value = Storage.read(DUEL_ELO_START_KEY, null);
  return player === "Lisan al Kebab" && typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function saveEloStart(value) {
  const starts = Storage.read(DUEL_ELO_STARTS_KEY, {});
  const next = starts && typeof starts === "object" && !Array.isArray(starts)
    ? { ...starts }
    : {};
  next[getLeaguePlayer()] = value;
  Storage.write(DUEL_ELO_STARTS_KEY, next);
}

function parseEloNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value || "")
    .replace(/\s|\u00a0/g, "")
    .replace(",", ".");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatElo(value, includeSign = false) {
  const sign = includeSign && value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function duelResult(duel) {
  if (duel.myScore > duel.oppScore) return "win";
  if (duel.myScore < duel.oppScore) return "loss";
  return "draw";
}

function resultLabel(result) {
  if (result === "win") return "Výhra";
  if (result === "loss") return "Prohra";
  return "Remíza";
}

function resultColor(result) {
  if (result === "win") return "var(--green)";
  if (result === "loss") return "var(--red)";
  return "var(--gray)";
}

function normalizeOpponentName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function showDuelResultMessage(result) {
  if (result === "win") {
    alert("Well done young padawan");
    return;
  }
  alert("Learn much more, you must");
}

// ---- Nový duel ----

function normalizeDuelDate(value) {
  const input = value.trim();
  let year;
  let month;
  let day;
  let match = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (match) {
    [, year, month, day] = match;
  } else {
    match = input.match(/^(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})$/);
    if (match) {
      [, day, month, year] = match;
    } else {
      match = input.match(/^(\d{2})(\d{2})(\d{4})$/);
      if (!match) return null;
      [, day, month, year] = match;
    }
  }

  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const date = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));

  if (
    date.getUTCFullYear() !== yearNumber ||
    date.getUTCMonth() !== monthNumber - 1 ||
    date.getUTCDate() !== dayNumber
  ) {
    return null;
  }

  return `${String(yearNumber).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
}

function formatDuelDateInput(value) {
  const date = normalizeDuelDate(value);
  if (!date) return value;
  const [year, month, day] = date.split("-");
  return `${Number(day)}. ${Number(month)}. ${year}`;
}

function saveDuel() {
  const dateInput = document.getElementById("duelDate");
  const opponentInput = document.getElementById("opponentName");
  const myScoreInput = document.getElementById("myScore");
  const oppScoreInput = document.getElementById("oppScore");
  const commentInput = document.getElementById("duelComment");
  const eloDeltaInput = document.getElementById("eloDelta");
  const myWeaponInput = document.getElementById("myWeapon");
  const oppWeaponInput = document.getElementById("oppWeapon");

  const enteredDate = dateInput.value.trim();
  const date = enteredDate ? normalizeDuelDate(enteredDate) : todayInputValue();
  const opponentName = normalizeOpponentName(opponentInput.value);
  const myScore = parseInt(myScoreInput.value, 10);
  const oppScore = parseInt(oppScoreInput.value, 10);
  const eloDelta = parseEloNumber(eloDeltaInput.value);
  const myWeapon = normalizeWeapon(myWeaponInput.value);
  const oppWeapon = normalizeWeapon(oppWeaponInput.value);

  if (!date) {
    alert("Zadej platné datum, například 10. 8. 2026, 10082026 nebo 2026-08-10.");
    dateInput.focus();
    return;
  }

  if (isNaN(myScore) || isNaN(oppScore)) {
    alert("Vyplň prosím obě skóre.");
    return;
  }

  if (!opponentName) {
    alert("Vyplň prosím jméno soupeře.");
    opponentInput.focus();
    return;
  }

  const duels = getDuels();
  const duelData = {
    date,
    opponentName,
    myScore,
    oppScore,
    myWeapon,
    oppWeapon,
    comment: commentInput.value.trim(),
    eloDelta,
  };

  if (editingDuelId) {
    saveDuels(duels.map((duel) =>
      duel.id === editingDuelId ? { ...duel, ...duelData } : duel
    ));
  } else {
    duels.push({ id: Storage.uid(), ...duelData });
    saveDuels(duels);
  }

  showDuelResultMessage(duelResult(duelData));
  resetDuelForm();
  renderAllDuels();
}

function resetDuelForm() {
  editingDuelId = null;
  document.getElementById("duelFormTitle").textContent = "Nový duel";
  document.getElementById("saveDuelBtn").textContent = "Uložit duel";
  document.getElementById("cancelEditDuelBtn").style.display = "none";
  const today = todayInputValue();
  document.getElementById("duelDate").value = formatDuelDateInput(today);
  document.getElementById("duelDatePicker").value = today;
  document.getElementById("opponentName").value = "";
  document.getElementById("myScore").value = "";
  document.getElementById("oppScore").value = "";
  document.getElementById("myWeapon").value = "Blade";
  document.getElementById("oppWeapon").value = "Blade";
  document.getElementById("duelComment").value = "";
  document.getElementById("eloDelta").value = "";
}

function editDuel(id) {
  const duel = getDuels().find((item) => item.id === id);
  if (!duel) return;

  editingDuelId = id;
  document.getElementById("duelFormTitle").textContent = "Upravit duel";
  document.getElementById("saveDuelBtn").textContent = "Uložit změny";
  document.getElementById("cancelEditDuelBtn").style.display = "block";
  const date = duel.date || todayInputValue();
  document.getElementById("duelDate").value = formatDuelDateInput(date);
  document.getElementById("duelDatePicker").value = date;
  document.getElementById("opponentName").value = duel.opponentName || "";
  document.getElementById("myScore").value = duel.myScore;
  document.getElementById("oppScore").value = duel.oppScore;
  document.getElementById("myWeapon").value = normalizeWeapon(duel.myWeapon);
  document.getElementById("oppWeapon").value = normalizeWeapon(duel.oppWeapon);
  document.getElementById("duelComment").value = duel.comment || "";
  document.getElementById("eloDelta").value =
    typeof duel.eloDelta === "number" ? duel.eloDelta : "";
  document.getElementById("duelFormTitle").scrollIntoView({ behavior: "smooth" });
}

function deleteDuel(id) {
  if (!confirm("Opravdu smazat tento duel?")) return;
  const duels = getDuels().filter((d) => d.id !== id);
  saveDuels(duels);
  renderAllDuels();
}

// ---- Import z veřejné Google tabulky ----

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function leagueDateToIso(value) {
  const match = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function leagueRowToDuel(row) {
  const leaguePlayer = getLeaguePlayer();
  const duelNumber = row[0]?.trim();
  const player1 = row[1]?.trim();
  const player2 = row[2]?.trim();
  const score1 = Number.parseInt(row[3], 10);
  const score2 = Number.parseInt(row[4], 10);
  const date = leagueDateToIso(row[9]?.trim() || "");
  const player1EloDelta = parseEloNumber(row[24]);

  if (
    !duelNumber ||
    !date ||
    !Number.isInteger(score1) ||
    !Number.isInteger(score2) ||
    (player1 !== leaguePlayer && player2 !== leaguePlayer)
  ) {
    return null;
  }

  const playerIsFirst = player1 === leaguePlayer;
  return {
    id: Storage.uid(),
    sourceId: `summer-league-${encodeURIComponent(leaguePlayer)}-${duelNumber}`,
    leagueMatchId: duelNumber,
    leaguePlayer,
    date,
    opponentName: playerIsFirst ? player2 : player1,
    myScore: playerIsFirst ? score1 : score2,
    oppScore: playerIsFirst ? score2 : score1,
    myWeapon: "Blade",
    oppWeapon: "Blade",
    comment: row[11]?.trim() || "",
    eloDelta: player1EloDelta === null
      ? null
      : playerIsFirst
        ? player1EloDelta
        : -player1EloDelta,
  };
}

function getRankingElo(rows) {
  const playerRow = rows.find((row) => row[0]?.trim() === getLeaguePlayer());
  return playerRow ? parseEloNumber(playerRow[2]) : null;
}

function showLeagueImportStatus(message, isError) {
  const status = document.getElementById("importLeagueStatus");
  status.textContent = message;
  status.style.color = isError ? "var(--red)" : "var(--green)";
}

async function importLeagueDuels() {
  const leaguePlayer = getLeaguePlayer();
  const button = document.getElementById("importLeagueBtn");
  button.disabled = true;
  showLeagueImportStatus("Načítám Google tabulku...", false);

  try {
    const [duelsResponse, rankingResponse] = await Promise.all([
      fetch(LEAGUE_CSV_URL, { cache: "no-store" }),
      fetch(LEAGUE_RANKING_CSV_URL, { cache: "no-store" }),
    ]);
    if (!duelsResponse.ok || !rankingResponse.ok) {
      throw new Error("Google tabulka vrátila chybu.");
    }

    const rows = parseCsv(await duelsResponse.text()).slice(1);
    const rankingRows = parseCsv(await rankingResponse.text()).slice(1);
    const imported = rows.map(leagueRowToDuel).filter(Boolean);
    const duels = getDuels();
    const importedByKey = new Map(imported.map((duel) => [
      leagueDuelKey(duel.leaguePlayer, duel.leagueMatchId),
      duel,
    ]));
    let updatedCount = 0;
    const updatedDuels = duels.map((duel) => {
      const storedKey = getStoredLeagueDuelKey(duel);
      const importedDuel = storedKey ? importedByKey.get(storedKey) : null;
      if (!importedDuel) return duel;
      importedByKey.delete(storedKey);
      if (duel.eloDelta !== importedDuel.eloDelta) updatedCount += 1;
      return mergeImportedDuel(duel, importedDuel);
    });
    const newDuels = Array.from(importedByKey.values());
    const rankingElo = getRankingElo(rankingRows);

    if (rankingElo === null) {
      throw new Error(`V žebříčku nebyl nalezen hráč ${leaguePlayer}.`);
    }

    if (
      newDuels.length > 0 &&
      !confirm(`Přidat ${newDuels.length} zápasů hráče ${leaguePlayer}?`)
    ) {
      showLeagueImportStatus("Import byl zrušen.", false);
      return;
    }

    const allDuels = [...updatedDuels, ...newDuels];
    const importedEloTotal = allDuels
      .filter((duel) =>
        getLeagueDuelPlayer(duel) === leaguePlayer
      )
      .reduce((sum, duel) => sum + (duel.eloDelta || 0), 0);
    saveEloStart(rankingElo - importedEloTotal);
    saveDuels(allDuels);
    currentOpponentFilter = null;
    renderAllDuels();
    showLeagueImportStatus(
      `Hotovo: ELO ${formatElo(rankingElo)}, přidáno ${newDuels.length} a aktualizováno ${updatedCount} zápasů.`,
      false
    );
  } catch (error) {
    console.error("Import duelů selhal", error);
    const message = error instanceof Error && error.message.startsWith("V žebříčku")
      ? error.message
      : "Tabulku se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.";
    showLeagueImportStatus(message, true);
  } finally {
    button.disabled = false;
  }
}

// ---- Statistiky ----

function renderDuelStats() {
  const duels = getDuels();
  const wins = duels.filter((d) => duelResult(d) === "win").length;
  const losses = duels.filter((d) => duelResult(d) === "loss").length;
  const total = duels.length;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const scoreDiff = duels.reduce((sum, d) => sum + (d.myScore - d.oppScore), 0);
  const eloStart = getEloStart();
  const eloDuels = duels.filter(isEloDuelForCurrentPlayer);
  const currentElo = eloStart === null
    ? null
    : eloStart + eloDuels.reduce((sum, duel) => sum + (duel.eloDelta || 0), 0);

  document.getElementById("statDuels").textContent = total;
  document.getElementById("statWins").textContent = wins;
  document.getElementById("statLosses").textContent = losses;
  document.getElementById("statWinRate").textContent = `${winRate} %`;

  const diffEl = document.getElementById("statScoreDiff");
  diffEl.textContent = scoreDiff > 0 ? `+${scoreDiff}` : `${scoreDiff}`;
  diffEl.style.color = scoreDiff > 0 ? "var(--green)" : scoreDiff < 0 ? "var(--red)" : "var(--accent-2)";
  document.getElementById("statElo").textContent = currentElo === null ? "–" : formatElo(currentElo);
}

// ---- Historie ----

function renderDuelsList() {
  const allDuels = getDuels();
  const duels = allDuels
    .filter((d) => !currentOpponentFilter || d.opponentName === currentOpponentFilter)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const container = document.getElementById("duelsList");
  const emptyHint = document.getElementById("duelsEmptyHint");
  const titleEl = document.getElementById("historyTitle");
  const clearBtn = document.getElementById("clearOpponentFilterBtn");

  titleEl.textContent = currentOpponentFilter ? `Historie proti: ${currentOpponentFilter}` : "Historie duelů";
  clearBtn.style.display = currentOpponentFilter ? "inline-block" : "none";

  container.innerHTML = "";
  emptyHint.style.display = duels.length === 0 ? "block" : "none";
  emptyHint.textContent = currentOpponentFilter
    ? "S tímto soupeřem zatím žádné duely."
    : "Zatím žádné duely. Přidej první nahoře ⬆️";

  duels.forEach((duel) => {
    const result = duelResult(duel);
    const item = document.createElement("div");
    item.className = "session-item";
    const opponentLabel = duel.opponentName ? ` vs. ${duel.opponentName}` : "";
    item.innerHTML = `
      <div class="session-date">${formatDate(duel.date)}${opponentLabel} — ${duel.myScore}:${duel.oppScore}
        <span style="color:${resultColor(result)}; font-weight:700;"> (${resultLabel(result)})</span>
      </div>
      <div class="duel-weapons"></div>
      ${duel.comment ? `<div class="session-ex"></div>` : ""}
      ${typeof duel.eloDelta === "number" ? `<div class="duel-elo"></div>` : ""}
      <div class="session-actions">
        <button class="btn ghost small edit-duel">Upravit</button>
        <button class="btn ghost small del-duel">Smazat</button>
      </div>
    `;
    item.querySelector(".duel-weapons").textContent =
      `Zbraně: ${normalizeWeapon(duel.myWeapon)} vs. ${normalizeWeapon(duel.oppWeapon)}`;
    item.querySelector(".duel-weapons").style.color = "var(--text-dim)";
    item.querySelector(".duel-weapons").style.fontSize = "13px";
    if (duel.comment) {
      item.querySelector(".session-ex").textContent = duel.comment;
    }
    if (typeof duel.eloDelta === "number") {
      const eloEl = item.querySelector(".duel-elo");
      eloEl.textContent = `ELO ${formatElo(duel.eloDelta, true)}`;
      eloEl.style.color = duel.eloDelta >= 0 ? "var(--green)" : "var(--red)";
      eloEl.style.fontSize = "13px";
      eloEl.style.marginTop = "4px";
    }
    item.querySelector(".edit-duel").addEventListener("click", () => editDuel(duel.id));
    item.querySelector(".del-duel").addEventListener("click", () => deleteDuel(duel.id));
    container.appendChild(item);
  });
}

// ---- Soupeři ----

function getAllOpponentNames() {
  const duels = getDuels();
  const names = new Set();
  duels.forEach((d) => {
    const name = normalizeOpponentName(d.opponentName || "");
    if (name) names.add(name);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, "cs"));
}

function populateOpponentDatalist() {
  const datalist = document.getElementById("opponentNamesList");
  datalist.innerHTML = "";
  getAllOpponentNames().forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    datalist.appendChild(opt);
  });
}

function renderOpponentsList() {
  const names = getAllOpponentNames();
  const container = document.getElementById("opponentsList");
  const emptyHint = document.getElementById("opponentsEmptyHint");
  container.innerHTML = "";

  emptyHint.style.display = names.length === 0 ? "block" : "none";

  const duels = getDuels();

  names.forEach((name) => {
    const vsDuels = duels.filter((d) => d.opponentName === name);
    const wins = vsDuels.filter((d) => duelResult(d) === "win").length;
    const losses = vsDuels.filter((d) => duelResult(d) === "loss").length;
    const draws = vsDuels.length - wins - losses;
    const diff = vsDuels.reduce((sum, d) => sum + (d.myScore - d.oppScore), 0);
    const diffText = diff > 0 ? `+${diff}` : `${diff}`;

    const item = document.createElement("button");
    item.className = "session-item";
    item.style.width = "100%";
    item.style.textAlign = "left";
    item.style.border = "none";
    item.style.cursor = "pointer";
    if (name === currentOpponentFilter) {
      item.style.outline = "2px solid var(--accent)";
    }
    item.innerHTML = `
      <div class="session-date">${name}</div>
      <div class="session-ex">${vsDuels.length} duelů • ${wins}V-${losses}P-${draws}R • skóre ${diffText}</div>
    `;
    item.addEventListener("click", () => {
      currentOpponentFilter = currentOpponentFilter === name ? null : name;
      renderOpponentsList();
      renderDuelsList();
    });
    container.appendChild(item);
  });
}

// ---- Graf průběhu ----

function renderDuelChart() {
  const duels = getDuels().slice().sort((a, b) => (a.date > b.date ? 1 : -1));
  const canvas = document.getElementById("duelChart");
  const emptyHint = document.getElementById("duelChartEmptyHint");

  if (duels.length === 0) {
    emptyHint.style.display = "block";
    canvas.style.display = "none";
    if (duelChartInstance) { duelChartInstance.destroy(); duelChartInstance = null; }
    return;
  }

  emptyHint.style.display = "none";
  canvas.style.display = "block";

  const labels = duels.map((d) => formatDate(d.date));
  const diffs = duels.map((d) => d.myScore - d.oppScore);
  const colors = duels.map((d) => {
    const result = duelResult(d);
    if (result === "win") return "#3ecf72";
    if (result === "loss") return "#e05a5a";
    return "#7d828c";
  });

  if (duelChartInstance) duelChartInstance.destroy();
  duelChartInstance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Rozdíl skóre (já − soupeř)",
          data: diffs,
          backgroundColor: colors,
          borderRadius: 6,
        },
      ],
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

function renderEloChart() {
  const eloStart = getEloStart();
  const duels = getDuels()
    .filter((duel) =>
      typeof duel.eloDelta === "number" && isEloDuelForCurrentPlayer(duel)
    )
    .slice()
    .sort((a, b) => (a.date > b.date ? 1 : -1));
  const canvas = document.getElementById("eloChart");
  const emptyHint = document.getElementById("eloChartEmptyHint");

  if (eloStart === null || duels.length === 0) {
    emptyHint.style.display = "block";
    canvas.style.display = "none";
    if (eloChartInstance) {
      eloChartInstance.destroy();
      eloChartInstance = null;
    }
    return;
  }

  emptyHint.style.display = "none";
  canvas.style.display = "block";

  let currentElo = eloStart;
  const labels = ["Start"];
  const values = [Number(currentElo.toFixed(2))];
  duels.forEach((duel) => {
    currentElo += duel.eloDelta;
    labels.push(formatDate(duel.date));
    values.push(Number(currentElo.toFixed(2)));
  });

  if (eloChartInstance) eloChartInstance.destroy();
  eloChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "ELO",
        data: values,
        borderColor: "#b13cff",
        backgroundColor: "rgba(177,60,255,0.18)",
        pointBackgroundColor: "#b13cff",
        fill: true,
        tension: 0.25,
      }],
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

function renderAllDuels() {
  renderDuelStats();
  populateOpponentDatalist();
  renderOpponentsList();
  renderDuelsList();
  renderDuelChart();
  renderEloChart();
}

document.addEventListener("DOMContentLoaded", () => {
  migrateDuelWeapons();
  resetDuelForm();
  document.getElementById("leaguePlayerName").textContent = getLeaguePlayer();
  const dateInput = document.getElementById("duelDate");
  const datePicker = document.getElementById("duelDatePicker");
  datePicker.addEventListener("change", () => {
    if (datePicker.value) dateInput.value = formatDuelDateInput(datePicker.value);
  });
  dateInput.addEventListener("input", () => {
    const date = normalizeDuelDate(dateInput.value);
    if (date) datePicker.value = date;
  });
  document.getElementById("saveDuelBtn").addEventListener("click", saveDuel);
  document.getElementById("cancelEditDuelBtn").addEventListener("click", resetDuelForm);
  document.getElementById("importLeagueBtn").addEventListener("click", importLeagueDuels);
  document.getElementById("clearOpponentFilterBtn").addEventListener("click", () => {
    currentOpponentFilter = null;
    renderOpponentsList();
    renderDuelsList();
  });
  renderAllDuels();
});
