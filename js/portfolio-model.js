function portfolioTradeHash(trade) {
  return [trade.date, trade.importSymbol || trade.assetId, trade.type, trade.qty, trade.price, trade.fee, trade.currency].join("|").toLocaleLowerCase("cs");
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
  const assets = (state.assets || []).map((asset) => {
    const crypto = portfolioCryptoMetadata(asset.symbol);
    if (!crypto) return asset;
    const genericPriceSymbol = !asset.priceSymbol || String(asset.priceSymbol).toUpperCase() === crypto.symbol;
    const needsMigration = asset.type !== "crypto" || (asset.priceSource === "twelveData" && genericPriceSymbol);
    if (!needsMigration) return asset;
    changed = true;
    return { ...asset, type: "crypto", priceSource: "coingecko", priceSymbol: crypto.priceSymbol };
  });
  return { state: changed ? { ...state, assets } : state, changed };
}

function portfolioCalculatePositions(assets, trades, prices = {}) {
  const positions = new Map(assets.map((asset) => [asset.id, {
    asset, quantity: 0, cost: 0, averagePrice: 0, realized: 0, dividends: 0, fees: 0,
  }]));
  trades.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((trade) => {
    const position = positions.get(trade.assetId);
    if (!position) return;
    const qty = Number(trade.qty || 0);
    const price = Number(trade.price || 0);
    const fee = Number(trade.fee || 0);
    if (trade.type === "buy") {
      position.cost += qty * price + fee;
      position.quantity += qty;
      position.averagePrice = position.quantity ? position.cost / position.quantity : 0;
    } else if (trade.type === "sell") {
      const sold = Math.min(qty, position.quantity);
      position.realized += sold * price - sold * position.averagePrice - fee;
      position.quantity -= sold;
      position.cost = position.quantity * position.averagePrice;
      if (!position.quantity) position.averagePrice = 0;
    } else if (trade.type === "dividend") {
      position.dividends += Number(trade.price || 0);
    } else if (trade.type === "fee") {
      position.fees += fee || price;
      position.realized -= fee || price;
    }
  });
  return Array.from(positions.values()).map((position) => {
    const quote = prices[position.asset.id]?.price;
    const currentPrice = Number.isFinite(Number(quote)) ? Number(quote) : null;
    const value = currentPrice === null ? null : position.quantity * currentPrice;
    return {
      ...position,
      currentPrice,
      value,
      unrealized: value === null ? null : value - position.cost,
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

function portfolioConvertToCzk(value, currency, fxCache) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const rate = portfolioRateToCzk(currency, fxCache);
  return rate === null ? null : Number(value) * rate;
}

function portfolioCzkSummary(positions, fxCache) {
  let value = 0;
  const missingCurrencies = new Set();
  const missingPrices = new Set();
  positions.filter((position) => position.quantity > 0).forEach((position) => {
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
