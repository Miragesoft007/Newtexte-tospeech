import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./UsageBar.css";

function UsageBar() {
  const { user } = useAuth();
  if (!user) return null;

  const unlimited = user.chars_limit === -1;
  const pct = unlimited ? 100 : Math.min((user.chars_used / user.chars_limit) * 100, 100);
  const warning = !unlimited && pct >= 80;

  return (
    <div className={`usage-bar-wrapper ${warning ? "warning" : ""}`}>
      <div className="usage-bar-info">
        <span>
          {unlimited
            ? "Caractères : illimité"
            : `${user.chars_used.toLocaleString()} / ${user.chars_limit.toLocaleString()} caractères`}
        </span>
        <span className="usage-plan">{user.plan.toUpperCase()}</span>
      </div>
      {!unlimited && (
        <div className="usage-track">
          <div className="usage-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {warning && (
        <Link to="/pricing" className="usage-upgrade">
          Limite bientôt atteinte — Passer au plan supérieur
        </Link>
      )}
    </div>
  );
}

export default UsageBar;
