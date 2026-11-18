const PORTFOLIO_KDF_ITERATIONS = 310000;
const PORTFOLIO_VERIFIER = "gym-portfolio-unlocked-v1";

function portfolioBytesToBase64(bytes) {
  let binary = "";
  new Uint8Array(bytes).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function portfolioBase64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function portfolioDeriveKey(password, salt, iterations = PORTFOLIO_KDF_ITERATIONS) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function portfolioEncrypt(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv: portfolioBytesToBase64(iv), ciphertext: portfolioBytesToBase64(ciphertext) };
}

async function portfolioDecrypt(key, encrypted) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: portfolioBase64ToBytes(encrypted.iv) },
    key,
    portfolioBase64ToBytes(encrypted.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function portfolioCreateVault(password, state) {
  if (password.length < 8) throw new Error("Heslo musí mít alespoň 8 znaků.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await portfolioDeriveKey(password, salt);
  return {
    version: 1,
    iterations: PORTFOLIO_KDF_ITERATIONS,
    salt: portfolioBytesToBase64(salt),
    verifier: await portfolioEncrypt(key, PORTFOLIO_VERIFIER),
    payload: await portfolioEncrypt(key, state),
    key,
  };
}

async function portfolioUnlockVault(password, vault) {
  const key = await portfolioDeriveKey(password, portfolioBase64ToBytes(vault.salt), vault.iterations);
  const verifier = await portfolioDecrypt(key, vault.verifier);
  if (verifier !== PORTFOLIO_VERIFIER) throw new Error("Nesprávné heslo.");
  return { key, state: await portfolioDecrypt(key, vault.payload) };
}

async function portfolioChangeVaultPassword(oldPassword, newPassword, vault) {
  const unlocked = await portfolioUnlockVault(oldPassword, vault);
  const changed = await portfolioCreateVault(newPassword, unlocked.state);
  return { ...changed, state: unlocked.state };
}

async function portfolioExportBackup(password, state) {
  const vault = await portfolioCreateVault(password, state);
  return {
    app: "gym-portfolio",
    version: vault.version,
    exportedAt: new Date().toISOString(),
    iterations: vault.iterations,
    salt: vault.salt,
    verifier: vault.verifier,
    payload: vault.payload,
  };
}

async function portfolioImportBackup(password, backup) {
  if (backup?.app !== "gym-portfolio" || !backup.payload || !backup.verifier) {
    throw new Error("Soubor není platná záloha Portfolia.");
  }
  return portfolioUnlockVault(password, backup);
}
