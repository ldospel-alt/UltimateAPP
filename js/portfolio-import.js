function portfolioDefaultBrokerProfiles() {
  return [
    {
      id: "generic",
      name: "Obecný CSV vzor",
      mapping: { date: "Datum", symbol: "Symbol", operation: "Typ", qty: "Množství", price: "Cena", fee: "Poplatek", currency: "Měna" },
      operationMap: {},
    },
    {
      id: "trading212-sample",
      name: "Trading 212 – vzor (zkontroluj sloupce)",
      mapping: { date: "Time", symbol: "Ticker", operation: "Action", qty: "No. of shares", price: "Price / share", fee: "Transaction fee", currency: "Currency (Price / share)" },
      operationMap: {},
    },
    {
      id: "xtb-degiro-sample",
      name: "XTB / DEGIRO – vzor (uprav podle reportu)",
      mapping: { date: "Datum", symbol: "Produkt", operation: "Typ", qty: "Počet", price: "Kurz", fee: "Poplatek", currency: "Měna" },
      operationMap: {},
    },
  ];
}

function portfolioDetectDelimiter(text) {
  const line = text.split(/\r?\n/).find((value) => value.trim()) || "";
  const candidates = [",", ";", "\t"];
  return candidates.sort((left, right) => portfolioCountDelimiter(line, right) - portfolioCountDelimiter(line, left))[0];
}

function portfolioCountDelimiter(line, delimiter) {
  let count = 0;
  let quoted = false;
  for (const character of line) {
    if (character === '"') quoted = !quoted;
    else if (!quoted && character === delimiter) count += 1;
  }
  return count;
}

function portfolioParseCsv(text, delimiter = portfolioDetectDelimiter(text)) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) return { delimiter, headers: [], rows: [] };
  const [headers, ...data] = rows;
  return {
    delimiter,
    headers,
    rows: data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))),
  };
}

async function portfolioReadCsvFile(file) {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  try {
    return utf8.decode(buffer);
  } catch {
    return new TextDecoder("windows-1250").decode(buffer);
  }
}

function portfolioParseNumber(value) {
  const text = String(value ?? "").replace(/\u00a0|\s/g, "");
  if (!text) return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let normalized = text;
  if (lastComma > lastDot) normalized = text.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma) normalized = text.replace(/,/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function portfolioParseDate(value) {
  const input = String(value || "").trim();
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  const european = input.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s.*)?$/);
  const parts = iso ? [iso[1], iso[2], iso[3]] : european ? [european[3], european[2].padStart(2, "0"), european[1].padStart(2, "0")] : null;
  if (!parts) return null;
  const date = new Date(`${parts.join("-")}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== parts.join("-") ? null : parts.join("-");
}

function portfolioNormalizeOperation(value, customMap = {}) {
  const key = String(value || "").trim().toLocaleLowerCase("cs");
  const defaults = {
    buy: "buy", nákup: "buy", koupě: "buy",
    sell: "sell", prodej: "sell",
    dividend: "dividend", dividenda: "dividend",
    fee: "fee", poplatek: "fee",
  };
  return customMap[key] || defaults[key] || null;
}

function portfolioMapCsvRows(parsed, profile, assets, existingTrades, operationMap = {}) {
  const assetBySymbol = new Map(assets.map((asset) => [asset.symbol.toLocaleLowerCase("cs"), asset]));
  const symbolByAssetId = new Map(assets.map((asset) => [asset.id, asset.symbol]));
  const existingCounts = new Map();
  existingTrades.forEach((trade) => {
    const key = trade.dedupKey || portfolioTradeDedupKey(trade, trade.importSymbol || symbolByAssetId.get(trade.assetId) || trade.assetId);
    existingCounts.set(key, (existingCounts.get(key) || 0) + 1);
  });
  const incomingCounts = new Map();
  const summary = { valid: [], duplicates: [], invalid: [] };
  parsed.rows.forEach((row, index) => {
    const symbol = String(row[profile.mapping.symbol] || "").trim();
    const date = portfolioParseDate(row[profile.mapping.date]);
    const type = portfolioNormalizeOperation(row[profile.mapping.operation], operationMap);
    const qty = portfolioParseNumber(row[profile.mapping.qty]);
    const price = portfolioParseNumber(row[profile.mapping.price]);
    const fee = portfolioParseNumber(row[profile.mapping.fee]) || 0;
    if (!date || !symbol || !type || ((type === "buy" || type === "sell") && (!Number.isFinite(qty) || !Number.isFinite(price)))) {
      summary.invalid.push({ index: index + 2, row });
      return;
    }
    const asset = assetBySymbol.get(symbol.toLocaleLowerCase("cs"));
    const trade = {
      id: Storage.uid(),
      assetId: asset?.id || "",
      pendingSymbol: asset ? "" : symbol,
      importSymbol: symbol,
      date,
      type,
      qty: qty || 0,
      price: price || 0,
      fee,
      currency: String(row[profile.mapping.currency] || asset?.currency || "").trim().toUpperCase(),
      note: "",
      source: `csv:${profile.name}`,
    };
    trade.dedupKey = portfolioTradeDedupKey(trade, symbol);
    trade.importHash = trade.dedupKey;
    const incomingIndex = incomingCounts.get(trade.dedupKey) || 0;
    incomingCounts.set(trade.dedupKey, incomingIndex + 1);
    if (incomingIndex < (existingCounts.get(trade.dedupKey) || 0)) summary.duplicates.push(trade);
    else summary.valid.push(trade);
  });
  return summary;
}
