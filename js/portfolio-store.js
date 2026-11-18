const PORTFOLIO_DB_NAME = "gym_portfolio";
const PORTFOLIO_DB_VERSION = 1;
const PORTFOLIO_STORE = "encrypted";
const PORTFOLIO_META_ID = "vault";
const PORTFOLIO_AUTO_LOCK_MS = 5 * 60 * 1000;

let portfolioSessionKey = null;
let portfolioState = null;
let portfolioLockTimer = null;
let portfolioLockHandler = null;

function portfolioDefaultState() {
  return {
    version: 1,
    migrations: { cryptoQuoteCurrency: 1 },
    assets: [],
    trades: [],
    brokerProfiles: portfolioDefaultBrokerProfiles(),
    settings: { baseCurrency: "CZK", hideAmounts: false, tradingViewConsent: false, apiKeys: { twelveData: "", finnhub: "", coingecko: "" } },
    priceCache: {},
    fxCache: { base: "CZK", rates: { CZK: 1 }, updatedAt: "", sourceDate: "" },
  };
}

function portfolioOpenDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PORTFOLIO_DB_NAME, PORTFOLIO_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PORTFOLIO_STORE)) {
        request.result.createObjectStore(PORTFOLIO_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function portfolioDbGet(id) {
  const db = await portfolioOpenDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(PORTFOLIO_STORE).objectStore(PORTFOLIO_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

async function portfolioDbPut(value) {
  const db = await portfolioOpenDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PORTFOLIO_STORE, "readwrite");
    transaction.objectStore(PORTFOLIO_STORE).put(value);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => db.close());
}

async function portfolioHasVault() {
  return Boolean(await portfolioDbGet(PORTFOLIO_META_ID));
}

async function portfolioSetup(password) {
  const vault = await portfolioCreateVault(password, portfolioDefaultState());
  await portfolioDbPut({
    id: PORTFOLIO_META_ID,
    version: vault.version,
    iterations: vault.iterations,
    salt: vault.salt,
    verifier: vault.verifier,
    payload: vault.payload,
  });
  portfolioSessionKey = vault.key;
  portfolioState = portfolioDefaultState();
  portfolioTouch();
  return portfolioState;
}

async function portfolioUnlock(password) {
  const vault = await portfolioDbGet(PORTFOLIO_META_ID);
  if (!vault) throw new Error("Portfolio ještě nemá nastavené heslo.");
  const unlocked = await portfolioUnlockVault(password, vault);
  portfolioSessionKey = unlocked.key;
  portfolioState = unlocked.state;
  portfolioTouch();
  return portfolioState;
}

function portfolioGetState() {
  if (!portfolioSessionKey || !portfolioState) throw new Error("Portfolio je zamčené.");
  return portfolioState;
}

async function portfolioSaveState(nextState = portfolioState) {
  if (!portfolioSessionKey) throw new Error("Portfolio je zamčené.");
  const current = await portfolioDbGet(PORTFOLIO_META_ID);
  const payload = await portfolioEncrypt(portfolioSessionKey, nextState);
  await portfolioDbPut({ ...current, id: PORTFOLIO_META_ID, payload });
  portfolioState = nextState;
  portfolioTouch();
}

async function portfolioChangePassword(oldPassword, newPassword) {
  const current = await portfolioDbGet(PORTFOLIO_META_ID);
  const changed = await portfolioChangeVaultPassword(oldPassword, newPassword, current);
  await portfolioDbPut({
    id: PORTFOLIO_META_ID,
    version: changed.version,
    iterations: changed.iterations,
    salt: changed.salt,
    verifier: changed.verifier,
    payload: changed.payload,
  });
  portfolioSessionKey = changed.key;
  portfolioState = changed.state;
  portfolioTouch();
}

function portfolioSetLockHandler(handler) {
  portfolioLockHandler = handler;
}

function portfolioTouch() {
  clearTimeout(portfolioLockTimer);
  if (!portfolioSessionKey) return;
  portfolioLockTimer = setTimeout(() => portfolioLock("Portfolio bylo automaticky zamčeno."), PORTFOLIO_AUTO_LOCK_MS);
}

function portfolioLock(message = "") {
  clearTimeout(portfolioLockTimer);
  portfolioSessionKey = null;
  portfolioState = null;
  portfolioLockHandler?.(message);
}

async function portfolioExportEncrypted(password) {
  return portfolioExportBackup(password, portfolioGetState());
}

async function portfolioImportEncrypted(password, backup, merge = false) {
  const imported = (await portfolioImportBackup(password, backup)).state;
  const next = merge ? portfolioMergeStates(portfolioGetState(), imported) : imported;
  await portfolioSaveState(next);
  return next;
}

function portfolioMergeStates(current, imported) {
  const unique = (left, right) => {
    const map = new Map(left.map((item) => [item.id, item]));
    right.forEach((item) => map.set(item.id, item));
    return Array.from(map.values());
  };
  return {
    ...current,
    ...imported,
    assets: unique(current.assets || [], imported.assets || []),
    trades: unique(current.trades || [], imported.trades || []),
    brokerProfiles: unique(current.brokerProfiles || [], imported.brokerProfiles || []),
    settings: { ...current.settings, ...imported.settings, apiKeys: { ...current.settings?.apiKeys, ...imported.settings?.apiKeys } },
    priceCache: { ...current.priceCache, ...imported.priceCache },
  };
}
