import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import { PACKAGE_ID } from "../lib/constants";
import { CovenantLogo } from "../components/CovenantLogo";

export function Landing() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setReady(true));
  }, []);

  return (
    <div className="landing">
      {ready && (
        <Particles
          id="tsparticles"
          options={{
            fullScreen: { enable: true, zIndex: -1 },
            background: { color: "transparent" },
            fpsLimit: 30,
            particles: {
              number: { value: 60, density: { enable: true } },
              color: { value: ["#b8943e", "#e8dcc8", "#e85d26"] },
              opacity: { value: { min: 0.1, max: 0.4 }, animation: { enable: true, speed: 0.3, sync: false } },
              size: { value: { min: 1, max: 2.5 } },
              move: { enable: true, speed: 0.3, direction: "none", outModes: "out" },
              links: { enable: false },
            },
            detectRetina: true,
          }}
        />
      )}

      {/* Hero */}
      <section className="hero">
        <div className="hero-logo">
          <CovenantLogo size={240} />
        </div>
        <h1 className="hero-title">BREAK THE PACT,<br />LOSE YOUR STAKE</h1>
        <p className="hero-subtitle">Self-executing diplomatic treaties for EVE Frontier</p>
        <div className="hero-actions">
          <Link to="/treaties" className="btn-primary hero-btn">ENTER APP</Link>
          <a
            href={`https://suiscan.xyz/testnet/object/${PACKAGE_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline hero-btn"
          >
            VIEW ON SUI
          </a>
        </div>
      </section>

      {/* Penalty visualization */}
      <section className="penalty-viz">
        <div className="treaty-line-anim">
          <div className="node node-a">A</div>
          <div className="links-container">
            <div className="link-bar link-1"><div className="crack" /></div>
            <div className="link-bar link-2"><div className="crack" /></div>
            <div className="link-bar link-3"><div className="crack" /></div>
          </div>
          <div className="node node-b">B</div>
        </div>
        <p className="penalty-label">Graduated penalty: 20% &rarr; 40% &rarr; 100% forfeiture</p>
      </section>

      {/* Three modules */}
      <section className="modules-section">
        <div className="module-card">
          <div className="module-hex">&#x2B22;</div>
          <h3 className="module-title">Treaty Core</h3>
          <p className="module-desc">Lifecycle, escrow, graduated penalty</p>
        </div>
        <div className="module-card">
          <div className="module-hex">&#x2B22;</div>
          <h3 className="module-title">Alliance Reputation</h3>
          <p className="module-desc">On-chain compliance scores</p>
        </div>
        <div className="module-card">
          <div className="module-hex">&#x2B22;</div>
          <h3 className="module-title">Gate Enforcement</h3>
          <p className="module-desc">Violators denied passage</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-links">
          <a href="https://github.com/apkaisaw/covenant" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href={`https://suiscan.xyz/testnet/object/${PACKAGE_ID}`} target="_blank" rel="noopener noreferrer">Sui Explorer</a>
        </div>
        <p className="footer-tagline">Built for the 2026 EVE Frontier x Sui Hackathon</p>
      </footer>
    </div>
  );
}
