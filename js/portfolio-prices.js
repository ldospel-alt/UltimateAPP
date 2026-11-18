function portfolioPriceSettings(state) {
  return state.settings?.apiKeys || {};
}

async function portfolioFetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, cache: "no-store" });
  if (!response.ok) {
    const retryAfter = response.headers.get("Retry-After");
    throw new Error(response.status === 429 ? `Limit API byl vyčerpán${retryAfter ? `, zkus to za ${retryAfter} s` : ""}.` : `Cenové API vrátilo ${response.status}.`);
  }
  return response.json();
}

function portfolioNormalizeHistory(history) {
  const byDate = new Map();
  (history || []).forEach((item) => {
    if (!item?.time || !Number.isFinite(Number(item.close))) return;
    byDate.set(item.time, item);
  });
  return Array.from(byDate.values()).sort((left, right) => left.time.localeCompare(right.time));
}

const PortfolioPriceAdapters = {
  coingecko: {
    async getQuote(asset, settings) {
      const id = asset.priceSymbol || asset.symbol.toLocaleLowerCase();
      const currency = (asset.currency || "usd").toLocaleLowerCase();
      const currencies = Array.from(new Set([currency, "czk", "usd"]));
      const options = settings.coingecko ? { headers: { "x-cg-demo-api-key": settings.coingecko } } : {};
      const data = await portfolioFetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${currencies.map(encodeURIComponent).join(",")}`, options);
      const prices = Object.fromEntries(currencies.map((code) => [code.toUpperCase(), Number(data[id]?.[code])]).filter(([, value]) => Number.isFinite(value)));
      return { price: prices[currency.toUpperCase()], prices };
    },
    async getHistory(asset, settings, days = 365) {
      const id = asset.priceSymbol || asset.symbol.toLocaleLowerCase();
      const currency = (asset.currency || "usd").toLocaleLowerCase();
      const options = settings.coingecko ? { headers: { "x-cg-demo-api-key": settings.coingecko } } : {};
      const data = await portfolioFetchJson(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=${encodeURIComponent(currency)}&days=${days}&interval=daily`, options);
      return portfolioNormalizeHistory((data.prices || []).map(([time, close]) => ({ time: new Date(time).toISOString().slice(0, 10), close })));
    },
  },
  twelveData: {
    async getQuote(asset, settings) {
      if (!settings.twelveData) throw new Error("Chybí API klíč Twelve Data.");
      const data = await portfolioFetchJson(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(asset.priceSymbol || asset.symbol)}&apikey=${encodeURIComponent(settings.twelveData)}`);
      if (data.status === "error") throw new Error(data.message);
      return Number(data.price);
    },
    async getHistory(asset, settings) {
      if (!settings.twelveData) throw new Error("Chybí API klíč Twelve Data.");
      const data = await portfolioFetchJson(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(asset.priceSymbol || asset.symbol)}&interval=1day&outputsize=5000&apikey=${encodeURIComponent(settings.twelveData)}`);
      if (data.status === "error") throw new Error(data.message);
      return portfolioNormalizeHistory((data.values || []).map((item) => ({ time: item.datetime, open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close) })));
    },
  },
  finnhub: {
    async getQuote(asset, settings) {
      if (!settings.finnhub) throw new Error("Chybí API klíč Finnhub.");
      const data = await portfolioFetchJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(asset.priceSymbol || asset.symbol)}&token=${encodeURIComponent(settings.finnhub)}`);
      return Number(data.c);
    },
    async getHistory() {
      throw new Error("Historie Finnhub vyžaduje placený nebo kompatibilní endpoint; použij Twelve Data.");
    },
  },
};

function portfolioAdapterFor(asset) {
  return PortfolioPriceAdapters[asset.priceSource || (asset.type === "crypto" ? "coingecko" : "twelveData")];
}

function portfolioPriceSourceLabel(asset) {
  return {
    coingecko: "CoinGecko",
    twelveData: "Twelve Data",
    finnhub: "Finnhub",
  }[asset.priceSource || (asset.type === "crypto" ? "coingecko" : "twelveData")] || "neznámý zdroj";
}

async function portfolioUpdatePrices(state, onProgress = () => {}) {
  const settings = portfolioPriceSettings(state);
  const next = { ...state, priceCache: { ...(state.priceCache || {}) } };
  const errors = [];
  for (let index = 0; index < state.assets.length; index += 1) {
    const asset = state.assets[index];
    onProgress(asset, index + 1, state.assets.length);
    try {
      const quote = await portfolioAdapterFor(asset).getQuote(asset, settings);
      const price = typeof quote === "object" && quote !== null ? Number(quote.price) : Number(quote);
      if (!Number.isFinite(price)) throw new Error("API nevrátilo platnou cenu.");
      next.priceCache[asset.id] = {
        ...(next.priceCache[asset.id] || {}),
        price,
        prices: typeof quote === "object" && quote !== null ? quote.prices : { [String(asset.currency || "").toUpperCase()]: price },
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      errors.push(`${asset.symbol} (${portfolioPriceSourceLabel(asset)}): ${error.message}`);
    }
    if (index < state.assets.length - 1) await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return { state: next, errors };
}

async function portfolioUpdateFxRates(state) {
  const currencies = Array.from(new Set([
    ...(state.assets || []).map((asset) => String(asset.currency || "").toUpperCase()),
    ...(state.trades || []).map((trade) => String(trade.currency || "").toUpperCase()),
  ]
    .filter((currency) => currency && currency !== "CZK")));
  const rates = { CZK: 1 };
  if (currencies.length) {
    const data = await portfolioFetchJson(`https://api.frankfurter.dev/v2/rates?base=CZK&quotes=${currencies.map(encodeURIComponent).join(",")}`);
    currencies.forEach((currency) => {
      const inverseRate = Number(data.find((item) => item.quote === currency)?.rate);
      if (!Number.isFinite(inverseRate) || inverseRate <= 0) throw new Error(`Kurz ${currency}/CZK není dostupný.`);
      rates[currency] = 1 / inverseRate;
    });
    return {
      ...state,
      fxCache: { base: "CZK", rates, updatedAt: new Date().toISOString(), sourceDate: data[0]?.date || "" },
    };
  }
  return {
    ...state,
    fxCache: { base: "CZK", rates, updatedAt: new Date().toISOString(), sourceDate: new Date().toISOString().slice(0, 10) },
  };
}

function portfolioHistoryRequest(state, asset, range, now = new Date()) {
  const fixedDays = { "30": 30, "90": 90, "365": 365 };
  let requestedDays = fixedDays[range] || 365;
  if (range === "all") {
    const firstTrade = (state.trades || []).filter((trade) => trade.assetId === asset.id && trade.date)
      .map((trade) => trade.date).sort()[0];
    requestedDays = firstTrade
      ? Math.max(1, Math.ceil((now - new Date(`${firstTrade}T00:00:00Z`)) / 86400000) + 1)
      : 365;
  }
  const source = asset.priceSource || (asset.type === "crypto" ? "coingecko" : "twelveData");
  const limited = source === "coingecko" && !portfolioPriceSettings(state).coingecko && requestedDays > 365;
  return { days: limited ? 365 : requestedDays, limited };
}

async function portfolioLoadHistory(state, asset, days = 365) {
  const currency = String(asset.currency || "CZK").toUpperCase();
  const cached = state.priceCache?.[asset.id]?.historyByCurrency?.[currency] ||
    (currency === String(state.assets?.find((item) => item.id === asset.id)?.currency || "").toUpperCase()
      ? state.priceCache?.[asset.id]?.history
      : null);
  try {
    const history = await portfolioAdapterFor(asset).getHistory(asset, portfolioPriceSettings(state), days);
    return { history, cached: false };
  } catch (error) {
    if (Array.isArray(cached) && cached.length) return { history: cached, cached: true, error: error.message };
    const fallback = portfolioBuildTransactionHistory(state.trades || [], asset.id, currency, state.fxCache);
    if (fallback.length) return { history: fallback, cached: false, fallback: true, error: error.message };
    throw error;
  }
}
