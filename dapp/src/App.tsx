import { HashRouter, Routes, Route, NavLink } from "react-router-dom";
import { abbreviateAddress, useConnection } from "@evefrontier/dapp-kit";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Treaties } from "./pages/Treaties";
import { TreatyDetail } from "./pages/TreatyDetail";
import { Propose } from "./pages/Propose";
import { Reputation } from "./pages/Reputation";

function App() {
  const { handleConnect, handleDisconnect } = useConnection();
  const account = useCurrentAccount();

  return (
    <HashRouter>
      <header className="app-header">
        <span className="app-title">Covenant</span>
        <nav className="app-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>Treaties</NavLink>
          <NavLink to="/propose" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>Propose</NavLink>
          <NavLink to="/reputation" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>Reputation</NavLink>
        </nav>
        <button className="wallet-btn" onClick={() => account?.address ? handleDisconnect() : handleConnect()}>
          {account ? abbreviateAddress(account.address) : "CONNECT WALLET"}
        </button>
      </header>

      <Routes>
        <Route path="/" element={<Treaties />} />
        <Route path="/treaty/:id" element={<TreatyDetail />} />
        <Route path="/propose" element={<Propose />} />
        <Route path="/reputation" element={<Reputation />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
