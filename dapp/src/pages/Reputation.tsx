import { useState } from "react";
import { fetchAllianceStats } from "../lib/sui";

export function Reputation() {
  const [address, setAddress] = useState("");
  const [stats, setStats] = useState<{ signed: number; honored: number; violated: number; compensationPaid: number; honorRate: number } | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!address) return;
    setLoading(true);
    setSearched(true);
    const result = await fetchAllianceStats(address);
    setStats(result);
    setLoading(false);
  };

  return (
    <div>
      <div className="page-title">Alliance Reputation</div>
      <div className="card">
        <div className="form-group">
          <label className="form-label">Alliance Leader Address</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input className="form-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x..." />
            <button className="btn-primary" onClick={handleSearch} disabled={loading}>
              {loading ? "..." : "QUERY"}
            </button>
          </div>
        </div>
      </div>

      {searched && !loading && (
        <div className="card">
          {stats ? (
            <>
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-bone-muted)", textTransform: "uppercase", marginBottom: "8px" }}>Honor Rate</div>
                <div className="honor-rate">{(stats.honorRate / 100).toFixed(1)}%</div>
              </div>
              <div className="stat-grid">
                <div className="stat-box">
                  <div className="stat-number">{stats.signed}</div>
                  <div className="stat-label">Treaties Signed</div>
                </div>
                <div className="stat-box">
                  <div className="stat-number">{stats.honored}</div>
                  <div className="stat-label">Treaties Honored</div>
                </div>
                <div className="stat-box">
                  <div className="stat-number">{stats.violated}</div>
                  <div className="stat-label">Violations</div>
                </div>
                <div className="stat-box">
                  <div className="stat-number">{(stats.compensationPaid / 1e9).toFixed(2)}</div>
                  <div className="stat-label">SUI Forfeited</div>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              No diplomatic record found for this address.<br />
              This alliance has not signed any treaties yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
