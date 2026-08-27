const WATER_RECORDS_KEY = "gym_habits_water";
const MAX_WATER_AMOUNT = 10000;

function normalizeWaterRecord(record, index = 0) {
  const date = typeof record?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.date)
    ? record.date
    : "";
  const amount = Number(record?.amount);
  if (!date || !Number.isInteger(amount) || amount < 1 || amount > MAX_WATER_AMOUNT) return null;
  return {
    id: typeof record.id === "string" && record.id ? record.id : `legacy-${date}-${amount}-${record?.timestamp || ""}-${index}`,
    date,
    amount,
    timestamp: typeof record.timestamp === "string" ? record.timestamp : "",
  };
}

function getWaterRecords() {
  const records = Storage.read(WATER_RECORDS_KEY, []);
  return Array.isArray(records) ? records.map(normalizeWaterRecord).filter(Boolean) : [];
}

function saveWaterRecords(records) {
  Storage.write(WATER_RECORDS_KEY, records);
}

function selectedWaterDate() {
  return document.getElementById("habitsDate").value || todayInputValue();
}

function formatWaterLiters(amount) {
  return `${(amount / 1000).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} l`;
}

function waterTotal(records, date) {
  return records
    .filter((record) => record.date === date)
    .reduce((total, record) => total + record.amount, 0);
}

function addWater(amount) {
  const parsedAmount = Number(amount);
  if (!Number.isInteger(parsedAmount) || parsedAmount < 1 || parsedAmount > MAX_WATER_AMOUNT) {
    alert(`Zadej celé množství vody od 1 do ${MAX_WATER_AMOUNT} ml.`);
    return false;
  }
  const records = getWaterRecords();
  records.push({ id: Storage.uid(), date: selectedWaterDate(), amount: parsedAmount, timestamp: new Date().toISOString() });
  saveWaterRecords(records);
  renderWaterTracker();
  return true;
}

function deleteWaterRecord(id) {
  saveWaterRecords(getWaterRecords().filter((record) => record.id !== id));
  renderWaterTracker();
}

function clearWaterDay() {
  const date = selectedWaterDate();
  const records = getWaterRecords();
  const count = records.filter((record) => record.date === date).length;
  if (!count || !confirm(`Opravdu vymazat ${count} záznamů vody pro tento den?`)) return;
  saveWaterRecords(records.filter((record) => record.date !== date));
  renderWaterTracker();
}

function renderWaterRecords(records, date) {
  const container = document.getElementById("waterRecords");
  const empty = document.getElementById("waterRecordsEmpty");
  const dailyRecords = records
    .filter((record) => record.date === date)
    .slice()
    .sort((first, second) => second.timestamp.localeCompare(first.timestamp));
  container.replaceChildren();
  empty.hidden = dailyRecords.length > 0;
  dailyRecords.forEach((record) => {
    const row = document.createElement("div");
    row.className = "habits-record";
    const label = document.createElement("span");
    label.textContent = `💧 ${record.amount} ml`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn ghost small";
    remove.textContent = "Smazat";
    remove.setAttribute("aria-label", `Smazat záznam ${record.amount} ml`);
    remove.addEventListener("click", () => deleteWaterRecord(record.id));
    row.append(label, remove);
    container.appendChild(row);
  });
}

function renderWaterHistory(records) {
  const container = document.getElementById("waterDailyHistory");
  const empty = document.getElementById("waterDailyHistoryEmpty");
  const totals = new Map();
  records.forEach((record) => totals.set(record.date, (totals.get(record.date) || 0) + record.amount));
  const days = Array.from(totals.entries()).sort(([first], [second]) => second.localeCompare(first)).slice(0, 7);
  container.replaceChildren();
  empty.hidden = days.length > 0;
  days.forEach(([date, total]) => {
    const row = document.createElement("div");
    row.className = "habits-record";
    const dateLabel = document.createElement("span");
    dateLabel.textContent = formatDate(date);
    const totalLabel = document.createElement("strong");
    totalLabel.textContent = `${total} ml (${formatWaterLiters(total)})`;
    row.append(dateLabel, totalLabel);
    container.appendChild(row);
  });
}

function renderWaterTracker() {
  const records = getWaterRecords();
  const date = selectedWaterDate();
  const total = waterTotal(records, date);
  document.getElementById("waterTotalMl").textContent = `${total} ml`;
  document.getElementById("waterTotalLiters").textContent = formatWaterLiters(total);
  renderWaterRecords(records, date);
  renderWaterHistory(records);
}

document.addEventListener("DOMContentLoaded", () => {
  const dateInput = document.getElementById("habitsDate");
  const customInput = document.getElementById("customWaterAmount");
  dateInput.value = todayInputValue();
  document.querySelectorAll(".water-preset").forEach((button) => {
    button.addEventListener("click", () => addWater(Number(button.dataset.amount)));
  });
  document.getElementById("addCustomWaterBtn").addEventListener("click", () => {
    if (addWater(customInput.value)) customInput.value = "";
  });
  customInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") document.getElementById("addCustomWaterBtn").click();
  });
  document.getElementById("clearWaterDayBtn").addEventListener("click", clearWaterDay);
  dateInput.addEventListener("change", renderWaterTracker);
  renderWaterTracker();
});
