// Export/import všech dat appky do jednoho JSON souboru (ruční záloha, žádné externí služby)

const WORKOUT_KEY_BACKUP = "gym_workouts";
const DIARY_KEY_BACKUP = "gym_diary";
const DUEL_KEY_BACKUP = "gym_duels";
const DUEL_ELO_START_KEY_BACKUP = "gym_duel_elo_start";
const GITHUB_OWNER = "ldospel-alt";
const GITHUB_REPO = "UltimateAPP";
const GITHUB_FOLDER = "obnova";

function buildBackupObject() {
  return {
    app: "gym-denik",
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts: Storage.read(WORKOUT_KEY_BACKUP, []),
    diary: Storage.read(DIARY_KEY_BACKUP, []),
    duels: Storage.read(DUEL_KEY_BACKUP, []),
    duelEloStart: Storage.read(DUEL_ELO_START_KEY_BACKUP, null),
  };
}

function exportBackup() {
  const data = buildBackupObject();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gym-denik-zaloha-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function showImportStatus(message, isError) {
  const el = document.getElementById("importStatus");
  el.textContent = message;
  el.style.color = isError ? "var(--red)" : "var(--green)";
}

function showGithubStatus(message, isError) {
  const el = document.getElementById("githubStatus");
  el.textContent = message;
  el.style.color = isError ? "var(--red)" : "var(--green)";
}

// Společná logika pro obnovení dat z rozparsovaného JSON objektu (použito jak
// pro import ze souboru z telefonu, tak pro obnovu ze souboru z GitHubu)
function restoreFromParsedData(data, statusFn) {
  if (!data || (data.app && data.app !== "gym-denik")) {
    statusFn("Tento soubor nevypadá jako záloha Gym Deníku.", true);
    return false;
  }

  const workouts = Array.isArray(data.workouts) ? data.workouts : [];
  const diary = Array.isArray(data.diary) ? data.diary : [];
  const duels = Array.isArray(data.duels) ? data.duels : [];
  const duelEloStart = typeof data.duelEloStart === "number" ? data.duelEloStart : null;

  if (!confirm(`Obnovit ${workouts.length} tréninků, ${diary.length} zápisků a ${duels.length} duelů? Přepíší se současná data v appce.`)) {
    return false;
  }

  Storage.write(WORKOUT_KEY_BACKUP, workouts);
  Storage.write(DIARY_KEY_BACKUP, diary);
  Storage.write(DUEL_KEY_BACKUP, duels);
  if (duelEloStart === null) {
    localStorage.removeItem(DUEL_ELO_START_KEY_BACKUP);
  } else {
    Storage.write(DUEL_ELO_START_KEY_BACKUP, duelEloStart);
  }

  statusFn("Hotovo! Data byla obnovena.", false);
  renderBackupCounts();
  return true;
}

function importBackup() {
  const fileInput = document.getElementById("importFile");
  const file = fileInput.files[0];

  if (!file) {
    showImportStatus("Nejdřív vyber soubor zálohy.", true);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      restoreFromParsedData(data, showImportStatus);
    } catch (e) {
      showImportStatus("Soubor se nepodařilo přečíst – není to platný JSON.", true);
    }
  };
  reader.readAsText(file);
}

// ---- Obnova ze složky "obnova" v GitHub repu (přes veřejné GitHub API, bez tokenu) ----

async function loadGithubBackupList() {
  const listEl = document.getElementById("githubBackupList");
  listEl.innerHTML = "";
  showGithubStatus("Načítám seznam souborů z GitHub...", false);

  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FOLDER}`;

  try {
    const res = await fetch(apiUrl, { cache: "no-store" });
    if (!res.ok) {
      showGithubStatus(`Složku "${GITHUB_FOLDER}" se nepodařilo načíst (${res.status}).`, true);
      return;
    }
    const items = await res.json();
    const jsonFiles = (Array.isArray(items) ? items : []).filter(
      (item) => item.type === "file" && item.name.toLowerCase().endsWith(".json")
    );

    if (jsonFiles.length === 0) {
      showGithubStatus(`Ve složce "${GITHUB_FOLDER}" zatím žádná .json záloha není.`, true);
      return;
    }

    showGithubStatus(`Nalezeno souborů: ${jsonFiles.length}. Vyber, který chceš obnovit.`, false);

    jsonFiles.forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "btn ghost block";
      btn.style.marginBottom = "8px";
      btn.textContent = `📄 ${item.name}`;
      btn.addEventListener("click", () => restoreFromGithubFile(item));
      listEl.appendChild(btn);
    });
  } catch (e) {
    showGithubStatus("Nepodařilo se spojit s GitHub API. Zkontroluj připojení k internetu.", true);
  }
}

async function restoreFromGithubFile(item) {
  showGithubStatus(`Stahuji ${item.name}...`, false);
  try {
    const res = await fetch(item.download_url, { cache: "no-store" });
    if (!res.ok) {
      showGithubStatus(`Soubor ${item.name} se nepodařilo stáhnout (${res.status}).`, true);
      return;
    }
    const data = await res.json();
    const ok = restoreFromParsedData(data, showGithubStatus);
    if (ok) {
      showGithubStatus(`Obnoveno ze souboru ${item.name}. Nezapomeň ho pak z GitHubu smazat.`, false);
    }
  } catch (e) {
    showGithubStatus(`Soubor ${item.name} nešlo zpracovat – není to platný JSON.`, true);
  }
}

function renderBackupCounts() {
  document.getElementById("backupWorkouts").textContent = Storage.read(WORKOUT_KEY_BACKUP, []).length;
  document.getElementById("backupDiary").textContent = Storage.read(DIARY_KEY_BACKUP, []).length;
  document.getElementById("backupDuels").textContent = Storage.read(DUEL_KEY_BACKUP, []).length;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("exportBtn").addEventListener("click", exportBackup);
  document.getElementById("importBtn").addEventListener("click", importBackup);
  document.getElementById("loadGithubBtn").addEventListener("click", loadGithubBackupList);
  renderBackupCounts();
});
