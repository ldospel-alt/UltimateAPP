const SABER_CHOREO_INDEX_URL = "data/saberacademy/index.xml";
let selectedSaberRole = "both";

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

function renderChoreoParts(choreo) {
  const container = document.getElementById("saberChoreoParts");
  container.replaceChildren();
  Array.from(choreo.querySelectorAll("part")).forEach((part, partIndex) => {
    const steps = Array.from(part.querySelectorAll("step"));
    const section = document.createElement("section");
    section.className = "saber-choreo-part";
    const heading = document.createElement("h3");
    heading.textContent = `Blok ${partIndex + 1}`;
    const wrap = document.createElement("div");
    wrap.className = "saber-choreo-table-wrap";
    const table = document.createElement("table");
    table.className = "saber-choreo-table";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const firstHead = document.createElement("th");
    firstHead.textContent = "Role";
    headRow.appendChild(firstHead);
    steps.forEach((_, index) => {
      const cell = document.createElement("th");
      cell.textContent = String(index + 1);
      headRow.appendChild(cell);
    });
    head.appendChild(headRow);
    const body = document.createElement("tbody");
    [["jedi", "Jedi"], ["sith", "Sith"]].forEach(([role, label]) => {
      if (selectedSaberRole !== "both" && selectedSaberRole !== role) return;
      const row = document.createElement("tr");
      const labelCell = document.createElement("th");
      labelCell.textContent = label;
      row.appendChild(labelCell);
      steps.forEach((step) => {
        const cell = document.createElement("td");
        cell.textContent = step.getAttribute(role) || "—";
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
    if (selectedSaberRole === "both") {
      const noteRow = document.createElement("tr");
      const noteLabel = document.createElement("th");
      noteLabel.textContent = "Poznámka";
      noteRow.appendChild(noteLabel);
      steps.forEach((step) => {
        const cell = document.createElement("td");
        cell.textContent = step.getAttribute("note") || "—";
        noteRow.appendChild(cell);
      });
      body.appendChild(noteRow);
    }
    table.append(head, body);
    wrap.appendChild(table);
    section.append(heading, wrap);
    container.appendChild(section);
  });
}

async function showChoreo(file) {
  const xml = await fetchChoreoXml(`data/saberacademy/choreo/${file}`);
  const choreo = xml?.querySelector("choreo");
  if (!choreo) return;
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
      const title = document.getElementById("saberChoreoTitle").textContent;
      if (title) showChoreo(items.find((item) => item.getAttribute("title") === title)?.getAttribute("file"));
    });
  });
});
