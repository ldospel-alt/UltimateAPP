# Portfolio – bezpečnost a použití

Portfolio ukládá investiční data pouze do IndexedDB v tomto zařízení. Celý stav (aktiva, obchody, profily CSV, API klíče i cache cen) je šifrovaný pomocí AES‑GCM. Klíč vzniká z hesla přes PBKDF2‑SHA‑256 s 310 000 iteracemi a existuje jen v paměti po dobu odemčené relace.

## Co šifrování chrání

- Zabraňuje běžnému přečtení databáze bez hesla.
- Portfolio data nejsou v `localStorage`, běžné záloze Gym Deníku ani v Git repozitáři.
- Každé uložení používá nové náhodné AES‑GCM IV.

Šifrování **nechrání před malwarem, škodlivým rozšířením nebo útočníkem ovládajícím odemčené zařízení/prohlížeč**. Heslo je jediná možnost obnovy. Pokud ho zapomeneš a nemáš zašifrovanou zálohu se známou frází, data nelze obnovit.

## Ceny

- Krypto: CoinGecko veřejné API (obvykle bez klíče).
- Akcie/ETF: Twelve Data nebo Finnhub. Klíč získáš na webu poskytovatele a vložíš v nastavení Portfolia; ukládá se uvnitř šifrovaného trezoru.
- Bez internetu se používá poslední šifrovaná cache. Bez kurzu měn se součty zobrazují odděleně podle měny.
- Free API mají nízké limity a mohou vracet zpožděné ceny. Aplikace požadavky řadí do fronty, ale negarantuje burzovní real-time data.

TradingView se nescrapuje. Odkaz na graf pouze otevře veřejný symbol. Oficiální widget Technical Analysis se načte až po souhlasu; TradingView pak obdrží symbol a technické údaje spojení, nikoli portfolio nebo obchody. Vedle něj aplikace počítá vlastní orientační rating z RSI14, MACD a SMA20/50/200.

## CSV import

1. Vyber CSV report brokera.
2. Zkontroluj automaticky rozpoznaný oddělovač, náhled a mapování sloupců.
3. Uprav mapování typů operací a ulož si pojmenovaný profil.
4. Zkontroluj souhrn nových, duplicitních a chybných řádků.

Přednastavené profily jsou pouze vzory a nemusí odpovídat aktuálnímu exportu brokera. Pro přesné doladění je potřeba anonymizovaný ukázkový CSV soubor se záhlavím a několika reprezentativními řádky.

## Záloha

Použij export přímo v Portfoliu. Výsledný JSON je opět šifrovaný a lze ho chránit jinou frází než lokální trezor. Import nabízí přepsání nebo sloučení podle ID. Běžná záloha Gym Deníku Portfolio záměrně neobsahuje.

Graf používá lokálně uloženou knihovnu Lightweight Charts 4.2.3, licencovanou pod Apache‑2.0. Licence a NOTICE jsou v `js/vendor/lightweight-charts/`.
