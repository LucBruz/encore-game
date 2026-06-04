/* global React, gsap, Dice3D, rollDice, animateCell, GRID_01, COLOR_MAP, COLS, ALL_COLORS, rndInt */
const { useState, useEffect, useRef, useMemo } = React;

// =====================================================
// LOBBY  — 4 layout flavours
// =====================================================
function LobbyScreen({ layout, palette }) {
  const heroRef = useRef(null);
  useEffect(() => {
    if (!heroRef.current) return;
    const chars = heroRef.current.querySelectorAll(".chr");
    gsap.from(chars, { y: 40, opacity: 0, rotate: -8, duration: 0.7, stagger: 0.05, ease: "back.out(2)" });
  }, [layout]);

  const word = "encore";
  const TitleHero = (
    <h1 ref={heroRef} aria-label="encore">
      {word.split("").map((c, i) => (
        <span key={i} className="chr" style={{ display: "inline-block" }}>{c}</span>
      ))}
      <span className="chr" style={{ color: "var(--accent)", display: "inline-block" }}>.</span>
    </h1>
  );

  if (layout === "editorial") {
    return (
      <div className="frame lobby" style={{ minHeight: 540 }}>
        <span className="reg reg-tl" style={{ position:"absolute", top:-7, left:-7 }}></span>
        <span className="reg reg-tr" style={{ position:"absolute", top:-7, right:-7 }}></span>
        <span className="reg reg-bl" style={{ position:"absolute", bottom:-7, left:-7 }}></span>
        <span className="reg reg-br" style={{ position:"absolute", bottom:-7, right:-7 }}></span>
        <div className="label">§00 · Accueil</div>
        <div className="label-r">v0.1 — paris</div>

        <div className="hero">
          {TitleHero}
          <div className="tagline">Jeu de soci&eacute;t&eacute; multijoueur en temps r&eacute;el. <span className="hand" style={{ color:"var(--accent)" }}>— jusqu'&agrave; 6 joueurs</span></div>
        </div>

        <div className="lobby-cols">
          <div className="lobby-col">
            <h3>Cr&eacute;er une partie</h3>
            <div className="meta" style={{ marginTop: 6 }}>Ton pr&eacute;nom</div>
            <div className="field empty"></div>
            <div className="meta" style={{ marginTop: 14 }}>Grille</div>
            <div className="chips">
              {["01","02","03","04","05","06","07","08"].map((g,i) => (
                <span key={g} className={`chip ${i===0?"on":""}`}>{g}</span>
              ))}
            </div>
            <MiniGrid />
            <div className="meta" style={{ marginTop: 14 }}>Temps par tour</div>
            <div className="chips">
              {["15s","30s","60s","90s","120s"].map((t,i)=>(
                <span key={t} className={`chip ${i===2?"on":""}`}>{t}</span>
              ))}
            </div>
            <button className="cta primary" style={{ marginTop: 18 }}>Cr&eacute;er la partie <span className="num"> →</span></button>
          </div>
          <div className="div"></div>
          <div className="lobby-col">
            <h3>Rejoindre une partie</h3>
            <div className="meta" style={{ marginTop: 6 }}>Ton pr&eacute;nom</div>
            <div className="field empty"></div>
            <div className="meta" style={{ marginTop: 14 }}>Code de la partie</div>
            <div className="field num" style={{ fontSize: 22, letterSpacing: ".25em" }}>X&nbsp;K&nbsp;9&nbsp;2&nbsp;P&nbsp;L</div>
            <button className="cta" style={{ marginTop: 18 }}>Rejoindre <span className="num"> →</span></button>

            <div className="meta" style={{ marginTop: 32 }}>R&egrave;gle express<sup style={{color:"var(--accent)"}}>¹</sup></div>
            <p style={{ marginTop: 6, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.55 }}>
              7 lignes &times; 15 colonnes &mdash; coche des cases de m&ecirc;me couleur, adjacentes, en suivant les d&eacute;s. La partie se termine quand un joueur compl&egrave;te <b>deux couleurs</b>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (layout === "stacked") {
    return (
      <div className="frame lobby" style={{ minHeight: 540 }}>
        <span className="reg reg-tl" style={{ position:"absolute", top:-7, left:-7 }}></span>
        <span className="reg reg-tr" style={{ position:"absolute", top:-7, right:-7 }}></span>
        <span className="reg reg-bl" style={{ position:"absolute", bottom:-7, left:-7 }}></span>
        <span className="reg reg-br" style={{ position:"absolute", bottom:-7, right:-7 }}></span>
        <div className="label">§00 · Accueil — variante empil&eacute;e</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 36, alignItems: "center" }}>
          <div>
            {TitleHero}
            <p className="tagline" style={{ marginTop: 12, maxWidth: "32ch" }}>
              <i style={{ fontFamily: "var(--serif)" }}>Voici Encore.</i> Un jeu de soci&eacute;t&eacute; multijoueur, en temps r&eacute;el, jou&eacute; au crayon. Aucun compte, aucun email &mdash; un code &agrave; 6 lettres suffit.
            </p>
            <div style={{ display:"flex", gap: 10, marginTop: 18 }}>
              <button className="cta primary">Cr&eacute;er une partie</button>
              <button className="cta">Rejoindre</button>
            </div>
            <div className="meta" style={{ marginTop: 36 }}>§ 01 &mdash; choisis ta grille</div>
            <div className="chips" style={{ marginTop: 8 }}>
              {["01","02","03","04","05","06","07","08"].map((g,i) => (
                <span key={g} className={`chip ${i===0?"on":""}`}>grille {g}</span>
              ))}
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <MiniGrid big />
            <div className="hand" style={{ position:"absolute", bottom: -28, right: 12, color: "var(--accent)", transform: "rotate(-3deg)" }}>
              ↑ aper&ccedil;u de la grille
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (layout === "ticket") {
    return (
      <div className="frame lobby" style={{ minHeight: 540, padding: 0 }}>
        <div style={{ padding: 28, borderBottom: "1px dashed var(--rule)", display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
          <div className="meta">N° 0001 &mdash; ticket de partie</div>
          <div className="meta">12.05.2026 &mdash; 14:30</div>
        </div>
        <div style={{ padding: "36px 36px 28px" }}>
          {TitleHero}
          <div className="tagline" style={{ marginTop: 8 }}>D&eacute;chire ici si tu veux jouer.</div>
        </div>
        <div className="rule" style={{ borderTopStyle: "dashed" }}></div>
        <div style={{ padding: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <div className="meta">Cr&eacute;er</div>
            <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {["01","02","03","04"].map((g,i) => (
                <span key={g} className={`chip ${i===0?"on":""}`}>grille {g}</span>
              ))}
            </div>
            <div className="meta" style={{ marginTop: 14 }}>Dur&eacute;e tour</div>
            <div className="chips" style={{ marginTop: 6 }}>
              {["30s","60s","90s"].map((t,i)=>(
                <span key={t} className={`chip ${i===1?"on":""}`}>{t}</span>
              ))}
            </div>
            <button className="cta primary" style={{ marginTop: 18 }}>Cr&eacute;er ma partie</button>
          </div>
          <div style={{ borderLeft: "1px dashed var(--rule)", paddingLeft: 24 }}>
            <div className="meta">Rejoindre</div>
            <div className="field num" style={{ fontSize: 28, letterSpacing: ".25em", marginTop: 8 }}>__&nbsp;__&nbsp;__&nbsp;__&nbsp;__&nbsp;__</div>
            <div className="meta" style={{ marginTop: 12 }}>Entre le code &agrave; 6 lettres</div>
            <button className="cta" style={{ marginTop: 18 }}>Rejoindre</button>
          </div>
        </div>
        <div style={{ borderTop: "1px dashed var(--rule)", padding: "14px 28px", display:"flex", justifyContent:"space-between" }}>
          <div className="meta">Encore. &mdash; Multijoueur — Temps r&eacute;el</div>
          <div className="meta">¶ Conserve ce ticket</div>
        </div>
      </div>
    );
  }

  // "playful" — variant 4, dice + tagline
  return (
    <div className="frame lobby" style={{ minHeight: 540 }}>
      <span className="reg reg-tl" style={{ position:"absolute", top:-7, left:-7 }}></span>
      <span className="reg reg-br" style={{ position:"absolute", bottom:-7, right:-7 }}></span>
      <div className="label">§00 · Accueil — variante d&eacute;s</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36, alignItems: "center" }}>
        <div>
          {TitleHero}
          <div className="tagline" style={{ marginTop: 12 }}>Un tour. Trois d&eacute;s couleur. Trois d&eacute;s chiffre. <span className="hand" style={{ color:"var(--accent)" }}>fais le bon coup.</span></div>
          <div className="meta" style={{ marginTop: 24 }}>D&eacute;marrer en 10 secondes</div>
          <div className="field empty" style={{ marginTop: 6 }}></div>
          <div style={{ display:"flex", gap: 10, marginTop: 18 }}>
            <button className="cta primary">Cr&eacute;er →</button>
            <button className="cta">Rejoindre avec un code</button>
          </div>
        </div>
        <div style={{ position: "relative", display:"flex", justifyContent:"center", alignItems:"center", gap: 18, flexWrap:"wrap" }}>
          <Dice3D kind="color" value="g" style="resin" />
          <Dice3D kind="color" value="o" style="resin" />
          <Dice3D kind="color" value="x" style="resin" />
          <Dice3D kind="number" value="3" style="resin" />
          <Dice3D kind="number" value="5" style="resin" />
          <Dice3D kind="number" value="1" style="resin" />
        </div>
      </div>
    </div>
  );
}

function MiniGrid({ big = false }) {
  const cells = GRID_01;
  return (
    <div className="mini-grid" style={{ maxWidth: big ? 480 : 320, gap: big ? 3 : 2 }}>
      {cells.map(([c, s], i) => (
        <div key={i} className={`mc ${c}`}>
          {s ? <span className="star"></span> : null}
        </div>
      ))}
    </div>
  );
}

// =====================================================
// DICE GALLERY — 4 style variants × 1 sample, with roll trigger
// =====================================================
function DiceGallery({ activeStyle, activeRoll, onPick }) {
  const styles = [
    { id: "letterpress", name: "Letterpress",   note: "papier, gaufr&eacute;, hairline" },
    { id: "resin",       name: "R&eacute;sine",        note: "arrondi, brillant doux" },
    { id: "bone",        name: "Ivoire",        note: "os grav&eacute;, vintage" },
    { id: "wood",        name: "Bois",          note: "bloc, veinage, chaud" },
  ];
  const refs = useRef({});
  const triggerAll = () => {
    Object.entries(refs.current).forEach(([k, el], i) => {
      rollDice({ el, anim: activeRoll, delay: activeRoll === "cascade" ? i * 0.08 : 0 });
    });
  };
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 14 }}>
        <div className="meta">4 directions — touches diff&eacute;rentes du m&ecirc;me objet</div>
        <button className="roll-btn" onClick={triggerAll}>relancer tout →</button>
      </div>
      <div className="row-4">
        {styles.map(s => (
          <div key={s.id}
               className={`frame dice-cell`}
               style={{ borderColor: s.id === activeStyle ? "var(--accent)" : undefined }}
               onClick={() => { onPick(s.id); }}>
            <span className="reg reg-tl" style={{ position:"absolute", top:-7, left:-7 }}></span>
            <span className="reg reg-br" style={{ position:"absolute", bottom:-7, right:-7 }}></span>
            <div className="label">{s.id === activeStyle ? "★ choisi" : "cliquer"}</div>
            <div style={{ display:"flex", gap: 18 }}>
              <Dice3D style={s.id} kind="number" value="5" sceneRef={el => refs.current[s.id+"-n"] = el} />
              <Dice3D style={s.id} kind="color"  value="o" sceneRef={el => refs.current[s.id+"-c"] = el} />
            </div>
            <div className="name">{s.name}</div>
            <div className="caption" dangerouslySetInnerHTML={{__html: s.note}}></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================
// GAME SCREEN
// =====================================================
const TURN_ROLLS = [
  { colors: ["g", "y", "o"], numbers: [3, 5, 2] },
  { colors: ["b", "p", "x"], numbers: [4, 1, 5] },
];

function GameScreen({ diceStyle, rollAnim, cellAnim, strokeStyle, palette }) {
  const [turn, setTurn] = useState(0);
  const [pickedColor, setPickedColor] = useState(null);
  const [pickedNum, setPickedNum] = useState(null);
  const [checkedIdx, setCheckedIdx] = useState(() => new Set([
    // a few pre-checked cells in column H area for context (col index 7)
    7+15*0, 7+15*1, 7+15*2, // column H, rows 0–2
    8+15*1, 9+15*1,
  ]));
  const rolling = useRef(false);
  const cRefs = useRef({});
  const nRefs = useRef({});
  const cellRefs = useRef({});

  const roll = () => {
    if (rolling.current) return;
    rolling.current = true;
    const all = [...Object.values(cRefs.current), ...Object.values(nRefs.current)];
    all.forEach((el, i) => {
      rollDice({ el, anim: rollAnim, delay: rollAnim === "cascade" ? i * 0.08 : (rollAnim === "burst" ? i * 0.04 : 0) });
    });
    setTimeout(() => { rolling.current = false; }, 1100);
  };

  const dat = TURN_ROLLS[turn % TURN_ROLLS.length];

  // Cell click handler
  const onCellClick = (i, color) => {
    if (checkedIdx.has(i)) return;
    setCheckedIdx(s => { const ns = new Set(s); ns.add(i); return ns; });
    requestAnimationFrame(() => {
      const el = cellRefs.current[i];
      const ripples = el?.querySelectorAll(".ripple");
      animateCell({ el, anim: cellAnim, ripples });
    });
  };

  // Trigger initial roll animation
  useEffect(() => {
    setTimeout(roll, 250);
    // eslint-disable-next-line
  }, []);

  return (
    <div>
      {/* Header strip — turn info */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom: 18, marginTop: 8, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="meta">Tour {turn+1} · joueur actif</div>
          <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 28 }}>Alice <span style={{ color:"var(--accent)" }}>—</span> &agrave; toi</div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="ribbon"><span className="dot"></span> 52 s restant</div>
          <button className="roll-btn" onClick={() => { setTurn(t => t+1); setPickedColor(null); setPickedNum(null); setTimeout(roll, 200); }}>
            relancer →
          </button>
        </div>
      </div>

      {/* Dice tray */}
      <div className="frame" style={{ padding: "32px 28px" }}>
        <span className="reg reg-tl" style={{ position:"absolute", top:-7, left:-7 }}></span>
        <span className="reg reg-tr" style={{ position:"absolute", top:-7, right:-7 }}></span>
        <div className="label">§ d&eacute;s du tour</div>
        <div className="dice-tray">
          <div className="group" style={{ position: "relative" }}>
            <span className="lbl">3 couleurs</span>
            {dat.colors.map((c, i) => (
              <div key={i} onClick={() => setPickedColor(i)} style={{ cursor: "pointer", outline: pickedColor === i ? "2px solid var(--accent)" : "none", outlineOffset: 4 }}>
                <Dice3D style={diceStyle} kind="color" value={c} sceneRef={el => cRefs.current[i] = el} />
              </div>
            ))}
          </div>
          <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 36, color: "var(--ink-soft)" }}>×</div>
          <div className="group" style={{ position: "relative" }}>
            <span className="lbl">3 chiffres</span>
            {dat.numbers.map((n, i) => (
              <div key={i} onClick={() => setPickedNum(i)} style={{ cursor: "pointer", outline: pickedNum === i ? "2px solid var(--accent)" : "none", outlineOffset: 4 }}>
                <Dice3D style={diceStyle} kind="number" value={n} sceneRef={el => nRefs.current[i] = el} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <div className="meta">
            Combo {pickedColor != null ? <b style={{color:"var(--accent)"}}>{COLOR_MAP[dat.colors[pickedColor]]?.name ?? "joker"}</b> : <span>—</span>}
            &nbsp;&times;&nbsp;
            <b className="num">{pickedNum != null ? dat.numbers[pickedNum] : "—"}</b>
          </div>
          <div className="meta">
            <span className="hand" style={{ color: "var(--accent)", fontSize: 18 }}>clique sur 1 couleur + 1 chiffre.</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ marginTop: 28 }} className="frame">
        <span className="reg reg-tl" style={{ position:"absolute", top:-7, left:-7 }}></span>
        <span className="reg reg-br" style={{ position:"absolute", bottom:-7, right:-7 }}></span>
        <div className="label">§ grille — joueur Alice</div>
        <div className="label-r">grille 01</div>

        <div className="col-head">
          {COLS.map((c, i) => <div key={c} className={`h${i===7?" cur":""}`}>{c}</div>)}
        </div>
        <div className="game-grid">
          {GRID_01.map(([color, star], i) => {
            const col = i % 15;
            const isChecked = checkedIdx.has(i);
            return (
              <div
                key={i}
                ref={el => cellRefs.current[i] = el}
                className={`cell cell-${color}${col===7?" col-h":""}${isChecked?" checked":""}`}
                onClick={() => onCellClick(i, color)}
                style={{ transformStyle: "preserve-3d" }}
              >
                {star ? <span className="star"></span> : null}
                {isChecked ? (
                  cellAnim === "stroke"
                    ? (() => {
                        // strokeStyle: "straight" | "subtle" | "sketchy" | "double"
                        const j = (amount) => (Math.random() - 0.5) * amount;
                        let d1, d2;
                        if (strokeStyle === "straight") {
                          d1 = `M4 4 L20 20`;
                          d2 = `M20 4 L4 20`;
                        } else if (strokeStyle === "subtle") {
                          d1 = `M${4+j(.6)} ${4+j(.4)} C ${9+j(.6)} ${8+j(.6)}, ${15+j(.6)} ${14+j(.6)}, ${20+j(.4)} ${20+j(.4)}`;
                          d2 = `M${20+j(.6)} ${4+j(.4)} C ${15+j(.6)} ${9+j(.6)}, ${9+j(.6)} ${15+j(.6)}, ${4+j(.4)} ${20+j(.4)}`;
                        } else if (strokeStyle === "sketchy") {
                          d1 = `M${3+j(1.6)} ${3+j(1.4)} C ${7+j(2)} ${9+j(2)}, ${16+j(2)} ${13+j(2)}, ${21+j(1.4)} ${21+j(1.4)}`;
                          d2 = `M${21+j(1.6)} ${3+j(1.4)} C ${16+j(2)} ${8+j(2)}, ${7+j(2)} ${15+j(2)}, ${3+j(1.4)} ${21+j(1.4)}`;
                        } else {
                          d1 = `M${4+j(.6)} ${4+j(.4)} Q ${12+j(.6)} ${11+j(.6)}, ${20+j(.4)} ${20+j(.4)}`;
                          d2 = `M${20+j(.6)} ${4+j(.4)} Q ${12+j(.6)} ${13+j(.6)}, ${4+j(.4)} ${20+j(.4)}`;
                        }
                        const useWobble = strokeStyle !== "straight";
                        return (
                          <svg className="x" viewBox="0 0 24 24" width="72%" height="72%" style={{ position:"absolute", inset:"14%", overflow:"visible" }}>
                            <path className="check-path" d={d1} style={{ filter: useWobble ? "url(#penWobble)" : "none" }}></path>
                            <path className="check-path" d={d2} style={{ filter: useWobble ? "url(#penWobble)" : "none" }}></path>
                          </svg>
                        );
                      })()
                    : <span className="x" style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--ink)" }}>✕</span>
                ) : null}
                {cellAnim === "ripple" && isChecked ? (
                  <>
                    <span className="ripple" style={{ position:"absolute", inset:-2, border:"1px solid var(--accent)", pointerEvents:"none" }}></span>
                    <span className="ripple" style={{ position:"absolute", inset:-6, border:"1px solid var(--accent)", opacity:.5, pointerEvents:"none" }}></span>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="meta" style={{ marginTop: 10 }}>
          <span className="hand" style={{ color:"var(--accent)", fontSize: 18 }}>clique sur n'importe quelle case ↑</span>
          pour pr&eacute;visualiser l'anim de coche
        </div>
      </div>
    </div>
  );
}

// =====================================================
// SCORE PANEL
// =====================================================
function ScoreScreen() {
  const playerARef = useRef(null);
  const playerBRef = useRef(null);

  useEffect(() => {
    const lines = document.querySelectorAll(".score-table tbody tr");
    gsap.from(lines, { opacity: 0, x: 12, duration: 0.5, stagger: 0.05, ease: "power2.out" });
    const totals = document.querySelectorAll(".score-total-num");
    totals.forEach(t => {
      const target = parseInt(t.dataset.v, 10);
      const obj = { n: 0 };
      gsap.to(obj, { n: target, duration: 1.2, ease: "power3.out", onUpdate: () => t.textContent = Math.round(obj.n) });
    });
  }, []);

  const Table = ({ name, jokers, stars, columns, colors, total }) => (
    <div className="frame" style={{ padding: 24 }}>
      <span className="reg reg-tl" style={{ position:"absolute", top:-7, left:-7 }}></span>
      <span className="reg reg-br" style={{ position:"absolute", bottom:-7, right:-7 }}></span>
      <div className="label">§ joueur</div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
        <div style={{ fontFamily:"var(--serif)", fontStyle:"italic", fontSize: 28 }}>{name}</div>
        <div className="meta">final · partie #0001</div>
      </div>
      <table className="score-table">
        <tbody>
          <tr><th>Bonus couleurs <small style={{ color:"var(--ink-mute)" }}>(5/3 + ...)</small></th><td>{colors}</td></tr>
          <tr><th>A→O colonnes</th><td>{columns}</td></tr>
          <tr><th>Jokers restants <small>(+1)</small></th><td>{jokers}</td></tr>
          <tr><th>Étoiles non coch&eacute;es <small>(−2)</small></th><td>{stars}</td></tr>
          <tr className="total"><th>Total</th><td><span className="score-total-num" data-v={total}>0</span></td></tr>
        </tbody>
      </table>
      <div style={{ marginTop: 14 }}>
        <div className="meta">Couleurs compl&eacute;t&eacute;es</div>
        <div style={{ display:"flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {["g","y","b","p","o"].map(c => (
            <span key={c} className="chip" style={{ display:"inline-flex", alignItems:"center", gap: 6 }}>
              <span className="swatch" style={{ background: `var(--${c})` }}></span>
              {COLOR_MAP[c].name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="ribbon" style={{ marginBottom: 16 }}><span className="dot"></span> Partie termin&eacute;e — Alice gagne</div>
      <div className="score-wrap" ref={playerARef}>
        <Table name="Alice"  jokers={8} stars="—2" columns={9}  colors={13} total={28} />
        <Table name="Bob"    jokers={5} stars="—4" columns={6}  colors={8}  total={15} />
      </div>

      <div className="frame" style={{ marginTop: 28, padding: 24 }}>
        <div className="label">§ &eacute;volution du score — tour par tour</div>
        <div style={{ display:"grid", gridTemplateColumns: "120px 1fr", gap: 18, alignItems:"center", marginTop: 6 }}>
          <div style={{ fontFamily:"var(--serif)", fontStyle: "italic", fontSize: 18 }}>Alice</div>
          <div className="sparkbar">{Array.from({length: 24}, (_,i) => <i key={i} style={{ height: `${20 + i*3}%`, background: "var(--accent)" }}></i>)}</div>
          <div style={{ fontFamily:"var(--serif)", fontStyle: "italic", fontSize: 18 }}>Bob</div>
          <div className="sparkbar">{Array.from({length: 24}, (_,i) => <i key={i} style={{ height: `${15 + i*1.8}%` }}></i>)}</div>
        </div>
        <div className="meta" style={{ marginTop: 12 }}>24 tours jou&eacute;s — 6 min 14 s</div>
      </div>
    </div>
  );
}

window.LobbyScreen = LobbyScreen;
window.GameScreen = GameScreen;
window.ScoreScreen = ScoreScreen;
window.DiceGallery = DiceGallery;
