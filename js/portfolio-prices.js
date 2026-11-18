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

const PortfolioPriceAdapters = {
  coingecko: {
    async getQuote(asset, settings) {
      const id = asset.priceSymbol || asset.symbol.toLocaleLowerCase();
      const currency = (asset.currency || "usd").toLocaleLowerCase();
      const options = settings.coingecko ? { headers: { "x-cg-demo-api-key": settings.coingecko } } : {};
      const data = await portfolioFetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${encodeURIComponent(currency)}`, options);
      return Number(data[id]?.[currency]);
    },
    async getHistory(asset, settings, days = 365) {
      const id = asset.priceSymbol || asset.symbol.toLocaleLowerCase();
      const currency = (asset.currency || "usd").toLocaleLowerCase();
      const options = settings.coingecko ? { headers: { "x-cg-demo-api-key": settings.coingecko } } : {};
      const data = await portfolioFetchJson(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=${encodeURIComponent(currency)}&days=${days}&interval=daily`, options);
      return (data.prices || []).map(([time, close]) => ({ time: new Date(time).toISOString().slice(0, 10), close }));
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
      return (data.values || []).reverse().map((item) => ({ time: item.datetime, open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close) }));
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
      const price = await portfolioAdapterFor(asset).getQuote(asset, settings);
      if (!Number.isFinite(price)) throw new Error("API nevrátilo platnou cenu.");
      next.priceCache[asset.id] = { ...(next.priceCache[asset.id] || {}), price, updatedAt: new Date().toISOString() };
    } catch (error) {
      errors.push(`${asset.symbol} (${portfolioPriceSourceLabel(asset)}): ${error.message}`);
    }
    if (index < state.assets.length - 1) await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return { state: next, errors };
}

async function portfolioUpdateFxRates(state) {
  const currencies = Array.from(new Set((state.assets || [])
    .map((asset) => String(asset.currency || "").toUpperCase())
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

async function portfolioLoadHistory(state, asset) {
  const cached = state.priceCache?.[asset.id]?.history;
  try {
    const history = await portfolioAdapterFor(asset).getHistory(asset, portfolioPriceSettings(state));
    return { history, cached: false };
  } catch (error) {
    if (Array.isArray(cached) && cached.length) return { history: cached, cached: true, error: error.message };
    throw error;
  }
}
