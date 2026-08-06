// Logika pro stránku Duely: záznam soubojů (já vs. soupeř), statistiky a graf průběhu

const DUEL_KEY = "gym_duels";
const LEAGUE_PLAYER = "Lisan al Kebab";
const LEAGUE_CSV_URL = "https://docs.google.com/spreadsheets/d/1QD5NBWdrUu2Q9LsAINGSaiSThkKZ8VMreDJK7Afvl24/export?format=csv&gid=77153702";
let duelChartInstance = null;
let currentOpponentFilter = null;

function getDuels() {
  return Storage.read(DUEL_KEY, []);
}

function saveDuels(list) {
  Storage.write(DUEL_KEY, list);
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

// ---- Nový duel ----

function saveDuel() {
  const dateInput = document.getElementById("duelDate");
  const opponentInput = document.getElementById("opponentName");
  const myScoreInput = document.getElementById("myScore");
  const oppScoreInput = document.getElementById("oppScore");
  const commentInput = document.getElementById("duelComment");

  const date = dateInput.value || todayInputValue();
  const opponentName = opponentInput.value.trim();
  const myScore = parseInt(myScoreInput.value, 10);
  const oppScore = parseInt(oppScoreInput.value, 10);

  if (isNaN(myScore) || isNaN(oppScore)) {
    alert("Vyplň prosím obě skóre.");
    return;
  }

  const duels = getDuels();
  duels.push({
    id: Storage.uid(),
    date,
    opponentName,
    myScore,
    oppScore,
    comment: commentInput.value.trim(),
  });
  saveDuels(duels);

  dateInput.value = todayInputValue();
  opponentInput.value = "";
  myScoreInput.value = "";
  oppScoreInput.value = "";
  commentInput.value = "";

  renderAllDuels();
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
  const duelNumber = row[0]?.trim();
  const player1 = row[1]?.trim();
  const player2 = row[2]?.trim();
  const score1 = Number.parseInt(row[3], 10);
  const score2 = Number.parseInt(row[4], 10);
  const date = leagueDateToIso(row[9]?.trim() || "");

  if (
    !duelNumber ||
    !date ||
    !Number.isInteger(score1) ||
    !Number.isInteger(score2) ||
    (player1 !== LEAGUE_PLAYER && player2 !== LEAGUE_PLAYER)
  ) {
    return null;
  }

  const playerIsFirst = player1 === LEAGUE_PLAYER;
  return {
    id: Storage.uid(),
    sourceId: `summer-league-${duelNumber}`,
    date,
    opponentName: playerIsFirst ? player2 : player1,
    myScore: playerIsFirst ? score1 : score2,
    oppScore: playerIsFirst ? score2 : score1,
    comment: row[11]?.trim() || "",
  };
}

function showLeagueImportStatus(message, isError) {
  const status = document.getElementById("importLeagueStatus");
  status.textContent = message;
  status.style.color = isError ? "var(--red)" : "var(--green)";
}

async function importLeagueDuels() {
  const button = document.getElementById("importLeagueBtn");
  button.disabled = true;
  showLeagueImportStatus("Načítám Google tabulku...", false);

  try {
    const response = await fetch(LEAGUE_CSV_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Google tabulka vrátila chybu ${response.status}.`);
    }

    const rows = parseCsv(await response.text()).slice(1);
    const imported = rows.map(leagueRowToDuel).filter(Boolean);
    const duels = getDuels();
    const existingSourceIds = new Set(duels.map((duel) => duel.sourceId).filter(Boolean));
    const newDuels = imported.filter((duel) => !existingSourceIds.has(duel.sourceId));

    if (newDuels.length === 0) {
      showLeagueImportStatus(`Všech ${imported.length} zápasů už v appce je.`, false);
      return;
    }

    if (!confirm(`Přidat ${newDuels.length} zápasů hráče ${LEAGUE_PLAYER}?`)) {
      showLeagueImportStatus("Import byl zrušen.", false);
      return;
    }

    saveDuels([...duels, ...newDuels]);
    currentOpponentFilter = null;
    renderAllDuels();
    showLeagueImportStatus(`Hotovo: přidáno ${newDuels.length} zápasů.`, false);
  } catch (error) {
    console.error("Import duelů selhal", error);
    showLeagueImportStatus("Tabulku se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.", true);
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

  document.getElementById("statDuels").textContent = total;
  document.getElementById("statWins").textContent = wins;
  document.getElementById("statLosses").textContent = losses;
  document.getElementById("statWinRate").textContent = `${winRate} %`;

  const diffEl = document.getElementById("statScoreDiff");
  diffEl.textContent = scoreDiff > 0 ? `+${scoreDiff}` : `${scoreDiff}`;
  diffEl.style.color = scoreDiff > 0 ? "var(--green)" : scoreDiff < 0 ? "var(--red)" : "var(--accent-2)";
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
      ${duel.comment ? `<div class="session-ex"></div>` : ""}
      <div class="session-actions">
        <button class="btn ghost small del-duel">Smazat</button>
      </div>
    `;
    if (duel.comment) {
      item.querySelector(".session-ex").textContent = duel.comment;
    }
    item.querySelector(".del-duel").addEventListener("click", () => deleteDuel(duel.id));
    container.appendChild(item);
  });
}

// ---- Soupeři ----

function getAllOpponentNames() {
  const duels = getDuels();
  const names = new Set();
  duels.forEach((d) => {
    if (d.opponentName) names.add(d.opponentName);
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

// ---- Init ----

function renderAllDuels() {
  renderDuelStats();
  populateOpponentDatalist();
  renderOpponentsList();
  renderDuelsList();
  renderDuelChart();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("duelDate").value = todayInputValue();
  document.getElementById("saveDuelBtn").addEventListener("click", saveDuel);
  document.getElementById("importLeagueBtn").addEventListener("click", importLeagueDuels);
  document.getElementById("clearOpponentFilterBtn").addEventListener("click", () => {
    currentOpponentFilter = null;
    renderOpponentsList();
    renderDuelsList();
  });
  renderAllDuels();
});
