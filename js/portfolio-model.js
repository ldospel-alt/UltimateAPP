function portfolioTradeHash(trade) {
  return portfolioTradeDedupKey(trade, trade.importSymbol || trade.assetId);
}

function portfolioTradeDedupKey(trade, symbol) {
  const normalizeNumber = (value, precision) => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? Number(number.toFixed(precision)).toString() : "";
  };
  return [
    String(trade.date || "").trim(),
    String(symbol || "").trim().toLocaleLowerCase("cs"),
    String(trade.type || "").trim().toLocaleLowerCase("cs"),
    normalizeNumber(trade.qty, 8),
    normalizeNumber(trade.price, 4),
    String(trade.currency || "").trim().toUpperCase(),
  ].join("|");
}

const PORTFOLIO_CRYPTO_SYMBOLS = Object.freeze({
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  LTC: "litecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  USDT: "tether",
  USDC: "usd-coin",
  BNB: "binancecoin",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  BCH: "bitcoin-cash",
  XLM: "stellar",
  TRX: "tron",
  SHIB: "shiba-inu",
});

function portfolioCryptoMetadata(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  const priceSymbol = PORTFOLIO_CRYPTO_SYMBOLS[normalized];
  return priceSymbol ? { symbol: normalized, priceSymbol } : null;
}

function portfolioMigrateKnownCryptoAssets(state) {
  let changed = false;
  const resetPriceCacheIds = [];
  const migrateQuoteCurrency = Number(state.migrations?.cryptoQuoteCurrency || 0) < 1;
  const assets = (state.assets || []).map((asset) => {
    const crypto = portfolioCryptoMetadata(asset.symbol);
    if (!crypto) return asset;
    const genericPriceSymbol = !asset.priceSymbol || String(asset.priceSymbol).toUpperCase() === crypto.symbol;
    const needsMigration = asset.type !== "crypto" || (asset.priceSource === "twelveData" && genericPriceSymbol);
    const needsQuoteCurrency = migrateQuoteCurrency && String(asset.currency).toUpperCase() === "CZK";
    if (!needsMigration && !needsQuoteCurrency) return asset;
    changed = true;
    resetPriceCacheIds.push(asset.id);
    return {
      ...asset,
      type: "crypto",
      currency: needsQuoteCurrency ? "USD" : asset.currency,
      priceSource: "coingecko",
      priceSymbol: crypto.priceSymbol,
    };
  });
  if (migrateQuoteCurrency) changed = true;
  const priceCache = { ...(state.priceCache || {}) };
  resetPriceCacheIds.forEach((id) => delete priceCache[id]);
  return {
    state: changed ? { ...state, assets, priceCache, migrations: { ...(state.migrations || {}), cryptoQuoteCurrency: 1 } } : state,
    changed,
  };
}

function portfolioCalculatePositions(assets, trades, prices = {}, fxCache = {}) {
  const positions = new Map(assets.map((asset) => [asset.id, {
    asset, quantity: 0, costCzk: 0, investedCzk: 0, averagePriceCzk: 0, realizedCzk: 0, dividendsCzk: 0, feesCzk: 0, currencyErrors: [],
  }]));
  trades.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((trade) => {
    const position = positions.get(trade.assetId);
    if (!position) return;
    const qty = Number(trade.qty || 0);
    const tradeCurrency = trade.currency || position.asset.currency || "CZK";
    const priceCzk = portfolioConvertCurrency(Number(trade.price || 0), tradeCurrency, "CZK", fxCache);
    const feeCzk = portfolioConvertCurrency(Number(trade.fee || 0), tradeCurrency, "CZK", fxCache);
    if (priceCzk === null || feeCzk === null) {
      if (!position.currencyErrors.includes(tradeCurrency)) position.currencyErrors.push(tradeCurrency);
      return;
    }
    if (trade.type === "buy") {
      const purchaseCostCzk = qty * priceCzk + feeCzk;
      position.costCzk += purchaseCostCzk;
      position.investedCzk += purchaseCostCzk;
      position.quantity += qty;
      position.averagePriceCzk = position.quantity ? position.costCzk / position.quantity : 0;
    } else if (trade.type === "sell") {
      const sold = Math.min(qty, position.quantity);
      position.realizedCzk += sold * priceCzk - sold * position.averagePriceCzk - feeCzk;
      position.quantity -= sold;
      position.costCzk = position.quantity * position.averagePriceCzk;
      if (!position.quantity) position.averagePriceCzk = 0;
    } else if (trade.type === "dividend") {
      position.dividendsCzk += priceCzk;
    } else if (trade.type === "fee") {
      const amountCzk = feeCzk || priceCzk;
      position.feesCzk += amountCzk;
      position.realizedCzk -= amountCzk;
    }
  });
  return Array.from(positions.values()).map((position) => {
    const quote = prices[position.asset.id] || {};
    const assetCurrency = String(position.asset.currency || "CZK").toUpperCase();
    const quotedAssetPrice = quote.prices?.[assetCurrency] ?? quote.price;
    const quotedCzkPrice = quote.prices?.CZK;
    let currentPrice = Number.isFinite(Number(quotedAssetPrice)) ? Number(quotedAssetPrice) : null;
    let currentPriceCzk = Number.isFinite(Number(quotedCzkPrice)) ? Number(quotedCzkPrice) : null;
    if (currentPriceCzk === null && currentPrice !== null) currentPriceCzk = portfolioConvertCurrency(currentPrice, assetCurrency, "CZK", fxCache);
    if (currentPrice === null && currentPriceCzk !== null) currentPrice = portfolioConvertCurrency(currentPriceCzk, "CZK", assetCurrency, fxCache);
    const averagePrice = portfolioConvertCurrency(position.averagePriceCzk, "CZK", assetCurrency, fxCache);
    const cost = portfolioConvertCurrency(position.costCzk, "CZK", assetCurrency, fxCache);
    const realized = portfolioConvertCurrency(position.realizedCzk, "CZK", assetCurrency, fxCache);
    const dividends = portfolioConvertCurrency(position.dividendsCzk, "CZK", assetCurrency, fxCache);
    const fees = portfolioConvertCurrency(position.feesCzk, "CZK", assetCurrency, fxCache);
    const valueCzk = position.quantity === 0 ? 0 : currentPriceCzk === null ? null : position.quantity * currentPriceCzk;
    const value = position.quantity === 0 ? 0 : currentPrice === null ? null : position.quantity * currentPrice;
    const unrealizedCzk = valueCzk === null ? null : valueCzk - position.costCzk;
    const unrealized = portfolioConvertCurrency(unrealizedCzk, "CZK", assetCurrency, fxCache);
    const profitCzk = unrealizedCzk === null ? null : unrealizedCzk + position.realizedCzk + position.dividendsCzk;
    const profit = portfolioConvertCurrency(profitCzk, "CZK", assetCurrency, fxCache);
    const profitPercent = profitCzk === null || !position.investedCzk ? null : profitCzk / position.investedCzk * 100;
    return {
      ...position,
      cost,
      averagePrice,
      realized,
      dividends,
      fees,
      currentPrice,
      currentPriceCzk,
      value,
      valueCzk,
      unrealized,
      unrealizedCzk,
      profit,
      profitCzk,
      profitPercent,
    };
  });
}

function portfolioTotalsByCurrency(positions) {
  return positions.reduce((totals, position) => {
    const currency = position.asset.currency || "—";
    const current = totals[currency] || { value: 0, cost: 0, realized: 0, dividends: 0 };
    current.value += position.value || 0;
    current.cost += position.cost;
    current.realized += position.realized;
    current.dividends += position.dividends;
    totals[currency] = current;
    return totals;
  }, {});
}

function portfolioRateToCzk(currency, fxCache) {
  const normalized = String(currency || "").toUpperCase();
  if (normalized === "CZK") return 1;
  const rate = Number(fxCache?.rates?.[normalized]);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function portfolioConvertCurrency(value, fromCurrency, toCurrency, fxCache) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const from = String(fromCurrency || "").toUpperCase();
  const to = String(toCurrency || "").toUpperCase();
  if (!from || !to) return null;
  if (from === to) return Number(value);
  const fromRate = portfolioRateToCzk(from, fxCache);
  const toRate = portfolioRateToCzk(to, fxCache);
  return fromRate === null || toRate === null ? null : Number(value) * fromRate / toRate;
}

function portfolioConvertToCzk(value, currency, fxCache) {
  return portfolioConvertCurrency(value, currency, "CZK", fxCache);
}

function portfolioCzkSummary(positions, fxCache) {
  let value = 0;
  const missingCurrencies = new Set();
  const missingPrices = new Set();
  positions.forEach((position) => {
    position.currencyErrors.forEach((currency) => missingCurrencies.add(currency));
    if (position.quantity <= 0) return;
    if (position.valueCzk !== null && Number.isFinite(Number(position.valueCzk))) {
      value += Number(position.valueCzk);
      return;
    }
    if (position.value === null) {
      missingPrices.add(position.asset.symbol);
      return;
    }
    const converted = portfolioConvertToCzk(position.value, position.asset.currency, fxCache);
    if (converted === null) {
      missingCurrencies.add(position.asset.currency || "—");
      return;
    }
    value += converted;
  });
  const complete = missingCurrencies.size === 0 && missingPrices.size === 0;
  return {
    value: complete ? value : null,
    missingCurrencies: Array.from(missingCurrencies).sort(),
    missingPrices: Array.from(missingPrices).sort(),
  };
}

function portfolioBuildTransactionHistory(trades, assetId, currency = null, fxCache = {}) {
  const grouped = new Map();
  trades.filter((trade) => trade.assetId === assetId && ["buy", "sell"].includes(trade.type) && trade.date)
    .forEach((trade) => {
      const originalPrice = Number(trade.price);
      const price = currency
        ? portfolioConvertCurrency(originalPrice, trade.currency || currency, currency, fxCache)
        : originalPrice;
      const qty = Math.abs(Number(trade.qty || 0));
      if (!Number.isFinite(price)) return;
      const current = grouped.get(trade.date) || { weightedPrice: 0, quantity: 0, lastPrice: price };
      current.weightedPrice += price * (qty || 1);
      current.quantity += qty || 1;
      current.lastPrice = price;
      grouped.set(trade.date, current);
    });
  return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([time, item]) => {
    const close = item.quantity ? item.weightedPrice / item.quantity : item.lastPrice;
    return { time, open: close, high: close, low: close, close };
  });
}

function portfolioBuildTradeMarkers(trades, assetId, availableDates) {
  const dates = Array.from(new Set(availableDates)).sort();
  if (!dates.length) return [];
  return trades.filter((trade) =>
    trade.assetId === assetId &&
    ["buy", "sell"].includes(trade.type) &&
    trade.date >= dates[0] &&
    trade.date <= dates.at(-1))
    .map((trade) => ({
      time: dates.find((date) => date >= trade.date) || dates.at(-1),
      originalDate: trade.date,
      type: trade.type,
      qty: Number(trade.qty || 0),
      price: Number(trade.price || 0),
      currency: trade.currency || "",
    }))
    .filter((marker) => marker.time)
    .sort((left, right) => left.time.localeCompare(right.time) || left.originalDate.localeCompare(right.originalDate));
}

function portfolioFilterHistoryRange(history, range, trades, assetId, now = new Date()) {
  if (!Array.isArray(history) || !history.length) return [];
  const latestHistoryDate = new Date(`${history.at(-1).time}T00:00:00Z`);
  const anchor = latestHistoryDate > now ? now : latestHistoryDate;
  let cutoff = null;
  if (range === "30" || range === "90" || range === "365") {
    cutoff = new Date(anchor);
    cutoff.setUTCDate(cutoff.getUTCDate() - Number(range));
  } else if (range === "all") {
    const firstTrade = trades.filter((trade) => trade.assetId === assetId && trade.date)
      .map((trade) => trade.date).sort()[0];
    if (firstTrade) cutoff = new Date(`${firstTrade}T00:00:00Z`);
  }
  if (!cutoff) return history.slice();
  const cutoffValue = cutoff.toISOString().slice(0, 10);
  return history.filter((item) => item.time >= cutoffValue);
}

function portfolioHeldQuantity(assetId, trades) {
  return trades.filter((trade) => trade.assetId === assetId).reduce((quantity, trade) => {
    if (trade.type === "buy") return quantity + Number(trade.qty || 0);
    if (trade.type === "sell") return quantity - Number(trade.qty || 0);
    return quantity;
  }, 0);
}

function portfolioSma(values, period) {
  if (values.length < period) return null;
  return values.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}

function portfolioEma(values, period) {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const output = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    output.push((values[index] - output[index - 1]) * multiplier + output[index - 1]);
  }
  return output;
}

function portfolioRsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  if (!losses) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function portfolioTechnicalRating(history) {
  const closes = history.map((item) => Number(item.close)).filter(Number.isFinite);
  if (closes.length < 15) return { score: 0, label: "Nedostatek dat", indicators: {} };
  const current = closes.at(-1);
  const sma20 = portfolioSma(closes, 20);
  const sma50 = portfolioSma(closes, 50);
  const sma200 = portfolioSma(closes, 200);
  const ema12 = portfolioEma(closes, 12);
  const ema26 = portfolioEma(closes, 26);
  const macd = ema12.at(-1) - ema26.at(-1);
  const rsi = portfolioRsi(closes);
  let score = 0;
  [sma20, sma50, sma200].forEach((average) => {
    if (average !== null) score += current >= average ? 1 : -1;
  });
  score += macd >= 0 ? 1 : -1;
  if (rsi !== null) score += rsi < 30 ? 1 : rsi > 70 ? -1 : 0;
  const label = score >= 4 ? "Strong buy" : score >= 2 ? "Buy" : score <= -4 ? "Strong sell" : score <= -2 ? "Sell" : "Neutral";
  return { score, label, indicators: { rsi, macd, sma20, sma50, sma200 } };
}
