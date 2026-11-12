# SaberAcademy – zápis turnajů do GitHubu

Výsledky jsou veřejné JSON soubory v `data/saberacademy/tournaments/`. Číst je může každý; zapisovat může jen trenér s GitHub tokenem s právem zápisu do tohoto repozitáře.

## Trenérský GitHub token

1. Na GitHubu otevři **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Vytvoř token omezený jen na repozitář `ldospel-alt/UltimateAPP`.
3. V oprávnění **Repository permissions** nastav **Contents: Read and write**.
4. Zkopíruj token. V Turnajích nejprve zvol **Zapisovat (trenér)**, potom do pole vlož token a zvol **Nastavit GitHub token**.

Token zůstane pouze v `localStorage` daného zařízení. Aplikace jej nikdy nevkládá do repozitáře ani do exportu zálohy. Kdokoli s tokenem může zapisovat do repozitáře v rozsahu jeho oprávnění, proto jej nikomu nesdílej a při ztrátě jej okamžitě zruš.

## Trenérský kód

Výchozí kód je `SaberAdmin`. Je pouze klientská brána uživatelského rozhraní; skutečná autorizace zápisu je GitHub token. V produkci ho změň: vytvoř SHA-256 hash nového kódu a nahraď hodnotu `COACH_CODE_HASH` v `js/saberacademy-tournaments.js`.

V PowerShellu vytvoříš hash například:

```powershell
$h = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes("NovyKod"))
-join ($h | ForEach-Object { $_.ToString("x2") })
```

Po změně JavaScriptu zvyš verzi cache v `service-worker.js`.
