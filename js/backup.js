// Export/import všech dat appky do jednoho JSON souboru (ruční záloha, žádné externí služby)

const WORKOUT_KEY_BACKUP = "gym_workouts";
const DIARY_KEY_BACKUP = "gym_diary";

function buildBackupObject() {
  return {
    app: "gym-denik",
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts: Storage.read(WORKOUT_KEY_BACKUP, []),
    diary: Storage.read(DIARY_KEY_BACKUP, []),
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

      if (!data || (data.app && data.app !== "gym-denik")) {
        showImportStatus("Tento soubor nevypadá jako záloha Gym Deníku.", true);
        return;
      }

      const workouts = Array.isArray(data.workouts) ? data.workouts : [];
      const diary = Array.isArray(data.diary) ? data.diary : [];

      if (!confirm(`Obnovit ${workouts.length} tréninků a ${diary.length} zápisků? Přepíší se současná data v appce.`)) {
        return;
      }

      Storage.write(WORKOUT_KEY_BACKUP, workouts);
      Storage.write(DIARY_KEY_BACKUP, diary);

      showImportStatus("Hotovo! Data byla obnovena.", false);
      renderBackupCounts();
    } catch (e) {
      showImportStatus("Soubor se nepodařilo přečíst – není to platný JSON.", true);
    }
  };
  reader.readAsText(file);
}

function renderBackupCounts() {
  document.getElementById("backupWorkouts").textContent = Storage.read(WORKOUT_KEY_BACKUP, []).length;
  document.getElementById("backupDiary").textContent = Storage.read(DIARY_KEY_BACKUP, []).length;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("exportBtn").addEventListener("click", exportBackup);
  document.getElementById("importBtn").addEventListener("click", importBackup);
  renderBackupCounts();
});
