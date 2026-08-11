const SUBAPP_LABELS = {
  gym: "🏋️ Gym",
  calisthenics: "🤸 Calistenika",
  diary: "📔 Deníček",
  duels: "⚔️ Duely",
};

let settingsState = getAppSettings();

function persistSubapps() {
  settingsState = saveAppSettings(settingsState);
  renderSubappSettings();
}

function moveSubapp(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= settingsState.subapps.length) return;
  const subapps = settingsState.subapps.slice();
  [subapps[index], subapps[target]] = [subapps[target], subapps[index]];
  settingsState = { ...settingsState, subapps };
  persistSubapps();
}

function renderSubappSettings() {
  const container = document.getElementById("subappSettingsList");
  container.innerHTML = "";

  settingsState.subapps.forEach((subapp, index) => {
    const row = document.createElement("div");
    row.className = "settings-item";

    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = subapp.visible;
    checkbox.addEventListener("change", () => {
      settingsState = {
        ...settingsState,
        subapps: settingsState.subapps.map((item) =>
          item.id === subapp.id ? { ...item, visible: checkbox.checked } : item
        ),
      };
      persistSubapps();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(SUBAPP_LABELS[subapp.id]));

    const actions = document.createElement("div");
    actions.className = "settings-order-actions";
    const up = document.createElement("button");
    up.type = "button";
    up.className = "btn ghost small";
    up.textContent = "↑";
    up.disabled = index === 0;
    up.setAttribute("aria-label", "Posunout nahoru");
    up.addEventListener("click", () => moveSubapp(index, -1));
    const down = document.createElement("button");
    down.type = "button";
    down.className = "btn ghost small";
    down.textContent = "↓";
    down.disabled = index === settingsState.subapps.length - 1;
    down.setAttribute("aria-label", "Posunout dolů");
    down.addEventListener("click", () => moveSubapp(index, 1));
    actions.append(up, down);

    row.append(label, actions);
    container.appendChild(row);
  });
}

function saveNickname() {
  const input = document.getElementById("nicknameInput");
  const status = document.getElementById("nicknameStatus");
  const nickname = input.value.trim();
  if (!nickname) {
    status.textContent = "Nickname nesmí být prázdný.";
    status.style.color = "var(--red)";
    input.focus();
    return;
  }

  settingsState = saveAppSettings({ ...settingsState, nickname });
  input.value = settingsState.nickname;
  status.textContent = "Nickname uložen.";
  status.style.color = "var(--green)";
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("nicknameInput").value = settingsState.nickname;
  document.getElementById("saveNicknameBtn").addEventListener("click", saveNickname);
  renderSubappSettings();
});
