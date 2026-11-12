const SABER_INDEX_URL = "data/saberacademy/index.xml";
const SABER_CALENDAR_SETTINGS_KEY = "gym_saberacademy_calendar";
const SABER_DAYS = {
  pondeli: "Pondělí",
  utery: "Úterý",
  streda1: "Středa 1",
  streda2: "Středa 2",
  ctvrtek1: "Čtvrtek 1",
  ctvrtek2: "Čtvrtek 2",
};

function parseSaberXml(text) {
  const documentXml = new DOMParser().parseFromString(text, "application/xml");
  return documentXml.querySelector("parsererror") ? null : documentXml;
}

async function fetchSaberXml(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return parseSaberXml(await response.text());
  } catch {
    return null;
  }
}

function currentSaberSeason(date = new Date()) {
  const firstYear = date.getFullYear() - (date.getMonth() < 8 ? 1 : 0);
  return `${firstYear}-${firstYear + 1}`;
}

function lessonDate(seasonId, monthDay) {
  if (!/^\d{4}-\d{4}$/.test(seasonId || "") || !/^\d{2}-\d{2}$/.test(monthDay || "")) return null;
  const [firstYear, secondYear] = seasonId.split("-").map(Number);
  const [month, day] = monthDay.split("-").map(Number);
  if (!Number.isInteger(firstYear) || !Number.isInteger(secondYear) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(month >= 9 ? firstYear : secondYear, month - 1, day, 12);
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function formatSaberDate(date) {
  return date ? date.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }) : "—";
}

function getCalendarSettings() {
  const raw = Storage.read(SABER_CALENDAR_SETTINGS_KEY, {});
  return raw && typeof raw === "object" ? raw : {};
}

function saveCalendarSettings(settings) {
  Storage.write(SABER_CALENDAR_SETTINGS_KEY, settings);
}

function populateSelect(select, items, selected) {
  select.replaceChildren();
  items.forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === selected;
    select.appendChild(option);
  });
}

function renderCalendarRows(season, lessons) {
  const rows = document.getElementById("saberCalendarRows");
  rows.replaceChildren();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let highlighted = null;
  const rendered = lessons.map((lesson) => ({ lesson, date: lessonDate(season, lesson.getAttribute("date")) }));
  const upcoming = rendered.find(({ date, lesson }) => date && !lesson.hasAttribute("holiday") && date >= today);
  rendered.forEach(({ lesson, date }) => {
    const row = document.createElement("tr");
    if (date && date < today) row.classList.add("saber-past");
    if (upcoming?.lesson === lesson) {
      row.classList.add("saber-next");
      highlighted = row;
    }
    const values = [
      lesson.getAttribute("n") || "—",
      lesson.hasAttribute("holiday") ? `${formatSaberDate(date)} · volno` : formatSaberDate(date),
      lesson.querySelector("feature")?.textContent?.trim() || "—",
      lesson.querySelector("path")?.textContent?.trim() || "—",
    ];
    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });
    rows.appendChild(row);
  });
  highlighted?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function loadCalendar() {
  const season = document.getElementById("saberSeason").value;
  const day = document.getElementById("saberDay").value;
  const status = document.getElementById("saberCalendarStatus");
  const xml = await fetchSaberXml(`data/saberacademy/calendar/${season}-${day}.xml`);
  const seasonNode = xml?.querySelector("season");
  const rows = document.getElementById("saberCalendarRows");
  if (!seasonNode) {
    rows.replaceChildren();
    status.textContent = "Zatím bez rozvrhu.";
    return;
  }
  status.textContent = "";
  renderCalendarRows(season, Array.from(seasonNode.querySelectorAll("lesson")));
}

document.addEventListener("DOMContentLoaded", async () => {
  const index = await fetchSaberXml(SABER_INDEX_URL);
  const seasons = Array.from(index?.querySelectorAll("season") || []).map((item) => ({
    id: item.getAttribute("id"),
    days: (item.getAttribute("days") || "").split(/\s+/).filter((day) => SABER_DAYS[day]),
  })).filter((item) => item.id);
  const settings = getCalendarSettings();
  const seasonId = seasons.some((season) => season.id === settings.season)
    ? settings.season
    : seasons.find((season) => season.id === currentSaberSeason())?.id || seasons.at(-1)?.id;
  const availableDays = seasons.find((season) => season.id === seasonId)?.days || [];
  const day = availableDays.includes(settings.day) ? settings.day : availableDays[0];
  populateSelect(document.getElementById("saberSeason"), seasons.map((season) => ({ value: season.id, label: season.id })), seasonId);
  populateSelect(document.getElementById("saberDay"), availableDays.map((value) => ({ value, label: SABER_DAYS[value] })), day);
  const update = async () => {
    const selectedSeason = document.getElementById("saberSeason").value;
    const selected = seasons.find((season) => season.id === selectedSeason);
    const currentDay = document.getElementById("saberDay").value;
    const selectedDay = selected?.days.includes(currentDay) ? currentDay : selected?.days[0];
    populateSelect(document.getElementById("saberDay"), (selected?.days || []).map((value) => ({ value, label: SABER_DAYS[value] })), selectedDay);
    saveCalendarSettings({ season: selectedSeason, day: selectedDay });
    await loadCalendar();
  };
  document.getElementById("saberSeason").addEventListener("change", update);
  document.getElementById("saberDay").addEventListener("change", () => {
    saveCalendarSettings({ season: document.getElementById("saberSeason").value, day: document.getElementById("saberDay").value });
    loadCalendar();
  });
  if (!seasonId || !day) {
    document.getElementById("saberCalendarStatus").textContent = "Zatím bez rozvrhu.";
    return;
  }
  await loadCalendar();
});
