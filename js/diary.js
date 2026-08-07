// Logika pro stránku Deníček: přidávání zápisků s hodnocením +/-/0 a jejich zobrazení

const DIARY_KEY = "gym_diary";

function getEntries() {
  return Storage.read(DIARY_KEY, []);
}

function saveEntries(list) {
  Storage.write(DIARY_KEY, list);
}

function ratingClass(rating) {
  if (rating === "+") return "plus";
  if (rating === "-") return "minus";
  return "zero";
}

function entryDateValue(entry) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.date || "")) return entry.date;

  const legacyDate = new Date(entry.date);
  if (isNaN(legacyDate)) return "";
  const year = legacyDate.getFullYear();
  const month = String(legacyDate.getMonth() + 1).padStart(2, "0");
  const day = String(legacyDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addEntry(rating) {
  const textarea = document.getElementById("diaryText");
  const dateInput = document.getElementById("diaryDate");
  const text = textarea.value.trim();
  const date = dateInput.value || todayInputValue();

  if (!text) {
    alert("Napiš prosím nějaký text zápisku.");
    return;
  }

  const entries = getEntries();
  entries.push({
    id: Storage.uid(),
    date,
    createdAt: new Date().toISOString(),
    text,
    rating,
  });
  saveEntries(entries);
  textarea.value = "";
  dateInput.value = todayInputValue();
  renderEntries();
}

function deleteEntry(id) {
  if (!confirm("Opravdu smazat tento zápisek?")) return;
  const entries = getEntries().filter((e) => e.id !== id);
  saveEntries(entries);
  renderEntries();
}

function renderEntries() {
  const entries = getEntries().slice().sort((a, b) => {
    const dateCompare = entryDateValue(b).localeCompare(entryDateValue(a));
    if (dateCompare !== 0) return dateCompare;
    return (b.createdAt || b.date || "").localeCompare(a.createdAt || a.date || "");
  });
  const container = document.getElementById("diaryList");
  const emptyHint = document.getElementById("diaryEmptyHint");
  container.innerHTML = "";

  emptyHint.style.display = entries.length === 0 ? "block" : "none";

  entries.forEach((entry) => {
    const el = document.createElement("div");
    el.className = "diary-entry";
    const cls = ratingClass(entry.rating);
    const symbol = entry.rating === "+" ? "+" : entry.rating === "-" ? "−" : "0";
    const dateValue = entryDateValue(entry);
    const d = new Date(`${dateValue}T12:00:00`);
    const dateStr = d.toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });

    el.innerHTML = `
      <div class="badge ${cls}">${symbol}</div>
      <div class="content">
        <div class="diary-date">${dateStr}</div>
        <div class="diary-text"></div>
      </div>
      <button class="diary-del">✕</button>
    `;
    el.querySelector(".diary-text").textContent = entry.text;
    el.querySelector(".diary-del").addEventListener("click", () => deleteEntry(entry.id));
    container.appendChild(el);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("diaryDate").value = todayInputValue();
  document.querySelectorAll(".rate-btn").forEach((btn) => {
    btn.addEventListener("click", () => addEntry(btn.dataset.rating));
  });
  renderEntries();
});
