// Sdílené pomocné funkce pro ukládání dat do localStorage (data zůstávají jen v telefonu)
const Storage = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error("Chyba čtení z uložiště", key, e);
      return fallback;
    }
  },
  write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
};

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./service-worker.js")
        .then((registration) => {
          // Při každém otevření appky aktivně zkontrolovat, jestli není nová verze
          registration.update();

          // Jakmile nový service worker převezme kontrolu, appka se sama jednou obnoví
          let reloaded = false;
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (reloaded) return;
            reloaded = true;
            window.location.reload();
          });
        })
        .catch((e) => {
          console.warn("Service worker se nepodařilo zaregistrovat", e);
        });
    });
  }
}

function formatDate(isoDate) {
  const d = new Date(isoDate);
  if (isNaN(d)) return isoDate;
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
}

function todayInputValue() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}
