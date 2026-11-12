# SaberAcademy – sdílené výsledky turnajů

Tento Apps Script je společné úložiště pro zapisovatelné turnaje od ročníku 2027. Aplikace čte výsledky veřejně, zápis, úprava a smazání vyžadují trenérský kód ověřovaný na serveru.

1. Vytvoř novou Google tabulku pro výsledky.
2. V tabulce otevři **Rozšíření → Apps Script**, vlož obsah souboru `Code.gs` a ulož ho.
3. V **Nastavení projektu → Vlastnosti skriptu** vytvoř `COACH_CODE` s vlastním silným kódem. Pokud jej nenastavíš, výchozí kód je `SaberAdmin`.
4. Zvol **Nasadit → Nové nasazení → Webová aplikace**. Spouštět jako: ty. Přístup: **Kdokoliv**. Po nasazení zkopíruj URL webové aplikace.
5. V `data/saberacademy/index.xml` vlož URL do atributu `backend` elementu `<tournaments backend="...">`.

List `results` se při prvním použití vytvoří automaticky se sloupci `id, season, type, date, a, b, result, costume, note, author, createdAt`.

Po každé změně skriptu vytvoř nové nasazení/verzi. Webová aplikace přijímá JSON přes `POST` s `Content-Type: text/plain`, aby prohlížeč nemusel dělat CORS preflight.

Kód `SaberAdmin` je pouze dočasný výchozí kód a není bezpečný. Před nasazením vždy nastav vlastní silný hodnotu `COACH_CODE`.
