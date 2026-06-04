/* global React, ReactDOM, gsap, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSlider, TweakButton */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{}/*EDITMODE-END*/;

const FIXED_EASE = "expo";
const FIXED_SPEED = 1;
const FIXED_GRAIN = "on";

const EASES = {
  expo:  "expo.out",
  back:  "back.out(2)",
  power: "power3.out",
  elastic: "elastic.out(1, 0.5)",
};

const COLORS = {
  g: "#5cc96e", y: "#f5d742", b: "#5b9ff5", p: "#e85a82", o: "#f58a35",
};
const COLOR_NAMES = { g: "vert", y: "jaune", b: "bleu", p: "rose", o: "orange" };

// ============================================================
// 01 · LOADER — ENCORE letters assemble + dice tumble
// ============================================================
function LoaderScene({ ease, speed, onReplayRef }) {
  const letters = useMemo(() => "ENCORE".split(""), []);
  const lettersRef = useRef([]);
  const bangRef = useRef(null);
  const subRef = useRef(null);
  const ringRef = useRef(null);
  const dotsRef = useRef([]);
  const barRef = useRef(null);
  const barFillRef = useRef(null);

  const play = useCallback(() => {
    const tl = gsap.timeline({ defaults: { ease: EASES[ease] } });
    tl.timeScale(speed);

    gsap.set(lettersRef.current, { y: -180, rotate: -25, opacity: 0, scale: 0.6 });
    gsap.set(bangRef.current, { y: -120, rotate: 35, opacity: 0, scale: 0.4 });
    gsap.set(subRef.current, { opacity: 0, y: 12 });
    gsap.set(ringRef.current, { scale: 0.5, opacity: 0 });
    gsap.set(dotsRef.current, { scale: 0, opacity: 0 });
    gsap.set(barFillRef.current, { scaleX: 0, transformOrigin: "left center" });

    tl.to(ringRef.current, { scale: 1, opacity: 1, duration: 0.6 }, 0);
    gsap.to(ringRef.current, { rotate: "+=360", duration: 3, ease: "none", repeat: -1 });

    tl.to(dotsRef.current, {
      scale: 1, opacity: 1, duration: 0.6,
      stagger: { each: 0.04, from: "random" }, ease: "back.out(2)"
    }, 0.1);

    tl.to(lettersRef.current, {
      y: 0, rotate: 0, opacity: 1, scale: 1, duration: 0.85,
      stagger: { each: 0.07 }
    }, 0.25);

    tl.to(bangRef.current, { y: 0, rotate: 0, opacity: 1, scale: 1, duration: 0.7 }, 0.9)
      .to(bangRef.current, { rotate: -8, yoyo: true, repeat: 3, duration: 0.1, ease: "power2.inOut" })
      .to(bangRef.current, { rotate: 0, duration: 0.15 });

    tl.to(subRef.current, { opacity: 1, y: 0, duration: 0.4 }, "-=0.5");
    tl.to(barFillRef.current, { scaleX: 1, duration: 1.6, ease: "power2.inOut" }, "-=0.5");
  }, [ease, speed]);

  useEffect(() => { play(); return () => gsap.killTweensOf(ringRef.current); }, [play]);
  useEffect(() => { if (onReplayRef) onReplayRef.current = play; }, [play, onReplayRef]);

  const dotConfig = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      x: (Math.random() - 0.5) * 800,
      y: (Math.random() - 0.5) * 420,
      c: ["g","y","b","p","o"][i % 5],
      s: 6 + Math.random() * 18,
    })), []);

  return (
    <div className="scene loader-scene">
      <div ref={ringRef} className="loader-ring" aria-hidden="true">
        <svg viewBox="-100 -100 200 200" width="100%" height="100%">
          <circle cx="0" cy="0" r="88" fill="none" stroke="rgba(245,215,66,0.18)" strokeWidth="1" strokeDasharray="2 6"/>
          <circle cx="0" cy="0" r="64" fill="none" stroke="rgba(245,138,53,0.10)" strokeWidth="1"/>
          <circle cx="0" cy="0" r="44" fill="none" stroke="rgba(245,215,66,0.06)" strokeWidth="1" strokeDasharray="1 3"/>
        </svg>
      </div>

      <div className="loader-dots" aria-hidden="true">
        {dotConfig.map((d, i) => (
          <span key={i} ref={el => (dotsRef.current[i] = el)} className="ld"
            style={{
              transform: `translate(${d.x}px, ${d.y}px)`,
              width: d.s, height: d.s, background: COLORS[d.c]
            }}/>
        ))}
      </div>

      <div className="loader-title">
        {letters.map((c, i) => (
          <span key={i} ref={el => (lettersRef.current[i] = el)} className="ll">{c}</span>
        ))}
        <span ref={bangRef} className="ll bang">!</span>
      </div>
      <div ref={subRef} className="loader-sub">
        chargement de la partie<span className="dots-anim">...</span>
      </div>

      <div ref={barRef} className="loader-progress">
        <span ref={barFillRef} className="lp-fill"></span>
      </div>
    </div>
  );
}

// ============================================================
// 02 · LANCEMENT — Lobby → flash → dice fall → grid build → tour
// ============================================================
function LaunchScene({ ease, speed, onReplayRef }) {
  const lobbyRef = useRef(null);
  const flashRef = useRef(null);
  const dicePoolRef = useRef([]);
  const cellsRef = useRef([]);
  const headerRef = useRef(null);
  const headerSubRef = useRef(null);
  const turnLabelRef = useRef(null);
  const playerCardRef = useRef(null);

  const previewGrid = useMemo(() => {
    const keys = ["g","y","b","p","o"];
    return Array.from({ length: 60 }, (_, i) => ({
      c: keys[Math.floor(Math.random() * 5)],
      star: Math.random() < 0.08,
    }));
  }, []);

  const dice = useMemo(() => [
    { kind: "c", v: "g" }, { kind: "c", v: "o" }, { kind: "c", v: "y" },
    { kind: "n", v: 3   }, { kind: "n", v: 5   }, { kind: "n", v: 1   },
  ], []);

  const play = useCallback(() => {
    const tl = gsap.timeline({ defaults: { ease: EASES[ease] } });
    tl.timeScale(speed);

    gsap.set(lobbyRef.current, { opacity: 1, scale: 1, y: 0 });
    gsap.set(flashRef.current, { opacity: 0 });
    gsap.set(dicePoolRef.current, { y: -260, opacity: 0, rotate: 0, scale: 0.6 });
    gsap.set(cellsRef.current, { scale: 0, opacity: 0, rotate: -30 });
    gsap.set(headerRef.current, { opacity: 0, y: -16 });
    gsap.set(headerSubRef.current, { opacity: 0, y: -8 });
    gsap.set(turnLabelRef.current, { opacity: 0, y: 10 });
    gsap.set(playerCardRef.current, { opacity: 0, y: 14, scale: 0.9 });

    tl.to(lobbyRef.current, {
      y: -80, scale: 0.85, opacity: 0, duration: 0.6, ease: "power3.in"
    }, 0.1);

    tl.to(flashRef.current, { opacity: 0.85, duration: 0.08 }, 0.6)
      .to(flashRef.current, { opacity: 0, duration: 0.45 }, ">");

    tl.to(headerRef.current,    { opacity: 1, y: 0, duration: 0.45 }, 0.55);
    tl.to(headerSubRef.current, { opacity: 1, y: 0, duration: 0.4  }, 0.65);

    tl.to(dicePoolRef.current, {
      y: 0, opacity: 1, scale: 1,
      rotate: () => gsap.utils.random(-25, 25),
      duration: 0.7, stagger: { each: 0.06, from: "random" }, ease: "back.out(1.8)"
    }, 0.55);
    tl.to(dicePoolRef.current, { rotate: 0, duration: 0.3 }, ">-0.1");

    tl.to(playerCardRef.current, { opacity: 1, y: 0, scale: 1, duration: 0.5 }, "-=0.3");

    tl.to(cellsRef.current, {
      scale: 1, opacity: 1, rotate: 0, duration: 0.45,
      stagger: { each: 0.012, from: "edges", grid: [6, 10] },
      ease: "back.out(2)"
    }, 0.7);

    tl.to(turnLabelRef.current, { opacity: 1, y: 0, duration: 0.5 }, "-=0.1");
  }, [ease, speed]);

  useEffect(() => { play(); }, [play]);
  useEffect(() => { if (onReplayRef) onReplayRef.current = play; }, [play, onReplayRef]);

  return (
    <div className="scene launch-scene">
      <div ref={flashRef} className="launch-flash"></div>

      <div ref={lobbyRef} className="launch-lobby">
        <div className="card-title">Créer une partie</div>
        <div className="lobby-field">
          <span className="field-label">TON PRÉNOM</span>
          <span className="field-input">Alice</span>
        </div>
        <div className="lobby-field">
          <span className="field-label">GRILLE</span>
          <div className="grid-chips">
            {["01","02","03","04","05"].map((g, i) => (
              <span key={g} className={`gc gc-${g} ${i===0?"on":""}`}>{g}</span>
            ))}
          </div>
        </div>
        <button className="cta-primary">Créer une partie →</button>
      </div>

      <div ref={headerRef} className="launch-header">ENCORE !</div>
      <div ref={headerSubRef} className="launch-header-sub">
        <span>Tour 1 · Joueur actif : <b>Alice</b></span>
      </div>

      <div ref={playerCardRef} className="player-chip">
        <span className="pc-ico">🎲</span>
        <span className="pc-name">Alice</span>
        <span className="pc-you">toi</span>
        <span className="pc-pts">0 pts</span>
      </div>

      <div className="launch-dice">
        {dice.map((d, i) => (
          <div key={i} ref={el => (dicePoolRef.current[i] = el)} className="die">
            {d.kind === "n" ? (
              <span className="die-num">{d.v}</span>
            ) : (
              <span className="die-color" style={{ background: COLORS[d.v] }}></span>
            )}
          </div>
        ))}
      </div>

      <div className="launch-grid">
        {previewGrid.map((cell, i) => (
          <span
            key={i}
            ref={el => (cellsRef.current[i] = el)}
            className="lc"
            style={{ background: COLORS[cell.c] }}
          >
            {cell.star ? <span className="star">★</span> : null}
          </span>
        ))}
      </div>

      <div ref={turnLabelRef} className="launch-turn-label">
        <span className="dot-pulse"></span> partie en cours · 52 s restant
      </div>
    </div>
  );
}

// ============================================================
// 03 · COMPLÉTION — couleur OU colonne
// Modèle réel : les cases jouées sont BARRÉES (✕) et foncées.
// La complétion ne se montre pas en barrant — elle se montre par
// la DERNIÈRE croix + une vague de couleur qui ré-illumine la série
// complète, puis un état "verrouillé" (liseré lumineux) que les
// cases simplement barrées n'ont jamais.
// ============================================================
const NCOLS = 15, NROWS = 7;
const COLS_LETTERS = (typeof window !== "undefined" && window.COLS)
  ? window.COLS : "ABCDEFGHIJKLMNO".split("");
// Valeur "premier à compléter" par colonne (symétrique, min au centre).
// À ajuster sur les vraies valeurs du plateau si besoin.
const COLUMN_VALUES = [5,4,4,3,3,2,2,1,2,2,3,3,4,4,5];

const FALLBACK_GRID = Array.from({ length: NCOLS * NROWS }, () => {
  const keys = ["g","y","b","p","o"];
  return [keys[Math.floor(Math.random() * 5)], Math.random() < 0.07 ? 1 : 0];
});

const CROSSED_FILTER = "brightness(0.34) saturate(0.5)";
const OPEN_FILTER = "brightness(1) saturate(1)";

function CompletionScene({ ease, speed, onReplayRef }) {
  const GRID = (typeof window !== "undefined" && window.GRID_01) || FALLBACK_GRID;

  const [mode, setMode] = useState("color");      // "color" | "column"
  const [color, setColor] = useState("g");
  const [col, setCol] = useState(0);              // 0..14 (A..O)

  const cellsRef = useRef([]);
  const xRef = useRef([]);
  const ringRef = useRef([]);
  const ribbonRef = useRef(null);
  const tokenRef = useRef(null);
  const scoreRef = useRef(null);
  const scoreVal = useRef({ n: 0 });
  const colorRowRef = useRef(null);
  const colRowRef = useRef(null);

  const target = mode === "color" ? color : col;
  const bonus = mode === "color" ? 5 : COLUMN_VALUES[col];
  const base = mode === "color" ? 8 : 14;

  // Hand-drawn jitter on every cross (stable for the life of the mount)
  const xRot = useMemo(() => Array.from({ length: NCOLS * NROWS }, () => (Math.random() - 0.5) * 26), []);

  // The cells of the set being completed (in ripple order from the final cross)
  const { matchOrder, finalIdx, crossedAtStart } = useMemo(() => {
    let matches;
    if (mode === "color") {
      matches = GRID.map((c, i) => (c[0] === color ? i : -1)).filter(i => i >= 0);
    } else {
      matches = Array.from({ length: NROWS }, (_, r) => col + r * NCOLS);
    }
    // final = bottom-most match (feels like "the one you reach last")
    const final = matches.reduce((a, b) => (b > a ? b : a), matches[0]);

    const fr = Math.floor(final / NCOLS), fc = final % NCOLS;
    const ordered = [...matches].sort((a, b) => {
      const da = Math.abs(Math.floor(a / NCOLS) - fr) + Math.abs((a % NCOLS) - fc);
      const db = Math.abs(Math.floor(b / NCOLS) - fr) + Math.abs((b % NCOLS) - fc);
      return da - db;
    });

    // Realistic late-game board: the whole set is already crossed except
    // the final cell, plus ~58% of unrelated cells are crossed too.
    const matchSet = new Set(matches);
    const crossed = new Set(matches);
    crossed.delete(final);
    GRID.forEach((_, i) => {
      if (!matchSet.has(i) && Math.random() < 0.58) crossed.add(i);
    });
    return { matchOrder: ordered, finalIdx: final, crossedAtStart: crossed };
  }, [mode, color, col, GRID]);

  const play = useCallback(() => {
    const cells = cellsRef.current;
    if (!cells.length) return;
    gsap.killTweensOf([ringRef.current[finalIdx], ...cells].filter(Boolean));

    const tl = gsap.timeline({ defaults: { ease: EASES[ease] } });
    tl.timeScale(speed);

    // ---- initial board: mostly crossed, target set crossed except final ----
    cells.forEach((el, i) => {
      if (!el) return;
      const crossed = crossedAtStart.has(i);
      gsap.set(el, { filter: crossed ? CROSSED_FILTER : OPEN_FILTER, scale: 1, boxShadow: "none" });
      const x = xRef.current[i];
      if (x) gsap.set(x, { opacity: crossed ? 1 : 0, scale: crossed ? 1 : 0.5, rotate: xRot[i] });
      const r = ringRef.current[i];
      if (r) gsap.set(r, { opacity: 0, scale: 1 });
    });
    // final cell: still open, bright, with a pulsing highlight ring
    gsap.set(cells[finalIdx], { filter: "brightness(1.12) saturate(1.2)", scale: 1 });
    gsap.set(ringRef.current[finalIdx], { opacity: 1, scale: 1 });
    gsap.set(xRef.current[finalIdx], { opacity: 0, scale: 1.9, rotate: xRot[finalIdx] - 10 });

    gsap.set(ribbonRef.current, { opacity: 0, y: 18, scale: 0.95 });
    gsap.set(tokenRef.current, { opacity: 0, scale: 0.6, x: 0, y: 0 });
    [colorRowRef.current, colRowRef.current].forEach(r => r && gsap.set(r, { backgroundColor: "transparent" }));
    scoreVal.current.n = base;
    if (scoreRef.current) scoreRef.current.textContent = String(base);

    const orderedEls = matchOrder.map(i => cells[i]);
    const orderedHex = matchOrder.map(i => COLORS[GRID[i][0]]);

    // 1) the final cell pulses ("ta dernière case") ...
    tl.to(ringRef.current[finalIdx], { scale: 1.1, duration: 0.28, yoyo: true, repeat: 2, ease: "sine.inOut" }, 0);
    // ... then the ring bursts and the last ✕ stamps in
    tl.to(ringRef.current[finalIdx], { scale: 1.45, opacity: 0, duration: 0.3, ease: "power2.out" }, 0.84);
    tl.to(xRef.current[finalIdx], { opacity: 1, scale: 1, rotate: xRot[finalIdx], duration: 0.38, ease: "back.out(3)" }, 0.9);
    tl.to(cells[finalIdx], { filter: CROSSED_FILTER, duration: 0.3, ease: "power2.out" }, 1.05);

    // 2) celebration WAVE — the completed set re-illuminates from the final cross outward
    tl.to(orderedEls, {
      filter: "brightness(1.18) saturate(1.4)",
      scale: 1.16,
      boxShadow: i => `inset 0 0 0 2px ${orderedHex[i]}, 0 0 18px ${orderedHex[i]}`,
      duration: 0.4, ease: "power2.out",
      stagger: { each: 0.045 }
    }, 1.25);
    // 3) settle into the LOCKED state (glowing border) — distinct from plain crossed
    tl.to(orderedEls, {
      filter: "brightness(0.95) saturate(1.18)",
      scale: 1,
      boxShadow: i => `inset 0 0 0 2px ${orderedHex[i]}, 0 0 10px ${orderedHex[i]}aa`,
      duration: 0.55, ease: "power2.inOut",
      stagger: { each: 0.045 }
    }, ">-0.12");

    // 4) ribbon + bonus token fly to score
    tl.to(ribbonRef.current, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(2)" }, 1.4);
    tl.to(tokenRef.current, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2.5)" }, 1.7)
      .to(tokenRef.current, { x: 380, y: -150, scale: 0.4, opacity: 0, duration: 0.9, ease: "power2.in" }, "+=0.45");

    const scoreRow = mode === "color" ? colorRowRef.current : colRowRef.current;
    tl.to(scoreRow, { backgroundColor: "rgba(245,215,66,0.18)", duration: 0.25, ease: "power2.out" }, "-=0.3")
      .to(scoreRow, { backgroundColor: "transparent", duration: 0.6, ease: "power2.in" }, ">");
    tl.to(scoreVal.current, {
      n: base + bonus, duration: 0.7, ease: "power3.out",
      onUpdate: () => { if (scoreRef.current) scoreRef.current.textContent = String(Math.round(scoreVal.current.n)); }
    }, "-=0.7");
  }, [ease, speed, mode, color, col, matchOrder, finalIdx, crossedAtStart, base, bonus, xRot, GRID]);

  useEffect(() => { play(); }, [play]);
  useEffect(() => { if (onReplayRef) onReplayRef.current = play; }, [play, onReplayRef]);

  const letter = COLS_LETTERS[col];

  return (
    <div className="scene completion-scene">
      <div className="completion-header">
        <div>
          <div className="card-eyebrow">ANIMATION</div>
          <h2 className="card-title big">
            {mode === "color" ? "Complétion d'une couleur" : "Complétion d'une colonne"}
          </h2>
        </div>
        <div className="completion-controls">
          <div className="mode-toggle">
            <button className={mode === "color" ? "on" : ""} onClick={() => setMode("color")}>Couleur</button>
            <button className={mode === "column" ? "on" : ""} onClick={() => setMode("column")}>Colonne</button>
          </div>

          {mode === "color" ? (
            <div className="color-picker">
              {["g","y","b","p","o"].map(k => (
                <button
                  key={k}
                  className={`cp-btn ${color === k ? "on" : ""}`}
                  onClick={() => setColor(k)}
                  style={{ "--cpc": COLORS[k] }}
                >
                  <span className="cp-dot" style={{ background: COLORS[k] }}></span>
                  {COLOR_NAMES[k]}
                </button>
              ))}
            </div>
          ) : (
            <div className="column-picker">
              {COLS_LETTERS.map((L, i) => (
                <button
                  key={L}
                  className={`col-btn ${col === i ? "on" : ""}`}
                  onClick={() => setCol(i)}
                >
                  <span>{L}</span>
                  <span className="cb-val">{COLUMN_VALUES[i]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="completion-stage">
        <div className="completion-grid">
          {GRID.map((cell, i) => (
            <span
              key={i}
              ref={el => (cellsRef.current[i] = el)}
              className="cc"
              style={{ background: COLORS[cell[0]] }}
            >
              <span ref={el => (ringRef.current[i] = el)} className="cc-ring"></span>
              <span ref={el => (xRef.current[i] = el)} className="x-mark">✕</span>
              {cell[1] ? <span className="cc-star">★</span> : null}
            </span>
          ))}

          <div ref={ribbonRef} className="completion-ribbon">
            {mode === "color" ? (
              <>
                <span className="r-dot" style={{ background: COLORS[color] }}></span>
                <span><b>{COLOR_NAMES[color].toUpperCase()}</b> COMPLÉTÉE — BONUS {bonus}</span>
              </>
            ) : (
              <>
                <span className="r-badge">{letter}</span>
                <span>COLONNE <b>{letter}</b> COMPLÉTÉE — BONUS {bonus}</span>
              </>
            )}
          </div>

          <div ref={tokenRef} className="bonus-token">
            {mode === "color"
              ? <span className="bt-dot" style={{ background: COLORS[color] }}></span>
              : <span className="bt-badge">{letter}</span>}
            <span className="bt-num">+{bonus}</span>
          </div>
        </div>

        <div className="completion-side">
          <div className="score-card">
            <div className="card-eyebrow">SCORE</div>
            <div ref={scoreRef} className="score-num">{base}</div>
            <div className="score-detail">
              <div ref={colorRowRef} className="sd-row">
                <span>Bonus couleurs</span>
                <span className="sd-val">{mode === "color" ? bonus : 0}</span>
              </div>
              <div ref={colRowRef} className="sd-row">
                <span>A→O colonnes</span>
                <span className="sd-val">{mode === "column" ? bonus : 0}</span>
              </div>
              <div className="sd-row">
                <span>Jokers (+1)</span>
                <span>8</span>
              </div>
              <div className="sd-row">
                <span>★ Étoiles (−2)</span>
                <span>—</span>
              </div>
            </div>
          </div>

          {mode === "color" ? (
            <div className="bonus-board">
              <div className="card-eyebrow">BONUS COULEURS</div>
              <div className="bb-row">
                {["g","y","b","p","o"].map(k => (
                  <div key={k} className={`bb-cell ${color === k ? "done" : ""}`}>
                    <span className="bb-dot" style={{ background: COLORS[k] }}></span>
                    <span className="bb-val">{color === k ? "✓" : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bonus-board">
              <div className="card-eyebrow">COLONNES A→O</div>
              <div className="colbonus-row">
                {COLS_LETTERS.map((L, i) => (
                  <div key={L} className={`colbonus-chip ${col === i ? "done" : ""}`}>{L}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 04 · FIN DE PARTIE — winner reveal + count-up + confetti
// ============================================================
function EndGameScene({ ease, speed, onReplayRef }) {
  const trophyRef = useRef(null);
  const winnerRef = useRef(null);
  const subRef = useRef(null);
  const scoreARef = useRef(null);
  const scoreBRef = useRef(null);
  const barARef = useRef(null);
  const barBRef = useRef(null);
  const confettiRef = useRef([]);
  const cardsRef = useRef([]);
  const ctaRef = useRef(null);

  const playerA = { name: "Alice", colors: 13, columns: 9, jokers: 8, stars: -2, total: 28 };
  const playerB = { name: "Bob",   colors: 8,  columns: 6, jokers: 5, stars: -4, total: 15 };

  const play = useCallback(() => {
    const tl = gsap.timeline({ defaults: { ease: EASES[ease] } });
    tl.timeScale(speed);

    gsap.set(trophyRef.current, { scale: 0, rotate: -45, opacity: 0 });
    gsap.set(winnerRef.current, { opacity: 0, y: 40, scale: 0.9 });
    gsap.set(subRef.current, { opacity: 0, y: 12 });
    gsap.set(cardsRef.current, { opacity: 0, y: 30, scale: 0.95 });
    gsap.set(barARef.current, { scaleX: 0, transformOrigin: "left center" });
    gsap.set(barBRef.current, { scaleX: 0, transformOrigin: "left center" });
    gsap.set(confettiRef.current, { y: -60, opacity: 0, rotate: 0 });
    gsap.set(ctaRef.current, { opacity: 0, y: 14 });
    if (scoreARef.current) scoreARef.current.textContent = "0";
    if (scoreBRef.current) scoreBRef.current.textContent = "0";

    tl.to(trophyRef.current, {
      scale: 1, rotate: 0, opacity: 1, duration: 0.7, ease: "back.out(2.5)"
    }, 0.1)
    .to(trophyRef.current, { rotate: -8, yoyo: true, repeat: 5, duration: 0.09, ease: "power2.inOut" }, ">")
    .to(trophyRef.current, { rotate: 0, duration: 0.2 });

    tl.to(winnerRef.current, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(1.8)" }, 0.5)
      .to(subRef.current, { opacity: 1, y: 0, duration: 0.4 }, "-=0.2");

    tl.to(cardsRef.current, {
      opacity: 1, y: 0, scale: 1, duration: 0.55, stagger: 0.12, ease: "back.out(1.6)"
    }, 0.7);

    const aObj = { n: 0 };
    const bObj = { n: 0 };
    tl.to(aObj, {
      n: playerA.total, duration: 1.2, ease: "power3.out",
      onUpdate: () => { if (scoreARef.current) scoreARef.current.textContent = Math.round(aObj.n); }
    }, 0.95);
    tl.to(bObj, {
      n: playerB.total, duration: 1.2, ease: "power3.out",
      onUpdate: () => { if (scoreBRef.current) scoreBRef.current.textContent = Math.round(bObj.n); }
    }, 0.95);

    tl.to(barARef.current, { scaleX: 1, duration: 1, ease: "power3.out" }, 1.0);
    tl.to(barBRef.current, { scaleX: playerB.total / playerA.total, duration: 1, ease: "power3.out" }, 1.0);

    tl.to(confettiRef.current, { opacity: 1, duration: 0.15 }, 0.7);
    tl.to(confettiRef.current, {
      y: 720, rotate: () => gsap.utils.random(-540, 540),
      duration: () => gsap.utils.random(1.6, 2.8),
      ease: "power1.in",
      stagger: { each: 0.02, from: "random" }
    }, 0.7);

    tl.to(ctaRef.current, { opacity: 1, y: 0, duration: 0.45 }, "-=0.5");
  }, [ease, speed]);

  useEffect(() => { play(); }, [play]);
  useEffect(() => { if (onReplayRef) onReplayRef.current = play; }, [play, onReplayRef]);

  const confettiCfg = useMemo(() =>
    Array.from({ length: 64 }, (_, i) => ({
      x: Math.random() * 100,
      c: ["g","y","b","p","o"][i % 5],
      s: 6 + Math.random() * 10,
      shape: Math.random() > 0.5 ? "rect" : "circ",
    })), []);

  return (
    <div className="scene endgame-scene">
      <div className="confetti-layer" aria-hidden="true">
        {confettiCfg.map((c, i) => (
          <span
            key={i}
            ref={el => (confettiRef.current[i] = el)}
            className={`conf ${c.shape === "circ" ? "circ" : ""}`}
            style={{ left: `${c.x}%`, width: c.s, height: c.s, background: COLORS[c.c] }}
          />
        ))}
      </div>

      <div className="endgame-header">
        <div ref={trophyRef} className="trophy" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="64" height="64">
            <defs>
              <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"  stopColor="#f5d742"/>
                <stop offset="100%" stopColor="#f58a35"/>
              </linearGradient>
            </defs>
            <path d="M14 8 h36 v10 c0 8 -5 14 -12 16 v6 h6 v6 H20 v-6 h6 v-6 c-7 -2 -12 -8 -12 -16 z" fill="url(#tg)"/>
            <path d="M14 14 h-6 c-2 0 -2 4 0 6 c2 2 6 2 6 0" fill="none" stroke="#f5d742" strokeWidth="2"/>
            <path d="M50 14 h6 c2 0 2 4 0 6 c-2 2 -6 2 -6 0" fill="none" stroke="#f5d742" strokeWidth="2"/>
            <rect x="16" y="50" width="32" height="6" fill="url(#tg)"/>
          </svg>
        </div>
        <h2 ref={winnerRef} className="winner-name">
          Alice gagne <span className="acc">!</span>
        </h2>
        <div ref={subRef} className="endgame-sub">
          Partie #0001 · 24 tours · 6 min 14 s
        </div>
      </div>

      <div className="endgame-board">
        <div ref={el => (cardsRef.current[0] = el)} className="player-card winner">
          <div className="pc-rank">1<sup>er</sup></div>
          <div className="pc-body">
            <div className="pc-top">
              <span className="pc-name">{playerA.name} <span className="pc-tag">toi</span></span>
              <span className="pc-medal">★</span>
            </div>
            <div className="pc-bar"><div ref={barARef} className="pc-bar-fill"></div></div>
            <div className="pc-detail">
              <span>Couleurs <b>{playerA.colors}</b></span>
              <span>Colonnes <b>{playerA.columns}</b></span>
              <span>Jokers <b>{playerA.jokers}</b></span>
              <span>Étoiles <b>{playerA.stars}</b></span>
            </div>
          </div>
          <div ref={scoreARef} className="pc-num">0</div>
        </div>

        <div ref={el => (cardsRef.current[1] = el)} className="player-card">
          <div className="pc-rank dim">2</div>
          <div className="pc-body">
            <div className="pc-top">
              <span className="pc-name">{playerB.name}</span>
            </div>
            <div className="pc-bar"><div ref={barBRef} className="pc-bar-fill"></div></div>
            <div className="pc-detail">
              <span>Couleurs <b>{playerB.colors}</b></span>
              <span>Colonnes <b>{playerB.columns}</b></span>
              <span>Jokers <b>{playerB.jokers}</b></span>
              <span>Étoiles <b>{playerB.stars}</b></span>
            </div>
          </div>
          <div ref={scoreBRef} className="pc-num dim">0</div>
        </div>

        <button ref={ctaRef} className="endgame-cta">Rejouer une partie →</button>
      </div>
    </div>
  );
}

// ============================================================
// 05 · LANCER DE DÉS — vrais dés 3D noirs (style : spin)
// ============================================================

// Standard dice: 1↔6, 2↔5, 3↔4
// Final rotations to land face N facing the camera:
const FACE_ROTATION = {
  1: { x:    0, y:    0 },
  2: { x:  -90, y:    0 },
  3: { x:    0, y:  -90 },
  4: { x:    0, y:   90 },
  5: { x:   90, y:    0 },
  6: { x:    0, y:  180 },
};
// For color dice, faces are arranged: 1=g, 2=y, 3=b, 4=p, 5=o, 6=x (joker)
const COLOR_FACE_INDEX = { g: 1, y: 2, b: 3, p: 4, o: 5, x: 6 };

function Pips({ n }) {
  // 3x3 grid; positions filled depending on n
  const positions = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  }[n] || [];
  return (
    <div className="pip-grid">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`pip-cell ${positions.includes(i) ? "on" : ""}`}></span>
      ))}
    </div>
  );
}

function Die3D({ kind, value, dieRef, shadowRef }) {
  // For number dice, show pips on all 6 faces (1..6)
  // For color dice, show color dots on each face mapped to a color
  const colorList = ["g","y","b","p","o","x"];
  const facePositions = ["front","back","right","left","top","bottom"];

  const renderFace = (faceIdx) => {
    if (kind === "n") {
      return <Pips n={faceIdx + 1} />;
    }
    const c = colorList[faceIdx];
    if (c === "x") {
      // Joker face — diagonal lines forming X
      return <span className="die-joker">✕</span>;
    }
    return <span className="die-color-dot" style={{ background: COLORS[c] }}></span>;
  };

  return (
    <div className="die-scene">
      <div ref={dieRef} className="die-cube">
        {facePositions.map((pos, i) => (
          <div key={pos} className={`die-face die-face-${pos}`}>
            {renderFace(i)}
          </div>
        ))}
      </div>
      <div ref={shadowRef} className="die-shadow"></div>
    </div>
  );
}

function DiceRollScene({ onReplayRef }) {
  const dieRefs = useRef([]);
  const shadowRefs = useRef([]);
  const titleRef = useRef(null);
  const hintRef = useRef(null);

  const [values, setValues] = useState(() => randomValues());

  function randomValues() {
    const colorKeys = ["g","y","b","p","o","x"];
    return [
      { kind: "c", v: colorKeys[Math.floor(Math.random() * 6)] },
      { kind: "c", v: colorKeys[Math.floor(Math.random() * 6)] },
      { kind: "c", v: colorKeys[Math.floor(Math.random() * 6)] },
      { kind: "n", v: 1 + Math.floor(Math.random() * 6) },
      { kind: "n", v: 1 + Math.floor(Math.random() * 6) },
      { kind: "n", v: 1 + Math.floor(Math.random() * 6) },
    ];
  }

  // Compute final rotation for each die (to land on its value)
  const finalRotations = useMemo(() => {
    return values.map(d => {
      const faceIdx = d.kind === "n" ? d.v : COLOR_FACE_INDEX[d.v];
      return FACE_ROTATION[faceIdx];
    });
  }, [values]);

  const play = useCallback(() => {
    const dice = dieRefs.current;
    const shadows = shadowRefs.current;
    if (!dice.length) return;

    gsap.killTweensOf([...dice, ...shadows, titleRef.current, hintRef.current]);
    gsap.set(titleRef.current, { opacity: 0, y: -10 });
    gsap.set(hintRef.current, { opacity: 0, y: 8 });

    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.to(titleRef.current, { opacity: 1, y: 0, duration: 0.4 }, 0);

    dice.forEach((die, i) => {
      const finalRot = finalRotations[i];
      const shadow = shadows[i];

      // Random multi-turn spin that resolves to the value's face
      const spinX = (3 + Math.floor(Math.random() * 3)) * 360 + finalRot.x;
      const spinY = (3 + Math.floor(Math.random() * 3)) * 360 + finalRot.y;

      gsap.set(die, { y: 0, opacity: 0, rotateX: 0, rotateY: 0, scale: 0.5 });
      gsap.set(shadow, { opacity: 0.4, scaleX: 1, scaleY: 1 });

      const offset = i * 0.04;
      tl.to(die, {
        opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)"
      }, offset)
      .to(die, {
        rotateX: spinX, rotateY: spinY,
        duration: 1.4, ease: "power4.out"
      }, offset);
    });

    tl.to(hintRef.current, { opacity: 1, y: 0, duration: 0.4 }, "-=0.3");
  }, [finalRotations]);

  const replay = useCallback(() => {
    setValues(randomValues());
  }, []);

  useEffect(() => { play(); }, [values, play]);
  useEffect(() => { if (onReplayRef) onReplayRef.current = replay; }, [replay, onReplayRef]);

  return (
    <div className="scene dice-roll-scene">
      <div ref={titleRef} className="dr-title">
        <span className="dr-eyebrow">TOUR 01 · ALICE</span>
        <h2>Lance les dés</h2>
      </div>

      <div className="dr-tray">
        <div className="dr-group">
          <span className="dr-group-label">3 COULEURS</span>
          <div className="dr-group-dice">
            {values.slice(0, 3).map((d, i) => (
              <Die3D
                key={`c-${i}`}
                kind="c"
                value={d.v}
                dieRef={el => (dieRefs.current[i] = el)}
                shadowRef={el => (shadowRefs.current[i] = el)}
              />
            ))}
          </div>
        </div>

        <div className="dr-x">×</div>

        <div className="dr-group">
          <span className="dr-group-label">3 CHIFFRES</span>
          <div className="dr-group-dice">
            {values.slice(3).map((d, i) => (
              <Die3D
                key={`n-${i}`}
                kind="n"
                value={d.v}
                dieRef={el => (dieRefs.current[i + 3] = el)}
                shadowRef={el => (shadowRefs.current[i + 3] = el)}
              />
            ))}
          </div>
        </div>
      </div>

      <button ref={hintRef} className="dr-replay" onClick={replay}>
        ↻ Relancer
      </button>
    </div>
  );
}

// ============================================================
// APP SHELL
// ============================================================
const SCENES = [
  { id: "loader",     n: "01", title: "Loader",        sub: "Intro / chargement" },
  { id: "launch",     n: "02", title: "Lancement",     sub: "Lobby → grille" },
  { id: "completion", n: "03", title: "Complétion",    sub: "Couleur · colonne" },
  { id: "endgame",    n: "04", title: "Fin de partie", sub: "Victoire" },
  { id: "diceroll",   n: "05", title: "Lancer de dés", sub: "5 propositions" },
];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [scene, setScene] = useState("loader");
  const replayRef = useRef(null);

  useEffect(() => {
    document.body.classList.toggle("no-grain", FIXED_GRAIN !== "on");
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-text">ENCORE !</span>
          <span className="brand-sub">moments d'animation — GSAP</span>
        </div>
        <div className="meta-stamp">
          <div>v0.2 · paris · 12.05.2026</div>
          <div className="meta-sub">basculer · panneau <b>Tweaks</b></div>
        </div>
      </header>

      <nav className="scene-tabs">
        {SCENES.map(s => (
          <button
            key={s.id}
            className={`stab ${scene === s.id ? "on" : ""}`}
            onClick={() => setScene(s.id)}
          >
            <span className="stab-n">{s.n}</span>
            <span className="stab-mid">
              <span className="stab-title">{s.title}</span>
              <span className="stab-sub">{s.sub}</span>
            </span>
          </button>
        ))}
        <button className="replay-btn" onClick={() => replayRef.current?.()}>
          <span className="rb-ico">↻</span> rejouer la scène
        </button>
      </nav>

      <section className="stage-wrap">
        {scene === "loader" && (
          <LoaderScene ease={FIXED_EASE} speed={FIXED_SPEED} onReplayRef={replayRef} />
        )}
        {scene === "launch" && (
          <LaunchScene ease={FIXED_EASE} speed={FIXED_SPEED} onReplayRef={replayRef} />
        )}
        {scene === "completion" && (
          <CompletionScene ease={FIXED_EASE} speed={FIXED_SPEED} onReplayRef={replayRef} />
        )}
        {scene === "endgame" && (
          <EndGameScene ease={FIXED_EASE} speed={FIXED_SPEED} onReplayRef={replayRef} />
        )}
        {scene === "diceroll" && (
          <DiceRollScene onReplayRef={replayRef} />
        )}
      </section>

      <TweaksPanel>
        <TweakSection label="Scène" />
        <TweakButton label="↻ Rejouer la scène" onClick={() => replayRef.current?.()} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
