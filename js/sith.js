const SITH_PROGRAMS = [
  {
    id: "a",
    title: "Varianta A: Bleskový start",
    duration: "15 min",
    summary: "Krátké probuzení nervové soustavy.",
    steps: [
      { section: "Zahřátí", name: "Vysoká kolena", description: "Běh na místě s vysokými koleny.", seconds: 60 },
      { section: "Zahřátí", name: "Dynamické výpady", description: "Výpady do všech stran lehce, ne na maximum.", seconds: 120 },
      ...Array.from({ length: 4 }, (_, index) => [
        { section: `PAP blok · série ${index + 1}/4`, name: "Izometrický tlak proti zdi", description: "Zadní nohou tlač proti zdi, jako bys ji chtěl posunout.", seconds: 6 },
        { section: `PAP blok · série ${index + 1}/4`, name: "Pauza", description: "Krátce se vydýchej.", seconds: 15 },
        { section: `PAP blok · série ${index + 1}/4`, name: "Šermířský výpad", description: "4× maximálně rychlý lunge do prostoru." },
        { section: `PAP blok · série ${index + 1}/4`, name: "Skok bruslař", description: "4× skok z boku na bok, dopad na jednu nohu." },
        { section: `PAP blok · série ${index + 1}/4`, name: "Pauza ATP", description: "Důležitý odpočinek pro obnovu ATP.", seconds: 90 },
      ]).flat(),
      { section: "Zklidnění", name: "Protažení flexorů kyčle", description: "Pozice rytíře, klidně dýchej.", seconds: 120 },
    ],
  },
  {
    id: "b",
    title: "Varianta B: Šermířská síla a rychlost",
    duration: "30 min",
    summary: "Výbušný základ pro sílu a rychlost.",
    steps: [
      { section: "Zahřátí", name: "Dynamické zahřátí", description: "Kroužení kloubů, stínový šerm a 20× lehký dřep s výskokem.", seconds: 300 },
      { section: "Izometrický základ", name: "Wall Sit na jedné noze", description: "3× 30 sekund na každou nohu, střídej nohy." },
      { section: "Izometrický základ", name: "En Garde Hold", description: "2× 45 sekund v extra nízkém postoji." },
      { section: "Plyometrie a výbušnost", name: "Tuck Jumps", description: "3 série po 6 skocích, maximální výška." },
      { section: "Plyometrie a výbušnost", name: "Pauza mezi sériemi", description: "Odpočívej mezi sériemi plyometrie.", seconds: 120 },
      { section: "Plyometrie a výbušnost", name: "Split Squat Jumps", description: "3 série po 8 skocích, střídej nohy ve vzduchu." },
      { section: "Plyometrie a výbušnost", name: "Pauza mezi sériemi", description: "Odpočívej mezi sériemi plyometrie.", seconds: 120 },
      { section: "Unilaterální síla", name: "Bulharské dřepy", description: "3 série po 10 opakováních na každou nohu, rychle nahoru." },
      { section: "Zklidnění a Core", name: "Plank a protažení stehen", description: "1 minuta plank, potom protažení stehen.", seconds: 180 },
    ],
  },
  {
    id: "c",
    title: "Varianta C: Elite Combat Ready",
    duration: "45 min",
    summary: "Komplexní síla, výbušnost a reakce.",
    steps: [
      { section: "Dynamická příprava", name: "Dynamická příprava", description: "Běh, poskoky, dynamický strečink, aktivace kotníků a výpony.", seconds: 480 },
      ...Array.from({ length: 5 }, (_, index) => [
        { section: `PAP · série ${index + 1}/5`, name: "Maximální tlak proti zdi", description: "6 sekund maximální izometrie.", seconds: 6 },
        { section: `PAP · série ${index + 1}/5`, name: "Dvojskok snožmo", description: "3× co nejdál dopředu." },
        { section: `PAP · série ${index + 1}/5`, name: "Blesková kombinace", description: "2× Ústup – Ústup – Výpad." },
        { section: `PAP · série ${index + 1}/5`, name: "Pauza", description: "Obnova před další sérií.", seconds: 120 },
      ]).flat(),
      { section: "Stabilita a výdrž", name: "Pistol Squats", description: "3 série po 5–8 opakováních. Je-li třeba, přidrž se židle." },
      { section: "Stabilita a výdrž", name: "Glute Bridges na jedné noze", description: "3 série po 12 opakováních pro silný odraz z hýždí." },
      { section: "Stabilita a výdrž", name: "Izometrie ve výpadu", description: "Drž pozici těsně nad zemí 3× 40 sekund." },
      { section: "Reaktivní drily", name: "Stínový šerm s vizualizací", description: "4× 1 minuta intenzivního pohybu se změnami směru a náhlými starty.", seconds: 240 },
      { section: "Reaktivní drily", name: "Reakce na signál", description: "Při náhodném zvuku nebo tlesknutí okamžitě vyraz vpřed." },
      { section: "Cool-down a regenerace šlach", name: "Protažení a masáž plosky", description: "Dlouhé protažení quadricepsů, hamstringů a lýtek. Promasíruj plosku třeba tenisákem.", seconds: 300 },
    ],
  },
];

let activeSithWorkout = null;

function formatSithSeconds(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function renderSithPrograms() {
  const container = document.getElementById("sithPrograms");
  container.replaceChildren();
  SITH_PROGRAMS.forEach((program) => {
    const card = document.createElement("article");
    card.className = "sith-program";
    const title = document.createElement("h3");
    title.textContent = program.title;
    const duration = document.createElement("span");
    duration.className = "sith-program-duration";
    duration.textContent = program.duration;
    const summary = document.createElement("p");
    summary.textContent = program.summary;
    const start = document.createElement("button");
    start.type = "button";
    start.className = "btn block";
    start.textContent = `Spustit · ${program.duration}`;
    start.addEventListener("click", () => startSithWorkout(program));
    card.append(title, duration, summary, start);
    container.appendChild(card);
  });
}

function updateSithWorkout() {
  if (!activeSithWorkout) return;
  const step = activeSithWorkout.program.steps[activeSithWorkout.index];
  const timed = Number.isInteger(step.seconds) && step.seconds > 0;
  document.getElementById("sithActiveProgram").textContent = activeSithWorkout.program.title;
  document.getElementById("sithActiveSection").textContent = step.section;
  document.getElementById("sithActiveType").textContent = timed ? "ČASOVANÁ ČÁST" : "KARTA CVIKU";
  document.getElementById("sithActiveName").textContent = step.name;
  document.getElementById("sithActiveDescription").textContent = step.description;
  document.getElementById("sithCountdown").hidden = !timed;
  document.getElementById("sithCountdown").textContent = formatSithSeconds(activeSithWorkout.remaining);
  document.getElementById("sithStepProgress").textContent = `Krok ${activeSithWorkout.index + 1}/${activeSithWorkout.program.steps.length}`;
  document.getElementById("sithProgressBar").style.width = `${((activeSithWorkout.index + (timed ? 1 - activeSithWorkout.remaining / step.seconds : 0)) / activeSithWorkout.program.steps.length) * 100}%`;
  document.getElementById("pauseSithWorkoutBtn").hidden = !timed;
  document.getElementById("pauseSithWorkoutBtn").textContent = activeSithWorkout.paused ? "Pokračovat" : "Pauza";
  document.getElementById("completeSithCardBtn").hidden = timed;
}

function finishSithWorkout() {
  clearInterval(activeSithWorkout?.timer);
  activeSithWorkout = null;
  document.getElementById("sithActiveWorkout").hidden = true;
  if (document.fullscreenElement) document.exitFullscreen?.();
}

function advanceSithWorkout() {
  if (!activeSithWorkout) return;
  activeSithWorkout.index += 1;
  if (activeSithWorkout.index >= activeSithWorkout.program.steps.length) {
    finishSithWorkout();
    return;
  }
  const step = activeSithWorkout.program.steps[activeSithWorkout.index];
  activeSithWorkout.remaining = step.seconds || 0;
  activeSithWorkout.paused = false;
  updateSithWorkout();
}

function sithWorkoutTick() {
  if (!activeSithWorkout || activeSithWorkout.paused) return;
  const step = activeSithWorkout.program.steps[activeSithWorkout.index];
  if (!step.seconds) return;
  activeSithWorkout.remaining -= 1;
  if (activeSithWorkout.remaining <= 0) advanceSithWorkout();
  else updateSithWorkout();
}

function startSithWorkout(program) {
  const firstStep = program.steps[0];
  activeSithWorkout = { program, index: 0, remaining: firstStep.seconds || 0, paused: false, timer: null };
  document.getElementById("sithActiveWorkout").hidden = false;
  document.getElementById("sithActiveWorkout").requestFullscreen?.().catch(() => {});
  updateSithWorkout();
  activeSithWorkout.timer = setInterval(sithWorkoutTick, 1000);
}

document.addEventListener("DOMContentLoaded", () => {
  renderSithPrograms();
  document.getElementById("pauseSithWorkoutBtn").addEventListener("click", () => {
    if (!activeSithWorkout) return;
    activeSithWorkout.paused = !activeSithWorkout.paused;
    updateSithWorkout();
  });
  document.getElementById("completeSithCardBtn").addEventListener("click", advanceSithWorkout);
  document.getElementById("skipSithWorkoutBtn").addEventListener("click", advanceSithWorkout);
  document.getElementById("stopSithWorkoutBtn").addEventListener("click", finishSithWorkout);
});
