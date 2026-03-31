import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchTreaty, type TreatyData } from "../lib/sui";
import { STATUS_LABELS, STATUS_ACTIVE, STATUS_PENDING, PACKAGE_ID, MODULE, TREATY_REGISTRY_ID, CLOCK_ID } from "../lib/constants";
import { Transaction } from "@mysten/sui/transactions";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";

function statusBadgeClass(status: number): string {
  const map: Record<number, string> = { 0: "badge-pending", 1: "badge-active", 2: "badge-violated", 3: "badge-completed", 4: "badge-cancelled" };
  return `badge ${map[status] || ""}`;
}

export function TreatyDetail() {
  const { id } = useParams<{ id: string }>();
  const [treaty, setTreaty] = useState<TreatyData | null>(null);
  const [loading, setLoading] = useState(true);
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const signAndExecute = dAppKit.signAndExecuteTransaction.bind(dAppKit);

  useEffect(() => {
    if (!id) return;
    fetchTreaty(id).then((t) => { setTreaty(t); setLoading(false); });
  }, [id]);

  const handleSign = async () => {
    if (!treaty || !account) return;
    const members = prompt("Enter member character IDs (comma separated):");
    if (!members) return;
    const memberIds = members.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));

    const tx = new Transaction();
    const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(treaty.depositRequired)]);
    tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE}::sign_treaty`,
      arguments: [
        tx.object(treaty.objectId),
        tx.object(TREATY_REGISTRY_ID),
        tx.pure.vector("u64", memberIds),
        depositCoin,
        tx.object(CLOCK_ID),
      ],
    });

    try {
      await signAndExecute({ transaction: tx });
      alert("Treaty signed!");
      fetchTreaty(treaty.objectId).then(setTreaty);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  const handleCancel = async () => {
    if (!treaty) return;
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE}::cancel_treaty`,
      arguments: [tx.object(treaty.objectId)],
    });
    try {
      await signAndExecute({ transaction: tx });
      alert("Treaty cancelled.");
      fetchTreaty(treaty.objectId).then(setTreaty);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  if (loading) return <div className="empty-state">LOADING TREATY...</div>;
  if (!treaty) return <div className="empty-state">Treaty not found.</div>;

  const isPartyB = account?.address === treaty.allianceBLeader;
  const isParty = account?.address === treaty.allianceALeader || isPartyB;
  const canSign = treaty.status === STATUS_PENDING && isPartyB;
  const canCancel = treaty.status === STATUS_PENDING && isParty;

  return (
    <div>
      <div className="page-title">Treaty Detail</div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">{treaty.allianceAName} / {treaty.allianceBName}</span>
          <span className={statusBadgeClass(treaty.status)}>{STATUS_LABELS[treaty.status]}</span>
        </div>

        <div className="meta-row"><span className="meta-label">Description</span><span className="meta-value">{treaty.description}</span></div>
        <div className="meta-row"><span className="meta-label">Type</span><span className="meta-value">{treaty.treatyType === 0 ? "Non-Aggression Pact" : "Ceasefire"}</span></div>
        <div className="meta-row"><span className="meta-label">Alliance A</span><span className="meta-value addr">{treaty.allianceALeader}</span></div>
        <div className="meta-row"><span className="meta-label">Alliance B</span><span className="meta-value addr">{treaty.allianceBLeader}</span></div>
        <div className="meta-row"><span className="meta-label">Deposit</span><span className="meta-value">{(treaty.depositRequired / 1e9).toFixed(2)} SUI each</span></div>

        {treaty.expiresAtMs > 0 && (
          <div className="meta-row"><span className="meta-label">Expires</span><span className="meta-value">{new Date(treaty.expiresAtMs).toLocaleString()}</span></div>
        )}
        {treaty.effectiveAtMs > 0 && (
          <div className="meta-row"><span className="meta-label">Effective Since</span><span className="meta-value">{new Date(treaty.effectiveAtMs).toLocaleString()}</span></div>
        )}

        <div className="meta-row">
          <span className="meta-label">Penalty Progress</span>
          <span className="meta-value">
            <span className="strikes">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`strike-dot ${i < treaty.violationCount ? "filled" : ""}`} />
              ))}
              {treaty.violationCount === 0 ? "Clean" : `${treaty.violationCount}/3 strikes`}
            </span>
          </span>
        </div>

        <div className="meta-row"><span className="meta-label">Object ID</span><span className="meta-value addr">{treaty.objectId}</span></div>
      </div>

      {(canSign || canCancel) && (
        <div className="actions">
          {canSign && <button className="btn-primary" onClick={handleSign}>SIGN TREATY</button>}
          {canCancel && <button className="btn-danger" onClick={handleCancel}>CANCEL</button>}
        </div>
      )}
    </div>
  );
}
