// Logika pro stránku Deníček: přidávání zápisků s hodnocením +/-/0 a jejich zobrazení

const DIARY_KEY = "gym_diary";
let selectedSleep = 0;
let selectedStress = 0;
let hasBeer = false;
let hasSmoke = false;
let editingEntryId = null;

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

function validStarRating(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

function starText(value) {
  if (!validStarRating(value)) return "";
  return `${"★".repeat(value)}${"☆".repeat(5 - value)}`;
}

function updateStarButtons(containerId, value) {
  document.querySelectorAll(`#${containerId} .star-btn`).forEach((button) => {
    const selected = Number(button.dataset.value) <= value;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(Number(button.dataset.value) === value));
  });
}

function setStarRating(kind, value) {
  if (kind === "sleep") {
    selectedSleep = value;
    updateStarButtons("sleepRating", value);
  } else {
    selectedStress = value;
    updateStarButtons("stressRating", value);
  }
}

function createStarRating(containerId, kind) {
  const container = document.getElementById(containerId);
  for (let value = 1; value <= 5; value += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "star-btn";
    button.dataset.value = String(value);
    button.textContent = "★";
    button.setAttribute("aria-label", `${value} z 5`);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => setStarRating(kind, value));
    container.appendChild(button);
  }
}

function resetWellbeingRatings() {
  selectedSleep = 0;
  selectedStress = 0;
  updateStarButtons("sleepRating", 0);
  updateStarButtons("stressRating", 0);
}

function updateToggleBtnStyle() {
  const beerImg = document.getElementById("beerImg");
  const smokeImg = document.getElementById("smokeImg");
  
  if (beerImg) {
    beerImg.src = hasBeer ? "icons/beer-on.png" : "icons/beer-off.png";
  }
  
  if (smokeImg) {
    smokeImg.src = hasSmoke ? "icons/smoke-on.png" : "icons/smoke-off.png";
  }
}

function toggleBeer() {
  hasBeer = !hasBeer;
  updateToggleBtnStyle();
}

function toggleSmoke() {
  hasSmoke = !hasSmoke;
  updateToggleBtnStyle();
}

function resetForm() {
  editingEntryId = null;
  document.getElementById("diaryFormTitle").textContent = "Nový zápisek";
  document.getElementById("cancelEditDiaryBtn").style.display = "none";
  document.getElementById("diaryText").value = "";
  document.getElementById("diaryDate").value = todayInputValue();
  hasBeer = false;
  hasSmoke = false;
  resetWellbeingRatings();
  updateToggleBtnStyle();
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
  if (!validStarRating(selectedSleep) || !validStarRating(selectedStress)) {
    alert("Ohodnoť prosím spánek i stres pomocí 1–5 hvězdiček.");
    return;
  }

  const entries = getEntries();
  const entryData = {
    date,
    text,
    rating,
    sleepRating: selectedSleep,
    stressRating: selectedStress,
    hasBeer,
    hasSmoke,
  };

  if (editingEntryId) {
    saveEntries(entries.map((entry) =>
      entry.id === editingEntryId ? { ...entry, ...entryData } : entry
    ));
  } else {
    entries.push({
      id: Storage.uid(),
      createdAt: new Date().toISOString(),
      ...entryData,
    });
    saveEntries(entries);
  }

  resetForm();
  renderAll();
}

function deleteEntry(id) {
  if (!confirm("Opravdu smazat tento zápisek?")) return;
  const entries = getEntries().filter((e) => e.id !== id);
  saveEntries(entries);
  if (editingEntryId === id) resetForm();
  renderAll();
}

function editEntry(id) {
  const entry = getEntries().find((e) => e.id === id);
  if (!entry) return;

  editingEntryId = id;
  document.getElementById("diaryFormTitle").textContent = "Upravit zápisek";
  document.getElementById("cancelEditDiaryBtn").style.display = "block";
  document.getElementById("diaryDate").value = entryDateValue(entry) || todayInputValue();
  document.getElementById("diaryText").value = entry.text || "";
  
  hasBeer = entry.hasBeer || false;
  hasSmoke = entry.hasSmoke || false;
  
  if (validStarRating(entry.sleepRating)) {
    selectedSleep = entry.sleepRating;
    updateStarButtons("sleepRating", entry.sleepRating);
  }
  if (validStarRating(entry.stressRating)) {
    selectedStress = entry.stressRating;
    updateStarButtons("stressRating", entry.stressRating);
  }

  updateToggleBtnStyle();
  document.getElementById("diaryFormTitle").scrollIntoView({ behavior: "smooth" });
}

function latestEntryPerDay(entries) {
  const byDate = new Map();
  entries.forEach((entry) => {
    const date = entryDateValue(entry);
    if (!date) return;
    const current = byDate.get(date);
    const timestamp = entry.createdAt || entry.date || "";
    const currentTimestamp = current?.createdAt || current?.date || "";
    if (!current || timestamp >= currentTimestamp) byDate.set(date, entry);
  });
  return Array.from(byDate.values());
}

function classifyRating(value, positiveWhenHigh) {
  if (!validStarRating(value)) return null;
  if (value === 3) return "Neutral";
  const positive = positiveWhenHigh ? value >= 4 : value <= 2;
  return positive ? "Positive" : "Negative";
}

function renderStats() {
  const days = latestEntryPerDay(getEntries());
  const counts = {
    moodPositive: 0,
    moodNeutral: 0,
    moodNegative: 0,
    sleepPositive: 0,
    sleepNeutral: 0,
    sleepNegative: 0,
    stressPositive: 0,
    stressNeutral: 0,
    stressNegative: 0,
    cleanDays: 0,
    noBeerDays: 0,
    noSmokeDays: 0,
  };

  days.forEach((entry) => {
    if (entry.rating === "+") counts.moodPositive += 1;
    else if (entry.rating === "-") counts.moodNegative += 1;
    else counts.moodNeutral += 1;

    const sleepClass = classifyRating(entry.sleepRating, true);
    const stressClass = classifyRating(entry.stressRating, false);
    if (sleepClass) counts[`sleep${sleepClass}`] += 1;
    if (stressClass) counts[`stress${stressClass}`] += 1;

    if (!entry.hasBeer && !entry.hasSmoke) counts.cleanDays += 1;
    if (!entry.hasBeer) counts.noBeerDays += 1;
    if (!entry.hasSmoke) counts.noSmokeDays += 1;
  });

  Object.entries(counts).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
  
  updateStreaks();
  updateMonthlyStats();
}

function updateStreaks() {
  const entries = getEntries().slice().sort((a, b) => {
    return entryDateValue(b).localeCompare(entryDateValue(a));
  });
  
  let currentStreak = 0;
  let bestStreak = 0;
  
  for (const entry of entries) {
    if (!(entry.hasBeer || entry.hasSmoke)) {
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  
  const currentStreakEl = document.getElementById("currentStreak");
  const bestStreakEl = document.getElementById("bestStreak");
  if (currentStreakEl) currentStreakEl.textContent = currentStreak;
  if (bestStreakEl) bestStreakEl.textContent = bestStreak;
}

function updateMonthlyStats() {
  const entries = getEntries();
  const monthlyData = {};
  
  entries.forEach((entry) => {
    const date = entryDateValue(entry);
    if (!date) return;
    
    const [year, month] = date.split("-");
    const monthKey = `${year}-${month}`;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        beerDays: 0,
        noBeerDays: 0,
        smokeDays: 0,
        noSmokeDays: 0,
      };
    }
    
    if (entry.hasBeer) {
      monthlyData[monthKey].beerDays += 1;
    } else {
      monthlyData[monthKey].noBeerDays += 1;
    }
    
    if (entry.hasSmoke) {
      monthlyData[monthKey].smokeDays += 1;
    } else {
      monthlyData[monthKey].noSmokeDays += 1;
    }
  });
  
  const container = document.getElementById("monthlyStats");
  if (!container) return;
  
  const months = Object.keys(monthlyData).sort().reverse();
  if (months.length === 0) {
    container.innerHTML = "<p>Žádná data</p>";
    return;
  }
  
  let html = "<div style='display: grid; gap: 8px;'>";
  months.forEach((monthKey) => {
    const [year, month] = monthKey.split("-");
    const monthName = new Date(`${year}-${month}-01`).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
    const stats = monthlyData[monthKey];
    html += `
      <div style="padding: 8px; background: var(--bg-card); border-radius: 4px;">
        <div style="font-weight: bold; margin-bottom: 4px;">${monthName}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
          <div>🍺 Pivo: ${stats.beerDays}/${stats.beerDays + stats.noBeerDays}</div>
          <div>🌿 Kouření: ${stats.smokeDays}/${stats.smokeDays + stats.noSmokeDays}</div>
        </div>
      </div>
    `;
  });
  html += "</div>";
  container.innerHTML = html;
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
        <div class="diary-wellbeing"></div>
      </div>
      <button class="diary-del">✕</button>
      <button class="diary-edit">✎</button>
    `;
    el.querySelector(".diary-text").textContent = entry.text;
    const wellbeing = [];
    if (validStarRating(entry.sleepRating)) {
      wellbeing.push(`Spánek ${starText(entry.sleepRating)}`);
    }
    if (validStarRating(entry.stressRating)) {
      wellbeing.push(`Stres ${starText(entry.stressRating)}`);
    }
    if (entry.hasBeer) {
      wellbeing.push("🍺 Pivo");
    }
    if (entry.hasSmoke) {
      wellbeing.push("🌿 Kouření");
    }
    const wellbeingElement = el.querySelector(".diary-wellbeing");
    wellbeingElement.textContent = wellbeing.join(" · ");
    wellbeingElement.style.display = wellbeing.length > 0 ? "block" : "none";
    el.querySelector(".diary-del").addEventListener("click", () => deleteEntry(entry.id));
    el.querySelector(".diary-edit").addEventListener("click", () => editEntry(entry.id));
    container.appendChild(el);
  });
}

function renderAll() {
  renderStats();
  renderEntries();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("diaryDate").value = todayInputValue();
  createStarRating("sleepRating", "sleep");
  createStarRating("stressRating", "stress");
  document.querySelectorAll(".rate-btn").forEach((btn) => {
    btn.addEventListener("click", () => addEntry(btn.dataset.rating));
  });
  document.getElementById("hasBeerBtn").addEventListener("click", (e) => {
    e.preventDefault();
    toggleBeer();
  });
  document.getElementById("hasSmokeBtn").addEventListener("click", (e) => {
    e.preventDefault();
    toggleSmoke();
  });
  document.getElementById("cancelEditDiaryBtn").addEventListener("click", resetForm);
  
  // Modální okno pro rozšířené statistiky
  const modal = document.getElementById("advancedStatsModal");
  const openBtn = document.getElementById("openAdvancedStatsBtn");
  const closeBtn = document.getElementById("closeAdvancedStatsBtn");
  
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      modal.style.display = "flex";
    });
  }
  
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }
  
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.style.display = "none";
      }
    });
  }
  
  updateToggleBtnStyle();
  renderAll();
});
