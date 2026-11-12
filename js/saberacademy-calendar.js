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

function startOfWeek(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function isInCurrentWeek(date, today = new Date()) {
  if (!date) return false;
  const start = startOfWeek(today);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return date >= start && date < end;
}

function parseTimeRange(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/.exec(time || "");
  return match ? match.slice(1).map(Number) : null;
}

function calendarDateStamp(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function googleCalendarUrl(lesson, season, time = "") {
  const date = lessonDate(season, lesson.date);
  if (!date) return "";
  const title = `SaberAcademy – hodina ${lesson.number}`;
  const details = [lesson.featureText, lesson.pathText && `Path of the knight: ${lesson.pathText}`].filter(Boolean).join("\n");
  const times = parseTimeRange(time);
  let dates;
  if (times) {
    const [startHour, startMinute, endHour, endMinute] = times;
    dates = `${calendarDateStamp(date)}T${String(startHour).padStart(2, "0")}${String(startMinute).padStart(2, "0")}00/${calendarDateStamp(date)}T${String(endHour).padStart(2, "0")}${String(endMinute).padStart(2, "0")}00`;
  } else {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    dates = `${calendarDateStamp(date)}/${calendarDateStamp(nextDay)}`;
  }
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${encodeURIComponent(dates)}&details=${encodeURIComponent(details)}`;
}

function escapeIcs(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function createIcs(lessons, season, day, time = "") {
  const times = parseTimeRange(time);
  const generatedAt = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events = lessons.filter((lesson) => lesson.number && lesson.date).map((lesson, index) => {
    const date = lessonDate(season, lesson.date);
    if (!date) return "";
    const stamp = calendarDateStamp(date);
    const title = `SaberAcademy – hodina ${lesson.number}`;
    const details = [lesson.featureText, lesson.pathText && `Path of the knight: ${lesson.pathText}`].filter(Boolean).join("\\n");
    const dates = times
      ? [`DTSTART:${stamp}T${String(times[0]).padStart(2, "0")}${String(times[1]).padStart(2, "0")}00`, `DTEND:${stamp}T${String(times[2]).padStart(2, "0")}${String(times[3]).padStart(2, "0")}00`]
      : (() => {
          const end = new Date(date);
          end.setDate(end.getDate() + 1);
          return [`DTSTART;VALUE=DATE:${stamp}`, `DTEND;VALUE=DATE:${calendarDateStamp(end)}`];
        })();
    return ["BEGIN:VEVENT", `UID:saberacademy-${season}-${day}-${lesson.date}-${index}@local`, `DTSTAMP:${generatedAt}`, `SUMMARY:${escapeIcs(title)}`, `DESCRIPTION:${escapeIcs(details)}`, ...dates, "END:VEVENT"].join("\r\n");
  }).filter(Boolean);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SaberAcademy//Calendar//CS", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
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
  items.forEach(({ value, label, time, title }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === selected;
    if (time !== undefined) option.dataset.time = time;
    if (title) option.dataset.title = title;
    select.appendChild(option);
  });
}

function lessonFromNode(node) {
  const feature = node.querySelector(":scope > feature");
  const path = node.querySelector(":scope > path");
  return {
    node,
    number: node.getAttribute("n") || "",
    date: node.getAttribute("date") || "",
    holiday: node.hasAttribute("holiday"),
    feature,
    featureText: feature?.textContent?.trim() || "",
    pathText: path?.textContent?.trim() || "",
  };
}

function appendFeatureContent(cell, feature) {
  if (!feature) {
    cell.textContent = "—";
    return;
  }
  Array.from(feature.childNodes).forEach((item) => {
    if (item.nodeType === Node.TEXT_NODE) {
      cell.append(item.textContent);
      return;
    }
    if (item.nodeType !== Node.ELEMENT_NODE) return;
    const span = document.createElement(item.localName === "b" || item.getAttribute("cat") === "b" ? "strong" : "span");
    const category = item.getAttribute("cat");
    if (category && category !== "b") span.className = `saber-category saber-category-${category}`;
    span.textContent = item.textContent;
    cell.append(span);
  });
}

function renderCalendarRows(season, lessons, time = "", today = new Date()) {
  const rows = document.getElementById("saberCalendarRows");
  rows.replaceChildren();
  today = new Date(today);
  today.setHours(0, 0, 0, 0);
  const rendered = lessons.map((lesson) => ({ lesson, date: lessonDate(season, lesson.date) }));
  const thisWeek = rendered.filter(({ date }) => isInCurrentWeek(date, today));
  const upcoming = rendered.find(({ date, lesson }) => date && !lesson.holiday && date >= today);
  const highlighted = thisWeek.length ? new Set(thisWeek.map(({ lesson }) => lesson)) : new Set(upcoming ? [upcoming.lesson] : []);
  let firstHighlighted = null;
  rendered.forEach(({ lesson, date }) => {
    const row = document.createElement("tr");
    if (date && date < today) row.classList.add("saber-past");
    const isCurrentWeek = highlighted.has(lesson);
    if (isCurrentWeek) {
      row.classList.add("saber-current-week");
      firstHighlighted ||= row;
    }
    const number = document.createElement("td");
    number.textContent = lesson.number || "—";
    const dateCell = document.createElement("td");
    dateCell.textContent = lesson.holiday ? `${formatSaberDate(date)} · volno` : formatSaberDate(date);
    if (isCurrentWeek) {
      const badge = document.createElement("span");
      badge.className = "saber-week-badge";
      badge.textContent = thisWeek.length ? "Tento týden" : "Příští hodina";
      dateCell.append(badge);
    }
    const featureCell = document.createElement("td");
    if (lesson.holiday) featureCell.textContent = lesson.featureText || "Volno";
    else appendFeatureContent(featureCell, lesson.feature);
    const pathCell = document.createElement("td");
    pathCell.textContent = lesson.pathText || "—";
    const actionCell = document.createElement("td");
    if (lesson.number && date) {
      const addLink = document.createElement("a");
      addLink.className = "btn saber-calendar-add";
      addLink.href = googleCalendarUrl(lesson, season, time);
      addLink.target = "_blank";
      addLink.rel = "noopener";
      addLink.textContent = "Přidat do Google kalendáře";
      actionCell.append(addLink);
    } else {
      actionCell.textContent = "—";
    }
    row.append(number, dateCell, featureCell, pathCell, actionCell);
    rows.append(row);
  });
  firstHighlighted?.scrollIntoView({ behavior: "smooth", block: "center" });
}

let activeCalendar = null;

async function loadCalendar() {
  const season = document.getElementById("saberSeason").value;
  const day = document.getElementById("saberDay").value;
  const status = document.getElementById("saberCalendarStatus");
  const exportButton = document.getElementById("saberCalendarExport");
  const xml = await fetchSaberXml(`data/saberacademy/calendar/${season}-${day}.xml`);
  const seasonNode = xml?.querySelector("season");
  if (!seasonNode) {
    document.getElementById("saberCalendarRows").replaceChildren();
    exportButton.hidden = true;
    activeCalendar = null;
    status.textContent = "Zatím bez rozvrhu.";
    return;
  }
  const time = document.getElementById("saberDay").selectedOptions[0]?.dataset.time || "";
  document.getElementById("saberCalendarTitle").textContent = document.getElementById("saberDay").selectedOptions[0]?.dataset.title || `SaberAcademy – ${SABER_DAYS[day]}`;
  const lessons = Array.from(seasonNode.querySelectorAll(":scope > lesson")).map(lessonFromNode);
  activeCalendar = { season, day, time, lessons };
  exportButton.hidden = false;
  status.textContent = "";
  renderCalendarRows(season, lessons, time);
}

document.addEventListener("DOMContentLoaded", async () => {
  const index = await fetchSaberXml(SABER_INDEX_URL);
  const seasons = Array.from(index?.querySelectorAll("season") || []).map((item) => {
    const days = Array.from(item.querySelectorAll(":scope > day")).map((day) => ({
      id: day.getAttribute("id"),
      time: day.getAttribute("time") || "",
      title: day.getAttribute("title") || "",
    })).filter((day) => SABER_DAYS[day.id]);
    if (!days.length) {
      (item.getAttribute("days") || "").split(/\s+/).filter((day) => SABER_DAYS[day]).forEach((id) => days.push({ id, time: "" }));
    }
    return { id: item.getAttribute("id"), days };
  }).filter((item) => item.id);
  const settings = getCalendarSettings();
  const seasonId = seasons.some((season) => season.id === settings.season)
    ? settings.season
    : seasons.find((season) => season.id === currentSaberSeason())?.id || seasons.at(-1)?.id;
  const availableDays = seasons.find((season) => season.id === seasonId)?.days || [];
  const day = availableDays.some((item) => item.id === settings.day) ? settings.day : availableDays[0]?.id;
  populateSelect(document.getElementById("saberSeason"), seasons.map((season) => ({ value: season.id, label: season.id })), seasonId);
  const populateDays = (selectedDays, selectedDay) => populateSelect(document.getElementById("saberDay"), selectedDays.map((item) => ({
    value: item.id,
    label: SABER_DAYS[item.id],
    time: item.time,
    title: item.title,
  })), selectedDay);
  const daySelect = document.getElementById("saberDay");
  populateDays(availableDays, day);
  const update = async () => {
    const selectedSeason = document.getElementById("saberSeason").value;
    const selected = seasons.find((season) => season.id === selectedSeason);
    const currentDay = daySelect.value;
    const selectedDay = selected?.days.some((item) => item.id === currentDay) ? currentDay : selected?.days[0]?.id;
    populateDays(selected?.days || [], selectedDay);
    saveCalendarSettings({ season: selectedSeason, day: selectedDay });
    await loadCalendar();
  };
  document.getElementById("saberSeason").addEventListener("change", update);
  daySelect.addEventListener("change", () => {
    saveCalendarSettings({ season: document.getElementById("saberSeason").value, day: daySelect.value });
    loadCalendar();
  });
  document.getElementById("saberCalendarExport").addEventListener("click", () => {
    if (!activeCalendar) return;
    const file = new Blob([createIcs(activeCalendar.lessons, activeCalendar.season, activeCalendar.day, activeCalendar.time)], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = `saberacademy-${activeCalendar.season}-${activeCalendar.day}.ics`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  if (!seasonId || !day) {
    document.getElementById("saberCalendarStatus").textContent = "Zatím bez rozvrhu.";
    return;
  }
  await loadCalendar();
});
