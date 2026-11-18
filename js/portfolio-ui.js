let portfolioEditingTradeId = null;
let portfolioSort = { key: "value", direction: "desc" };
let portfolioCsvData = null;
let portfolioCsvImport = null;
let portfolioDetailAssetId = null;

function portfolioUiStatus(message, error = false) {
  ["portfolioStatus", "portfolioSettingsStatus"].forEach((id) => {
    const element = document.getElementById(id);
    element.textContent = message;
    element.style.color = error ? "var(--red)" : "";
  });
}

function portfolioShowLocked(message = "") {
  document.getElementById("portfolioApp").hidden = true;
  document.getElementById("portfolioUnlockCard").hidden = false;
  document.getElementById("portfolioSettingsBtn").hidden = true;
  document.getElementById("portfolioUnlockStatus").textContent = message;
}

function portfolioShowView(view) {
  document.getElementById("portfolioOverviewView").hidden = view !== "overview";
  document.getElementById("portfolioTransactionsView").hidden = view !== "transactions";
  document.getElementById("portfolioSettingsView").hidden = view !== "settings";
  document.getElementById("portfolioDetailCard").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function portfolioPopulateImportProfiles() {
  const state = portfolioGetState();
  const select = document.getElementById("portfolioImportProfile");
  const selectedId = select.value || state.brokerProfiles[0]?.id || "";
  const newProfile = document.createElement("option");
  newProfile.value = "";
  newProfile.textContent = "Nový profil…";
  select.replaceChildren(newProfile, ...state.brokerProfiles.map((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    return option;
  }));
  select.value = state.brokerProfiles.some((profile) => profile.id === selectedId) ? selectedId : "";
  const profile = state.brokerProfiles.find((item) => item.id === select.value);
  document.getElementById("portfolioImportProfileName").value = profile?.name || "";
  document.getElementById("portfolioOperationMap").value = Object.entries(profile?.operationMap || {}).map(([alias, type]) => `${alias}=${type}`).join("\n");
  if (portfolioCsvData && profile) {
    portfolioBuildCsvMapping(portfolioCsvData.headers, profile);
    portfolioEvaluateCsv();
  }
}

function portfolioFormatMoney(value, currency, hide = portfolioGetState().settings.hideAmounts) {
  if (hide) return "••••";
  if (value === null || value === undefined || value === "") return "—";
  if (!Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("cs-CZ", { style: "currency", currency: currency || "CZK", maximumFractionDigits: 2 });
}

function portfolioPopulateAssets() {
  const state = portfolioGetState();
  const select = document.getElementById("portfolioAsset");
  select.replaceChildren();
  state.assets.slice().sort((a, b) => a.symbol.localeCompare(b.symbol, "cs")).forEach((asset) => {
    const option = document.createElement("option");
    option.value = asset.id;
    option.textContent = `${asset.symbol} – ${asset.name}`;
    select.append(option);
  });
}

function portfolioPositionRows() {
  const state = portfolioGetState();
  const positions = portfolioCalculatePositions(state.assets, state.trades, state.priceCache);
  const totals = positions.reduce((sum, position) => sum + (position.value || 0), 0);
  return positions.map((position) => ({ ...position, symbol: position.asset.symbol, allocation: totals ? ((position.value || 0) / totals) * 100 : 0 }))
    .filter((position) => !document.getElementById("portfolioTypeFilter").value || position.asset.type === document.getElementById("portfolioTypeFilter").value)
    .sort((a, b) => {
      const left = a[portfolioSort.key];
      const right = b[portfolioSort.key];
      const compared = typeof left === "string" ? left.localeCompare(right, "cs") : (Number(left) || 0) - (Number(right) || 0);
      return compared * (portfolioSort.direction === "asc" ? 1 : -1);
    });
}

function portfolioRender() {
  const state = portfolioGetState();
  document.getElementById("portfolioHideAmounts").checked = state.settings.hideAmounts;
  document.getElementById("portfolioTwelveDataKey").value = state.settings.apiKeys?.twelveData || "";
  document.getElementById("portfolioFinnhubKey").value = state.settings.apiKeys?.finnhub || "";
  document.getElementById("portfolioCoinGeckoKey").value = state.settings.apiKeys?.coingecko || "";
  document.getElementById("portfolioTradingViewConsent").checked = Boolean(state.settings.tradingViewConsent);
  portfolioPopulateAssets();
  const positions = portfolioPositionRows();
  const totals = portfolioTotalsByCurrency(portfolioCalculatePositions(state.assets, state.trades, state.priceCache));
  const totalsContainer = document.getElementById("portfolioTotals");
  totalsContainer.replaceChildren();
  Object.entries(totals).forEach(([currency, total]) => {
    const item = document.createElement("div");
    item.className = "stat-box";
    item.innerHTML = `<div class="value">${portfolioFormatMoney(total.value, currency)}</div><div class="label">${currency} · dividendy ${portfolioFormatMoney(total.dividends, currency)}</div>`;
    totalsContainer.append(item);
  });
  const body = document.getElementById("portfolioPositions");
  body.replaceChildren();
  document.getElementById("portfolioEmptyPositions").hidden = positions.length > 0;
  positions.forEach((position) => {
    const row = document.createElement("tr");
    const values = [
      position.asset.symbol,
      position.quantity.toLocaleString("cs-CZ"),
      portfolioFormatMoney(position.averagePrice, position.asset.currency),
      portfolioFormatMoney(position.currentPrice, position.asset.currency),
      portfolioFormatMoney(position.value, position.asset.currency),
      portfolioFormatMoney(position.unrealized, position.asset.currency),
      portfolioFormatMoney(position.realized, position.asset.currency),
      `${position.allocation.toFixed(1)} %`,
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 0) {
        cell.className = "portfolio-asset-link";
        cell.addEventListener("click", () => portfolioShowAssetDetail(position.asset.id));
      }
      row.append(cell);
    });
    body.append(row);
  });
  portfolioRenderTrades();
}

function portfolioRenderTrades() {
  const state = portfolioGetState();
  const assets = new Map(state.assets.map((asset) => [asset.id, asset]));
  const container = document.getElementById("portfolioTrades");
  container.replaceChildren();
  state.trades.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).forEach((trade) => {
    const asset = assets.get(trade.assetId);
    const item = document.createElement("article");
    item.className = "portfolio-trade";
    item.innerHTML = `<strong>${asset?.symbol || "?"} · ${trade.type}</strong><p>${trade.date} · ${trade.qty || "—"} × ${portfolioFormatMoney(trade.price, trade.currency || asset?.currency)}</p><p class="portfolio-note">${trade.note || trade.source || ""}</p>`;
    const actions = document.createElement("div");
    actions.className = "portfolio-trade-actions";
    [["Upravit", () => portfolioEditTrade(trade.id)], ["Smazat", () => portfolioDeleteTrade(trade.id)]].forEach(([label, action]) => {
      const button = document.createElement("button");
      button.className = "btn ghost small";
      button.textContent = label;
      button.addEventListener("click", action);
      actions.append(button);
    });
    item.append(actions);
    container.append(item);
  });
}

function portfolioResetTradeForm() {
  portfolioEditingTradeId = null;
  document.getElementById("portfolioTradeTitle").textContent = "Přidat transakci";
  document.getElementById("portfolioTradeDate").value = todayInputValue();
  document.getElementById("portfolioTradeType").value = "buy";
  ["portfolioTradeQty", "portfolioTradePrice"].forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("portfolioTradeFee").value = "0";
  document.getElementById("portfolioTradeNote").value = "";
  document.getElementById("portfolioNewAssetFields").hidden = true;
}

async function portfolioSaveTrade() {
  const state = portfolioGetState();
  let assetId = document.getElementById("portfolioAsset").value;
  if (!document.getElementById("portfolioNewAssetFields").hidden) {
    const symbol = document.getElementById("portfolioAssetSymbol").value.trim().toUpperCase();
    if (!symbol) return portfolioUiStatus("Vyplň symbol nového aktiva.", true);
    const asset = {
      id: Storage.uid(), symbol, name: document.getElementById("portfolioAssetName").value.trim() || symbol,
      type: document.getElementById("portfolioAssetType").value, currency: document.getElementById("portfolioAssetCurrency").value.trim().toUpperCase(),
      tvSymbol: document.getElementById("portfolioAssetTvSymbol").value.trim(), priceSource: document.getElementById("portfolioAssetPriceSource").value,
      priceSymbol: document.getElementById("portfolioAssetPriceSymbol").value.trim() || symbol,
    };
    state.assets.push(asset);
    assetId = asset.id;
  }
  const trade = {
    id: portfolioEditingTradeId || Storage.uid(), assetId, date: document.getElementById("portfolioTradeDate").value,
    type: document.getElementById("portfolioTradeType").value, qty: Number(document.getElementById("portfolioTradeQty").value || 0),
    price: Number(document.getElementById("portfolioTradePrice").value || 0), fee: Number(document.getElementById("portfolioTradeFee").value || 0),
    currency: document.getElementById("portfolioTradeCurrency").value.trim().toUpperCase(), note: document.getElementById("portfolioTradeNote").value.trim(), source: "manual",
  };
  if (!trade.assetId || !trade.date || !Number.isFinite(trade.price)) return portfolioUiStatus("Vyplň aktivum, datum a cenu.", true);
  if (trade.type === "sell" && trade.qty > portfolioHeldQuantity(assetId, state.trades.filter((item) => item.id !== trade.id))) {
    if (!confirm("Prodej překračuje aktuálně držené množství. Přesto uložit?")) return;
  }
  const index = state.trades.findIndex((item) => item.id === trade.id);
  if (index >= 0) state.trades[index] = trade;
  else state.trades.push(trade);
  await portfolioSaveState(state);
  portfolioResetTradeForm();
  portfolioRender();
  portfolioShowView("overview");
}

function portfolioEditTrade(id) {
  const trade = portfolioGetState().trades.find((item) => item.id === id);
  if (!trade) return;
  portfolioEditingTradeId = id;
  portfolioShowView("transactions");
  document.getElementById("portfolioTradeTitle").textContent = "Upravit transakci";
  document.getElementById("portfolioAsset").value = trade.assetId;
  document.getElementById("portfolioTradeType").value = trade.type;
  document.getElementById("portfolioTradeDate").value = trade.date;
  document.getElementById("portfolioTradeQty").value = trade.qty;
  document.getElementById("portfolioTradePrice").value = trade.price;
  document.getElementById("portfolioTradeFee").value = trade.fee;
  document.getElementById("portfolioTradeCurrency").value = trade.currency;
  document.getElementById("portfolioTradeNote").value = trade.note || "";
}

async function portfolioDeleteTrade(id) {
  if (!confirm("Opravdu smazat transakci?")) return;
  const state = portfolioGetState();
  state.trades = state.trades.filter((trade) => trade.id !== id);
  await portfolioSaveState(state);
  portfolioRender();
}

async function portfolioRefreshPrices() {
  portfolioUiStatus("Aktualizuji ceny...");
  const result = await portfolioUpdatePrices(portfolioGetState(), (asset, index, total) => portfolioUiStatus(`${asset.symbol}: ${index}/${total}`));
  await portfolioSaveState(result.state);
  portfolioUiStatus(result.errors.length ? `Ceny částečně aktualizovány: ${result.errors.join(" ")}` : "Ceny aktualizovány.", result.errors.length > 0);
  portfolioRender();
}

function portfolioBuildCsvMapping(headers, profile) {
  const container = document.getElementById("portfolioCsvMapping");
  container.replaceChildren();
  ["date", "symbol", "operation", "qty", "price", "fee", "currency"].forEach((field) => {
    const label = document.createElement("label");
    label.textContent = field;
    const select = document.createElement("select");
    select.dataset.csvField = field;
    ["", ...headers].forEach((header) => {
      const option = document.createElement("option");
      option.value = header;
      option.textContent = header || "—";
      option.selected = profile.mapping[field] === header;
      select.append(option);
    });
    label.append(select);
    container.append(label);
  });
}

async function portfolioPrepareCsv(file) {
  const text = await portfolioReadCsvFile(file);
  portfolioCsvData = portfolioParseCsv(text);
  const profile = portfolioGetState().brokerProfiles.find((item) => item.id === document.getElementById("portfolioImportProfile").value) || portfolioGetState().brokerProfiles[0];
  portfolioBuildCsvMapping(portfolioCsvData.headers, profile);
  document.getElementById("portfolioCsvPreview").textContent = portfolioCsvData.rows.slice(0, 5).map((row) => JSON.stringify(row)).join("\n");
  portfolioEvaluateCsv();
}

function portfolioEvaluateCsv() {
  if (!portfolioCsvData) return;
  const mapping = Object.fromEntries(Array.from(document.querySelectorAll("[data-csv-field]")).map((select) => [select.dataset.csvField, select.value]));
  const profile = { name: document.getElementById("portfolioImportProfileName").value || "Vlastní profil", mapping };
  const state = portfolioGetState();
  const operationMap = Object.fromEntries(document.getElementById("portfolioOperationMap").value.split(/\r?\n/).map((line) => line.split("=")).filter(([alias, type]) => alias?.trim() && ["buy", "sell", "dividend", "fee"].includes(type?.trim())).map(([alias, type]) => [alias.trim().toLocaleLowerCase("cs"), type.trim()]));
  portfolioCsvImport = portfolioMapCsvRows(portfolioCsvData, profile, state.assets, state.trades, operationMap);
  document.getElementById("portfolioCsvSummary").textContent = `Nové: ${portfolioCsvImport.valid.length}, duplicity: ${portfolioCsvImport.duplicates.length}, chybné: ${portfolioCsvImport.invalid.length}`;
  document.getElementById("portfolioConfirmImportBtn").disabled = !portfolioCsvImport.valid.length;
}

async function portfolioSaveImportProfile() {
  const state = portfolioGetState();
  const name = document.getElementById("portfolioImportProfileName").value.trim();
  if (!name) return portfolioUiStatus("Zadej název profilu.", true);
  const mapping = Object.fromEntries(Array.from(document.querySelectorAll("[data-csv-field]")).map((select) => [select.dataset.csvField, select.value]));
  const operationMap = Object.fromEntries(document.getElementById("portfolioOperationMap").value.split(/\r?\n/).map((line) => line.split("=")).filter(([alias, type]) => alias?.trim() && type?.trim()).map(([alias, type]) => [alias.trim(), type.trim()]));
  const selectedId = document.getElementById("portfolioImportProfile").value;
  const profile = { id: selectedId || Storage.uid(), name, mapping, operationMap };
  const index = state.brokerProfiles.findIndex((item) => item.id === profile.id);
  if (index >= 0) state.brokerProfiles[index] = profile;
  else state.brokerProfiles.push(profile);
  await portfolioSaveState(state);
  portfolioUiStatus("Profil mapování byl uložen šifrovaně.");
  portfolioPopulateImportProfiles();
}

async function portfolioConfirmCsvImport() {
  const state = portfolioGetState();
  const newAssets = new Map();
  portfolioCsvImport.valid.filter((trade) => trade.pendingSymbol).forEach((trade) => {
    const symbol = trade.pendingSymbol.toUpperCase();
    if (!newAssets.has(symbol)) {
      const asset = { id: Storage.uid(), symbol, name: symbol, type: "stock", currency: trade.currency || "USD", tvSymbol: symbol, priceSource: "twelveData", priceSymbol: symbol };
      newAssets.set(symbol, asset);
      state.assets.push(asset);
    }
    trade.assetId = newAssets.get(symbol).id;
    trade.pendingSymbol = "";
    trade.importHash = portfolioTradeHash(trade);
  });
  state.trades.push(...portfolioCsvImport.valid);
  await portfolioSaveState(state);
  portfolioCsvData = null;
  portfolioCsvImport = null;
  document.getElementById("portfolioCsvFile").value = "";
  document.getElementById("portfolioCsvMapping").replaceChildren();
  document.getElementById("portfolioCsvPreview").textContent = "";
  document.getElementById("portfolioCsvSummary").textContent = "";
  document.getElementById("portfolioConfirmImportBtn").disabled = true;
  portfolioRender();
  portfolioUiStatus("CSV bylo importováno do šifrovaného portfolia.");
}

async function portfolioShowAssetDetail(assetId) {
  const state = portfolioGetState();
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return;
  portfolioDetailAssetId = assetId;
  portfolioShowView("overview");
  const card = document.getElementById("portfolioDetailCard");
  card.hidden = false;
  document.getElementById("portfolioDetailTitle").textContent = `${asset.symbol} – ${asset.name}`;
  document.getElementById("portfolioTradingViewLink").href = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(asset.tvSymbol || asset.symbol)}`;
  document.getElementById("portfolioTradingViewWidget").replaceChildren();
  document.getElementById("portfolioTradingViewConsentBtn").hidden = Boolean(state.settings.tradingViewConsent);
  try {
    const result = await portfolioLoadHistory(state, asset);
    state.priceCache[asset.id] = { ...(state.priceCache[asset.id] || {}), history: result.history, historyUpdatedAt: new Date().toISOString() };
    await portfolioSaveState(state);
    portfolioRenderChart(asset, result.history);
    const rating = portfolioTechnicalRating(result.history);
    document.getElementById("portfolioOwnRating").textContent = `Vlastní výpočet, ne TradingView: ${rating.label} (skóre ${rating.score})${result.cached ? " · offline cache" : ""}`;
  } catch (error) {
    document.getElementById("portfolioOwnRating").textContent = error.message;
  }
  if (state.settings.tradingViewConsent) portfolioLoadTradingViewWidget();
  card.scrollIntoView({ behavior: "smooth" });
}

function portfolioRenderChart(asset, history) {
  const container = document.getElementById("portfolioChart");
  container.replaceChildren();
  if (!window.LightweightCharts) return;
  const chart = LightweightCharts.createChart(container, { height: 320, layout: { background: { color: "#171a22" }, textColor: "#ddd" }, grid: { vertLines: { color: "#272b36" }, horzLines: { color: "#272b36" } } });
  const candles = document.getElementById("portfolioChartType").value === "candles" && history.some((item) => [item.open, item.high, item.low, item.close].every((value) => Number.isFinite(Number(value))));
  const series = candles
    ? chart.addCandlestickSeries({ upColor: "#47d16c", downColor: "#ff6464", borderVisible: false, wickUpColor: "#47d16c", wickDownColor: "#ff6464" })
    : chart.addLineSeries({ color: "#8f7cff", lineWidth: 2 });
  series.setData(candles
    ? history.map((item) => ({ time: item.time, open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close) })).filter((item) => [item.open, item.high, item.low, item.close].every(Number.isFinite))
    : history.map((item) => ({ time: item.time, value: Number(item.close) })).filter((item) => Number.isFinite(item.value)));
  const trades = portfolioGetState().trades.filter((trade) => trade.assetId === asset.id && (trade.type === "buy" || trade.type === "sell"));
  const availableDates = history.map((item) => item.time).sort();
  series.setMarkers(trades.map((trade) => ({
    time: availableDates.find((date) => date >= trade.date) || availableDates.at(-1),
    position: trade.type === "buy" ? "belowBar" : "aboveBar",
    color: trade.type === "buy" ? "#47d16c" : "#ff6464",
    shape: trade.type === "buy" ? "arrowUp" : "arrowDown",
    text: `${trade.qty} × ${trade.price}`,
  })).filter((marker) => marker.time).sort((a, b) => a.time.localeCompare(b.time)));
  const position = portfolioCalculatePositions([asset], trades, {})[0];
  if (position?.averagePrice) series.createPriceLine({ price: position.averagePrice, color: "#f5c542", lineStyle: 2, title: "Průměr" });
  chart.timeScale().fitContent();
}

function portfolioLoadTradingViewWidget() {
  const asset = portfolioGetState().assets.find((item) => item.id === portfolioDetailAssetId);
  if (!asset) return;
  const container = document.getElementById("portfolioTradingViewWidget");
  container.replaceChildren();
  const widget = document.createElement("div");
  widget.className = "tradingview-widget-container";
  const target = document.createElement("div");
  target.className = "tradingview-widget-container__widget";
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
  script.async = true;
  script.textContent = JSON.stringify({ interval: "1D", width: "100%", height: 420, symbol: asset.tvSymbol || asset.symbol, showIntervalTabs: true, displayMode: "single", locale: "cs", colorTheme: "dark", isTransparent: true });
  widget.append(target, script);
  container.append(widget);
}

async function portfolioHandleUnlock() {
  const password = document.getElementById("portfolioPassword").value;
  const hasVault = await portfolioHasVault();
  try {
    if (!hasVault) {
      const confirmPassword = document.getElementById("portfolioPasswordConfirm").value;
      if (password !== confirmPassword) throw new Error("Hesla se neshodují.");
      await portfolioSetup(password);
    } else await portfolioUnlock(password);
    document.getElementById("portfolioUnlockCard").hidden = true;
    document.getElementById("portfolioApp").hidden = false;
    document.getElementById("portfolioSettingsBtn").hidden = false;
    portfolioResetTradeForm();
    portfolioRender();
    portfolioShowView("overview");
  } catch (error) {
    document.getElementById("portfolioUnlockStatus").textContent = error.message;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const hasVault = await portfolioHasVault();
  document.getElementById("portfolioUnlockTitle").textContent = hasVault ? "Odemknout portfolio" : "Nastavit heslo portfolia";
  document.getElementById("portfolioPasswordConfirmField").hidden = hasVault;
  document.getElementById("portfolioUnlockHint").textContent = hasVault ? "Data jsou šifrovaná pouze v tomto zařízení." : "Heslo musí mít alespoň 8 znaků. Ztráta hesla znamená ztrátu dat.";
  portfolioSetLockHandler(portfolioShowLocked);
  document.addEventListener("visibilitychange", () => { if (document.hidden && portfolioSessionKey) portfolioLock("Portfolio bylo zamčeno při skrytí aplikace."); });
  ["pointerdown", "keydown", "touchstart"].forEach((event) => document.addEventListener(event, portfolioTouch, { passive: true }));
  document.getElementById("portfolioUnlockBtn").addEventListener("click", portfolioHandleUnlock);
  document.getElementById("portfolioLockBtn").addEventListener("click", () => portfolioLock("Portfolio bylo zamčeno."));
  document.getElementById("portfolioSettingsBtn").addEventListener("click", () => {
    portfolioPopulateImportProfiles();
    portfolioShowView("settings");
  });
  document.getElementById("portfolioCloseSettingsBtn").addEventListener("click", () => portfolioShowView("overview"));
  document.getElementById("portfolioCloseTransactionsBtn").addEventListener("click", () => portfolioShowView("overview"));
  document.getElementById("portfolioAddTradeBtn").addEventListener("click", () => {
    portfolioResetTradeForm();
    portfolioShowView("transactions");
  });
  document.getElementById("portfolioNewAssetBtn").addEventListener("click", () => { document.getElementById("portfolioNewAssetFields").hidden = !document.getElementById("portfolioNewAssetFields").hidden; });
  document.getElementById("portfolioSaveTradeBtn").addEventListener("click", portfolioSaveTrade);
  document.getElementById("portfolioCancelTradeBtn").addEventListener("click", () => portfolioShowView("overview"));
  document.getElementById("portfolioRefreshPricesBtn").addEventListener("click", portfolioRefreshPrices);
  document.getElementById("portfolioTypeFilter").addEventListener("change", portfolioRender);
  document.getElementById("portfolioHideAmounts").addEventListener("change", async (event) => { const state = portfolioGetState(); state.settings.hideAmounts = event.target.checked; await portfolioSaveState(state); portfolioRender(); });
  document.querySelectorAll("[data-portfolio-sort]").forEach((header) => header.addEventListener("click", () => { const key = header.dataset.portfolioSort; portfolioSort = portfolioSort.key === key ? { key, direction: portfolioSort.direction === "asc" ? "desc" : "asc" } : { key, direction: "desc" }; portfolioRender(); }));
  document.getElementById("portfolioCsvFile").addEventListener("change", async (event) => {
    if (!event.target.files[0]) return;
    try {
      await portfolioPrepareCsv(event.target.files[0]);
    } catch (error) {
      portfolioUiStatus(`CSV se nepodařilo přečíst: ${error.message}`, true);
    }
  });
  document.getElementById("portfolioImportProfile").addEventListener("change", () => {
    const profile = portfolioGetState().brokerProfiles.find((item) => item.id === document.getElementById("portfolioImportProfile").value);
    if (!profile) {
      document.getElementById("portfolioImportProfileName").value = "";
      document.getElementById("portfolioOperationMap").value = "";
      return;
    }
    if (!portfolioCsvData) return;
    document.getElementById("portfolioImportProfileName").value = profile.name;
    document.getElementById("portfolioOperationMap").value = Object.entries(profile.operationMap || {}).map(([alias, type]) => `${alias}=${type}`).join("\n");
    portfolioBuildCsvMapping(portfolioCsvData.headers, profile);
    portfolioEvaluateCsv();
  });
  document.getElementById("portfolioCsvMapping").addEventListener("change", portfolioEvaluateCsv);
  document.getElementById("portfolioOperationMap").addEventListener("input", portfolioEvaluateCsv);
  document.getElementById("portfolioSaveImportProfileBtn").addEventListener("click", portfolioSaveImportProfile);
  document.getElementById("portfolioConfirmImportBtn").addEventListener("click", portfolioConfirmCsvImport);
  document.getElementById("portfolioSaveSettingsBtn").addEventListener("click", async () => {
    const state = portfolioGetState();
    state.settings.apiKeys = {
      twelveData: document.getElementById("portfolioTwelveDataKey").value.trim(),
      finnhub: document.getElementById("portfolioFinnhubKey").value.trim(),
      coingecko: document.getElementById("portfolioCoinGeckoKey").value.trim(),
    };
    state.settings.tradingViewConsent = document.getElementById("portfolioTradingViewConsent").checked;
    await portfolioSaveState(state);
    if (!state.settings.tradingViewConsent) document.getElementById("portfolioTradingViewWidget").replaceChildren();
    portfolioUiStatus("API klíče a souhlas TradingView byly uloženy šifrovaně.");
  });
  document.getElementById("portfolioChangePasswordBtn").addEventListener("click", async () => { try { await portfolioChangePassword(document.getElementById("portfolioOldPassword").value, document.getElementById("portfolioNewPassword").value); portfolioUiStatus("Heslo bylo změněno."); } catch (error) { portfolioUiStatus(error.message, true); } });
  document.getElementById("portfolioExportBtn").addEventListener("click", async () => {
    const password = prompt("Heslo pro zašifrovanou zálohu:");
    if (!password) return;
    try {
      const backup = await portfolioExportEncrypted(password);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `portfolio-${todayInputValue()}.encrypted.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      portfolioUiStatus(error.message, true);
    }
  });
  document.getElementById("portfolioImportBackupBtn").addEventListener("click", async () => {
    const file = document.getElementById("portfolioBackupFile").files[0];
    if (!file) return;
    const password = prompt("Heslo zálohy:");
    if (!password) return;
    const merge = document.getElementById("portfolioBackupMode").value === "merge";
    try {
      await portfolioImportEncrypted(password, JSON.parse(await file.text()), merge);
      portfolioRender();
      portfolioUiStatus("Záloha byla importována.");
    } catch (error) {
      portfolioUiStatus(error.message, true);
    }
  });
  document.getElementById("portfolioCloseDetailBtn").addEventListener("click", () => { document.getElementById("portfolioDetailCard").hidden = true; });
  document.getElementById("portfolioChartType").addEventListener("change", () => {
    const state = portfolioGetState();
    const asset = state.assets.find((item) => item.id === portfolioDetailAssetId);
    const history = state.priceCache?.[portfolioDetailAssetId]?.history;
    if (asset && history) portfolioRenderChart(asset, history);
  });
  document.getElementById("portfolioTradingViewConsentBtn").addEventListener("click", portfolioLoadTradingViewWidget);
});
