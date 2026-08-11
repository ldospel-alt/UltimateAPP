function applyHomeSettings() {
  const settings = getAppSettings();
  const title = document.getElementById("homeTitle");
  title.textContent = settings.homeTitle;

  const grid = document.getElementById("subappGrid");
  const tiles = new Map(
    Array.from(grid.querySelectorAll("[data-subapp]"))
      .map((tile) => [tile.dataset.subapp, tile])
  );
  settings.subapps.forEach((item) => {
    const tile = tiles.get(item.id);
    if (!tile) return;
    tile.hidden = !item.visible;
    grid.appendChild(tile);
  });
}

function startHomeTitleEdit() {
  const title = document.getElementById("homeTitle");
  if (title.isContentEditable) return;

  const original = title.textContent;
  title.contentEditable = "true";
  title.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(title);
  selection.removeAllRanges();
  selection.addRange(range);

  const handleKeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      title.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  };
  const handleInput = () => {
    const value = title.textContent.trim();
    if (value) saveAppSettings({ ...getAppSettings(), homeTitle: value });
  };
  const handleBlur = () => finish(true);
  const finish = (save) => {
    if (!title.isContentEditable) return;
    title.removeEventListener("blur", handleBlur);
    title.removeEventListener("keydown", handleKeydown);
    title.removeEventListener("input", handleInput);
    title.contentEditable = "false";
    const value = title.textContent.trim();
    title.textContent = save && value ? value : original;
    if (save && value) {
      saveAppSettings({ ...getAppSettings(), homeTitle: value });
    } else {
      saveAppSettings({ ...getAppSettings(), homeTitle: original });
    }
  };

  title.addEventListener("blur", handleBlur);
  title.addEventListener("keydown", handleKeydown);
  title.addEventListener("input", handleInput);
}

document.addEventListener("DOMContentLoaded", () => {
  applyHomeSettings();
  const title = document.getElementById("homeTitle");
  title.addEventListener("click", startHomeTitleEdit);
  title.addEventListener("keydown", (event) => {
    if (!title.isContentEditable && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      startHomeTitleEdit();
    }
  });
});
