import { HashRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { abbreviateAddress, useConnection } from "@evefrontier/dapp-kit";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Landing } from "./pages/Landing";
import { Treaties } from "./pages/Treaties";
import { TreatyDetail } from "./pages/TreatyDetail";
import { Propose } from "./pages/Propose";
import { Reputation } from "./pages/Reputation";

function AppContent() {
  const { handleConnect, handleDisconnect } = useConnection();
  const account = useCurrentAccount();
  const location = useLocation();
  const isLanding = location.pathname === "/";

  return (
    <>
      {!isLanding && (
        <header className="app-header">
          <NavLink to="/" className="app-title" style={{ textDecoration: "none" }}>Covenant</NavLink>
          <nav className="app-nav">
            <NavLink to="/treaties" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>Treaties</NavLink>
            <NavLink to="/propose" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>Propose</NavLink>
            <NavLink to="/reputation" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>Reputation</NavLink>
          </nav>
          <button className="wallet-btn" onClick={() => account?.address ? handleDisconnect() : handleConnect()}>
            {account ? abbreviateAddress(account.address) : "CONNECT WALLET"}
          </button>
        </header>
      )}

      <div className={isLanding ? "" : "page-fade-in"}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/treaties" element={<Treaties />} />
          <Route path="/treaty/:id" element={<TreatyDetail />} />
          <Route path="/propose" element={<Propose />} />
          <Route path="/reputation" element={<Reputation />} />
        </Routes>
      </div>
    </>
  );
}

function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}

export default App;
