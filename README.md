# Gym Deník (Dark Side)

Dark-themed PWA fitness diary for Gym, Calisthenics, Duels and Daily Wellbeing with offline support and instant updates.

## Instalace jako appka (PWA)

### iPhone (Safari)
1. Otevři web aplikace v Safari.
2. Klepni na **Sdílet**.
3. Zvol **Přidat na plochu**.
4. Potvrď název a klepni na **Přidat**.

### Android (Chrome)
1. Otevři web aplikace v Chrome.
2. Klepni na menu **⋮**.
3. Zvol **Instalovat aplikaci** / **Přidat na plochu**.
4. Potvrď instalaci.

## Jak zajistit, aby se aktualizace projevily hned

Aplikace je nastavená tak, aby se nové verze propsaly automaticky:
- Service Worker při otevření vždy kontroluje update (`registration.update()`).
- Jakmile je nový Service Worker připraven, aplikace se sama jednou obnoví (`controllerchange -> reload`).
- HTML/CSS/JS se načítají přes síť s `cache: "no-store"`.

Díky tomu není potřeba appku odinstalovávat/reinstalovat při každé změně.
Pokud se výjimečně stará verze drží, stačí appku úplně zavřít a znovu otevřít.
