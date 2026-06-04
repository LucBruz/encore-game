/* global React, ReactDOM, useTweaks, TweaksPanel, TweakSection, LobbyScreen, GameScreen, ScoreScreen */
const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{}/*EDITMODE-END*/;

const FIXED_DICE_STYLE = "resin";
const FIXED_LOBBY = "editorial";
const FIXED_PALETTE = "paper";
const FIXED_ROLL = "tumble";
const FIXED_CELL = "stroke";
const FIXED_STROKE = "double";

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = useState("overview");

  useEffect(() => {
    document.body.setAttribute("data-palette", FIXED_PALETTE);
  }, []);

  useEffect(() => {
    const tabs = document.querySelectorAll("#screenTabs .tab");
    const onClick = (e) => {
      const s = e.currentTarget.dataset.screen;
      setScreen(s);
      tabs.forEach(tt => tt.classList.toggle("on", tt.dataset.screen === s));
    };
    tabs.forEach(tt => tt.addEventListener("click", onClick));
    return () => tabs.forEach(tt => tt.removeEventListener("click", onClick));
  }, []);

  return (
    <React.Fragment>
      {screen === "overview" && (
        <div>
          <div className="sect">
            <span className="num-label">§ 01</span>
            <h2>Lobby — editorial</h2>
            <span className="em"></span>
          </div>
          <LobbyScreen layout={FIXED_LOBBY} palette={FIXED_PALETTE} />

          <div className="sect">
            <span className="num-label">§ 02</span>
            <h2>En jeu — d&eacute;s r&eacute;sine, jet tumble, coche plume</h2>
            <span className="em"></span>
            <span className="annot">clique sur une case ↓</span>
          </div>
          <GameScreen diceStyle={FIXED_DICE_STYLE} rollAnim={FIXED_ROLL} cellAnim={FIXED_CELL} strokeStyle={FIXED_STROKE} palette={FIXED_PALETTE} />

          <div className="sect">
            <span className="num-label">§ 03</span>
            <h2>Tableau de score</h2>
            <span className="em"></span>
          </div>
          <ScoreScreen />
        </div>
      )}

      {screen === "lobby" && <LobbyScreen layout={FIXED_LOBBY} palette={FIXED_PALETTE} />}
      {screen === "game" && <GameScreen diceStyle={FIXED_DICE_STYLE} rollAnim={FIXED_ROLL} cellAnim={FIXED_CELL} strokeStyle={FIXED_STROKE} palette={FIXED_PALETTE} />}
      {screen === "score" && <ScoreScreen />}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
