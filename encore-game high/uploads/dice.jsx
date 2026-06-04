/* global React, gsap */
const { useState, useEffect, useRef } = React;

// ----- Random helpers -----
const rnd = (a, b) => a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
const COLOR_KEYS = ["g","y","b","p","o","x"]; // x = joker
const ALL_COLORS = ["g","y","b","p","o"];

// ===== Generic 3D dice (color or number) =====
function Dice3D({ style = "letterpress", kind = "number", value, size = "lg", spinning = false, onClick, sceneRef }) {
  const localRef = useRef(null);
  const ref = sceneRef || localRef;

  // 6 faces — for number kind, show 6 random number values; for color, show 6 random color faces
  // The "front" (fA) face shows the resolved value.
  const faces = React.useMemo(() => {
    const arr = ["A","B","C","D","T","Bt"];
    if (kind === "number") {
      const pool = [1,2,3,4,5,6];
      return arr.map((pos, i) => ({ pos, val: pos === "A" ? (value ?? 1) : pool[i] }));
    }
    return arr.map((pos, i) => ({ pos, val: pos === "A" ? (value ?? "g") : COLOR_KEYS[i % COLOR_KEYS.length] }));
  }, [value, kind]);

  const Pip = ({ k }) => {
    const cls = `pip pip-${k}`;
    return <span className={cls} />;
  };

  return (
    <div className={`scene${size === "sm" ? " scene-sm" : ""}`} onClick={onClick}>
      <div ref={ref} className={`dice3d style-${style}`}>
        {faces.map(({ pos, val }) => (
          <div key={pos} className={`face f${pos}${kind === "color" ? " dot" : ""}`}>
            {kind === "number" ? <span>{val}</span> : <Pip k={val} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Roll animations =====
// rollAnim names: "tumble" | "snap" | "cascade" | "slot" | "burst"
function rollDice({ el, anim, delay = 0, finalRotX = 0, finalRotY = 0 }) {
  if (!el) return;
  const tl = gsap.timeline({ delay });
  // reset
  gsap.set(el, { rotateX: 0, rotateY: 0, x: 0, y: 0, scale: 1 });

  // NOTE: finalRotX/Y are added but final resting position must be 0 mod 360 on both
  // axes so the front face (fA) is visible. We use small jitter ±15deg passed in,
  // and zero it for the final keyframe instead.
  if (anim === "tumble") {
    tl.to(el, { y: -50, duration: 0.18, ease: "power2.out" })
      .to(el, { y: 8, duration: 0.18, ease: "power2.in" })
      .to(el, { y: -22, duration: 0.14, ease: "power2.out" }, "<")
      .to(el, { y: 0, duration: 0.20, ease: "power2.in" })
      .to(el, { rotateX: 720, rotateY: 720, duration: 0.7, ease: "power3.out" }, 0)
      .to(el, { scale: 1.05, duration: 0.08, ease: "power2.out" }, ">-0.1")
      .to(el, { scale: 1, duration: 0.18, ease: "power2.inOut" });
  } else if (anim === "snap") {
    tl.to(el, { rotateX: 720, rotateY: 720, duration: 0.35, ease: "power4.in" })
      .to(el, { scale: 1.12, duration: 0.07, ease: "power2.out" })
      .to(el, { scale: 1, duration: 0.12, ease: "power2.inOut" });
  } else if (anim === "cascade") {
    tl.fromTo(el, { y: -80, opacity: 0, rotateX: -360, rotateY: -360 },
      { y: 0, opacity: 1, rotateX: 0, rotateY: 0, duration: 0.55, ease: "back.out(2.2)" })
      .to(el, { y: -8, duration: 0.08, ease: "power2.out" })
      .to(el, { y: 0, duration: 0.12, ease: "power2.in" });
  } else if (anim === "slot") {
    tl.to(el, { rotateY: 1440, duration: 0.6, ease: "expo.out" })
      .to(el, { rotateX: 0, duration: 0.2, ease: "back.out(2)" }, "<0.4");
  } else if (anim === "burst") {
    tl.fromTo(el, { scale: 0.2, opacity: 0, rotateX: 360, rotateY: 360 },
      { scale: 1.15, opacity: 1, rotateX: 360, rotateY: 360, duration: 0.45, ease: "power3.out" })
      .to(el, { rotateX: 720, rotateY: 720, scale: 1, duration: 0.35, ease: "power2.inOut" });
  }
  return tl;
}

// ===== Cell anim variants =====
// "pop" | "stroke" | "ripple" | "flip"
function animateCell({ el, anim, ripples }) {
  if (!el) return;
  if (anim === "pop") {
    gsap.fromTo(el, { scale: 0.6 }, { scale: 1, duration: 0.45, ease: "elastic.out(1.2,0.4)" });
    gsap.fromTo(el.querySelector(".x"), { scale: 0, rotate: -25 }, { scale: 1, rotate: 0, duration: 0.35, ease: "back.out(2.5)" });
  } else if (anim === "stroke") {
    const paths = el.querySelectorAll(".check-path");
    if (paths.length) {
      paths.forEach((p, i) => {
        const len = p.getTotalLength();
        gsap.set(p, { strokeDasharray: len, strokeDashoffset: len, opacity: 1 });
        gsap.to(p, { strokeDashoffset: 0, duration: 0.32, ease: "power1.inOut", delay: i * 0.28 });
      });
    }
    gsap.fromTo(el, { scale: 0.97 }, { scale: 1, duration: 0.25, ease: "power2.out" });
  } else if (anim === "ripple") {
    gsap.fromTo(el, { scale: 0.85 }, { scale: 1, duration: 0.3, ease: "power2.out" });
    gsap.fromTo(el.querySelector(".x"), { scale: 0 }, { scale: 1, duration: 0.3, ease: "back.out(2)" });
    if (ripples) ripples.forEach((r, i) => {
      gsap.fromTo(r, { scale: 0.6, opacity: 0.45 },
        { scale: 1, opacity: 0, duration: 0.5 + i * 0.05, delay: i * 0.04, ease: "power2.out" });
    });
  } else if (anim === "flip") {
    gsap.fromTo(el, { rotateY: -180 }, { rotateY: 0, duration: 0.45, ease: "power3.out", transformPerspective: 400 });
    gsap.fromTo(el.querySelector(".x"), { opacity: 0 }, { opacity: 1, duration: 0.2, delay: 0.2 });
  }
}

window.Dice3D = Dice3D;
window.rollDice = rollDice;
window.animateCell = animateCell;
window.ALL_COLORS = ALL_COLORS;
window.COLOR_KEYS = COLOR_KEYS;
window.rndInt = rndInt;
