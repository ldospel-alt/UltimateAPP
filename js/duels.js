// Logika pro stránku Duely: záznam soubojů (já vs. soupeř), statistiky a graf průběhu

const DUEL_KEY = "gym_duels";
let duelChartInstance = null;

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
  const duels = getDuels().slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const container = document.getElementById("duelsList");
  const emptyHint = document.getElementById("duelsEmptyHint");
  container.innerHTML = "";

  emptyHint.style.display = duels.length === 0 ? "block" : "none";

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
  renderDuelsList();
  renderDuelChart();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("duelDate").value = todayInputValue();
  document.getElementById("saveDuelBtn").addEventListener("click", saveDuel);
  renderAllDuels();
});
