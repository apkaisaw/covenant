import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, MODULE, CLOCK_ID } from "../lib/constants";

export function Propose() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const signAndExecute = dAppKit.signAndExecuteTransaction.bind(dAppKit);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    treatyType: "0",
    description: "",
    allianceAName: "",
    allianceBName: "",
    allianceBLeader: "",
    membersA: "",
    depositSui: "0.5",
    durationHours: "0",
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (!account) return alert("Connect your wallet first.");
    setSubmitting(true);

    try {
      const memberIds = form.membersA.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
      const depositMist = Math.floor(parseFloat(form.depositSui) * 1e9);
      const durationMs = Math.floor(parseFloat(form.durationHours) * 3600000);

      const tx = new Transaction();
      const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(depositMist)]);

      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::create_treaty`,
        arguments: [
          tx.pure.u8(parseInt(form.treatyType)),
          tx.pure.vector("u8", new TextEncoder().encode(form.description)),
          tx.pure.vector("u8", new TextEncoder().encode(form.allianceAName)),
          tx.pure.vector("u8", new TextEncoder().encode(form.allianceBName)),
          tx.pure.address(form.allianceBLeader),
          tx.pure.vector("u64", memberIds),
          tx.pure.u64(depositMist),
          tx.pure.u64(durationMs),
          depositCoin,
          tx.object(CLOCK_ID),
        ],
      });

      await signAndExecute({ transaction: tx });
      alert("Treaty proposed!");
      navigate("/");
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-title">Propose Treaty</div>
      <div className="card">
        <div className="form-group">
          <label className="form-label">Treaty Type</label>
          <select className="form-input" value={form.treatyType} onChange={(e) => set("treatyType", e.target.value)}>
            <option value="0">Non-Aggression Pact (NAP)</option>
            <option value="1">Ceasefire</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-textarea" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Terms of the treaty..." />
        </div>

        <div className="form-group">
          <label className="form-label">Your Alliance Name</label>
          <input className="form-input" value={form.allianceAName} onChange={(e) => set("allianceAName", e.target.value)} placeholder="Alpha Fleet" />
        </div>

        <div className="form-group">
          <label className="form-label">Counterparty Alliance Name</label>
          <input className="form-input" value={form.allianceBName} onChange={(e) => set("allianceBName", e.target.value)} placeholder="Beta Corp" />
        </div>

        <div className="form-group">
          <label className="form-label">Counterparty Leader Address</label>
          <input className="form-input" value={form.allianceBLeader} onChange={(e) => set("allianceBLeader", e.target.value)} placeholder="0x..." />
        </div>

        <div className="form-group">
          <label className="form-label">Your Member Character IDs (comma separated)</label>
          <input className="form-input" value={form.membersA} onChange={(e) => set("membersA", e.target.value)} placeholder="1001, 1002, 1003" />
        </div>

        <div className="form-group">
          <label className="form-label">Deposit (SUI per side)</label>
          <input className="form-input" type="number" step="0.1" min="0.1" value={form.depositSui} onChange={(e) => set("depositSui", e.target.value)} />
        </div>

        {form.treatyType === "1" && (
          <div className="form-group">
            <label className="form-label">Duration (hours, 0 = permanent)</label>
            <input className="form-input" type="number" min="0" value={form.durationHours} onChange={(e) => set("durationHours", e.target.value)} />
          </div>
        )}

        <button className="btn-primary" onClick={handleSubmit} disabled={submitting || !account}>
          {submitting ? "SUBMITTING..." : "PROPOSE TREATY"}
        </button>
      </div>
    </div>
  );
}
