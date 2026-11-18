# Portfolio – bezpečnost a použití

Portfolio ukládá investiční data pouze do IndexedDB v tomto zařízení. Celý stav (aktiva, obchody, profily CSV, API klíče i cache cen) je šifrovaný pomocí AES‑GCM. Klíč vzniká z hesla přes PBKDF2‑SHA‑256 s 310 000 iteracemi a existuje jen v paměti po dobu odemčené relace.

## Co šifrování chrání

- Zabraňuje běžnému přečtení databáze bez hesla.
- Portfolio data nejsou v `localStorage`, běžné záloze Gym Deníku ani v Git repozitáři.
- Každé uložení používá nové náhodné AES‑GCM IV.

Šifrování **nechrání před malwarem, škodlivým rozšířením nebo útočníkem ovládajícím odemčené zařízení/prohlížeč**. Heslo je jediná možnost obnovy. Pokud ho zapomeneš a nemáš zašifrovanou zálohu se známou frází, data nelze obnovit.

## Ceny

- Krypto: CoinGecko veřejné API. Volitelný Demo API klíč lze vložit v nastavení kvůli stabilnějším limitům.
- Akcie/ETF: Twelve Data nebo Finnhub. Klíč získáš na webu poskytovatele a vložíš v nastavení Portfolia; ukládá se uvnitř šifrovaného trezoru.
- Převod do Kč používá veřejná kurzovní data ECB přes Frankfurter. Kurzy jsou součástí šifrované cache a obnovují se spolu s cenami.
- Bez internetu se používá poslední šifrovaná cache. Když kurz nebo cena chybí, aplikace ponechá rozpis v původních měnách a nevytvoří neúplný součet v Kč.
- Free API mají nízké limity a mohou vracet zpožděné ceny. Aplikace požadavky řadí do fronty, ale negarantuje burzovní real-time data.

Běžné kryptoměnové symboly (například BTC, ETH, SOL, XRP nebo ADA) se při importu a zakládání aktiva automaticky nastaví na CoinGecko. Zdroj ceny, typ aktiva a CoinGecko ID lze později upravit ve správě transakcí přes tlačítko **Upravit aktivum**.

TradingView se nescrapuje. Odkaz na graf pouze otevře veřejný symbol. Oficiální widget Technical Analysis se načte až po souhlasu; TradingView pak obdrží symbol a technické údaje spojení, nikoli portfolio nebo obchody. Vedle něj aplikace počítá vlastní orientační rating z RSI14, MACD a SMA20/50/200.

Přehled ukazuje u každé pozice jen aktivum, množství, hodnotu a procentní zisk nebo ztrátu. Kliknutí na celý řádek otevře detail s tržní historií, zelenými body nákupů, červenými body prodejů, průměrnou nákupní cenou a volitelným přepočtem do Kč. Pokud tržní historie není dostupná, použije aplikace alespoň vlastní ceny z transakcí. CoinGecko bez Demo API klíče omezuje rozsah „Vše“ na dostupných posledních 365 dní.

Měna každé transakce se ukládá samostatně od měny kotace aktiva. Například BTC může být kotovaný v USD, zatímco nákupy z brokera zůstanou v CZK. Pozice a P/L se počítají konzistentně přes šifrovanou FX cache; CoinGecko ukládá aktuální cenu kryptoměny přímo v USD i CZK a graf lze mezi těmito měnami přepnout.

## CSV import

1. Vyber CSV report brokera.
2. Zkontroluj automaticky rozpoznaný oddělovač, náhled a mapování sloupců.
3. Uprav mapování typů operací a ulož si pojmenovaný profil.
4. Zkontroluj souhrn nových, duplicitních a chybných řádků.

Opakovaný import stejného souboru nepřidá stejné transakce znovu. Shoda se posuzuje podle data, symbolu, typu, množství, ceny a měny s tolerancí běžných desetinných rozdílů. Pokud soubor oprávněně obsahuje více stejných řádků, zachová se jejich počet a při dalším importu se přidají jen řádky nad už uložený počet.

Přednastavené profily jsou pouze vzory a nemusí odpovídat aktuálnímu exportu brokera. Pro přesné doladění je potřeba anonymizovaný ukázkový CSV soubor se záhlavím a několika reprezentativními řádky.

## Záloha

Použij export přímo v Portfoliu. Výsledný JSON je opět šifrovaný a lze ho chránit jinou frází než lokální trezor. Import nabízí přepsání nebo sloučení podle ID. Běžná záloha Gym Deníku Portfolio záměrně neobsahuje.

Graf používá lokálně uloženou knihovnu Lightweight Charts 4.2.3, licencovanou pod Apache‑2.0. Licence a NOTICE jsou v `js/vendor/lightweight-charts/`.
