import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchTreatyIds, fetchTreaty, type TreatyData } from "../lib/sui";
import { STATUS_LABELS } from "../lib/constants";

function statusBadgeClass(status: number): string {
  const map: Record<number, string> = { 0: "badge-pending", 1: "badge-active", 2: "badge-violated", 3: "badge-completed", 4: "badge-cancelled" };
  return `badge ${map[status] || ""}`;
}

export function Treaties() {
  const [treaties, setTreaties] = useState<TreatyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const ids = await fetchTreatyIds();
      const results = await Promise.all(ids.map(fetchTreaty));
      setTreaties(results.filter((t): t is TreatyData => t !== null));
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="empty-state">SCANNING TREATIES...</div>;

  return (
    <div>
      <div className="page-title">Treaty Archive</div>
      {treaties.length === 0 ? (
        <div className="empty-state">No treaties found on-chain. Be the first to propose one.</div>
      ) : (
        treaties.map((t) => (
          <Link key={t.objectId} to={`/treaty/${t.objectId}`} className="treaty-link">
            <div className="card">
              <div className="card-header">
                <span className="card-title">{t.allianceAName} / {t.allianceBName}</span>
                <span className={statusBadgeClass(t.status)}>{STATUS_LABELS[t.status]}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Type</span>
                <span className="meta-value">{t.treatyType === 0 ? "Non-Aggression Pact" : "Ceasefire"}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Deposit</span>
                <span className="meta-value">{(t.depositRequired / 1e9).toFixed(2)} SUI</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Violations</span>
                <span className="meta-value">
                  <span className="strikes">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={`strike-dot ${i < t.violationCount ? "filled" : ""}`} />
                    ))}
                    {t.violationCount}/3
                  </span>
                </span>
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
