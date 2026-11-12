const SABER_CHOREO_INDEX_URL = "data/saberacademy/index.xml";
let selectedSaberRole = "both";
let activeSaberChoreo = null;

function parseChoreoXml(text) {
  const documentXml = new DOMParser().parseFromString(text, "application/xml");
  return documentXml.querySelector("parsererror") ? null : documentXml;
}

async function fetchChoreoXml(url) {
  try {
    const response = await fetch(url);
    return response.ok ? parseChoreoXml(await response.text()) : null;
  } catch {
    return null;
  }
}

function visibleChoreoStep(step, role) {
  const includeJedi = role !== "sith";
  const includeSith = role !== "jedi";
  return {
    jedi: includeJedi ? step.getAttribute("jedi") || "—" : null,
    sith: includeSith ? step.getAttribute("sith") || "—" : null,
    note: step.getAttribute("note") || "",
  };
}

function renderChoreoParts(choreo) {
  const container = document.getElementById("saberChoreoParts");
  container.replaceChildren();
  Array.from(choreo.querySelectorAll("part")).forEach((part, partIndex) => {
    const steps = Array.from(part.querySelectorAll("step"));
    const section = document.createElement("section");
    section.className = "saber-choreo-part";
    const heading = document.createElement("h3");
    heading.textContent = `Blok ${partIndex + 1}`;
    const list = document.createElement("div");
    list.className = "saber-choreo-steps";
    steps.forEach((step, stepIndex) => {
      const visibleStep = visibleChoreoStep(step, selectedSaberRole);
      const row = document.createElement("article");
      row.className = "saber-choreo-step";
      if (selectedSaberRole !== "both") row.classList.add("saber-choreo-single-role");
      const number = document.createElement("span");
      number.className = "saber-choreo-step-number";
      number.textContent = String(stepIndex + 1);
      row.appendChild(number);
      [["jedi", "Jedi"], ["sith", "Sith"]].forEach(([role, label]) => {
        if (visibleStep[role] === null) return;
        const move = document.createElement("div");
        move.className = `saber-choreo-move saber-choreo-${role}`;
        const roleLabel = document.createElement("span");
        roleLabel.textContent = label;
        const value = document.createElement("strong");
        value.textContent = visibleStep[role];
        move.append(roleLabel, value);
        row.appendChild(move);
      });
      const noteValue = visibleStep.note;
      if (noteValue) {
        const note = document.createElement("p");
        note.className = "saber-choreo-note";
        note.textContent = noteValue;
        row.appendChild(note);
      }
      list.appendChild(row);
    });
    section.append(heading, list);
    container.appendChild(section);
  });
}

async function showChoreo(file) {
  const xml = await fetchChoreoXml(`data/saberacademy/choreo/${file}`);
  const choreo = xml?.querySelector("choreo");
  if (!choreo) return;
  activeSaberChoreo = choreo;
  document.getElementById("saberChoreoTitle").textContent = choreo.getAttribute("title") || "Choreo";
  document.getElementById("saberChoreoViewer").hidden = false;
  renderChoreoParts(choreo);
  document.getElementById("saberChoreoViewer").scrollIntoView({ behavior: "smooth", block: "start" });
}

document.addEventListener("DOMContentLoaded", async () => {
  const index = await fetchChoreoXml(SABER_CHOREO_INDEX_URL);
  const list = document.getElementById("saberChoreoList");
  const status = document.getElementById("saberChoreoStatus");
  const items = Array.from(index?.querySelectorAll("choreo") || []);
  if (!items.length) {
    status.textContent = "Zatím bez choreografií.";
    return;
  }
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn secondary block";
    button.textContent = `${item.getAttribute("id") || "?"}. ${item.getAttribute("title") || "Bez názvu"}`;
    button.addEventListener("click", () => showChoreo(item.getAttribute("file")));
    list.appendChild(button);
  });
  document.querySelectorAll(".saber-role-btn").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSaberRole = button.dataset.role;
      document.querySelectorAll(".saber-role-btn").forEach((item) => {
        item.classList.toggle("secondary", item === button);
        item.classList.toggle("ghost", item !== button);
      });
      if (activeSaberChoreo) renderChoreoParts(activeSaberChoreo);
    });
  });
});
