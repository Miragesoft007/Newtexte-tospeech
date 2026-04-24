import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./PricingPage.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const PLANS = [
  {
    id: "free",
    name: "Gratuit",
    price: "0$",
    period: "/mois",
    limit: "3 000 caractères/mois",
    features: ["Accès à VoxCPM", "Qualité standard", "Téléchargement audio"],
    cta: "Plan actuel",
    highlight: false,
  },
  {
    id: "starter",
    name: "Starter",
    price: "9$",
    period: "/mois",
    limit: "100 000 caractères/mois",
    features: ["Tout du plan gratuit", "Priorité de génération", "Support email"],
    cta: "Choisir Starter",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "29$",
    period: "/mois",
    limit: "Caractères illimités",
    features: ["Tout du plan Starter", "Accès API", "Support prioritaire", "Accès beta"],
    cta: "Choisir Pro",
    highlight: true,
  },
];

function PricingPage({ onAuthClick }) {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(null);

  async function handleSubscribe(planId) {
    if (!user) { onAuthClick?.(); return; }
    if (planId === "free") return;
    setLoading(planId);
    try {
      const res = await fetch(`${API_URL}/api/payment/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="pricing-page">
      <h1>Choisissez votre plan</h1>
      <p className="pricing-subtitle">
        Commencez gratuitement, évoluez selon vos besoins.
      </p>
      <div className="pricing-grid">
        {PLANS.map((plan) => {
          const isCurrent = user?.plan === plan.id;
          return (
            <div key={plan.id} className={`pricing-card ${plan.highlight ? "highlighted" : ""}`}>
              {plan.highlight && <span className="badge">Populaire</span>}
              <h2>{plan.name}</h2>
              <div className="price">
                <span className="amount">{plan.price}</span>
                <span className="period">{plan.period}</span>
              </div>
              <p className="plan-limit">{plan.limit}</p>
              <ul>
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button
                className={`btn-plan ${isCurrent ? "current" : ""}`}
                onClick={() => handleSubscribe(plan.id)}
                disabled={isCurrent || loading === plan.id || plan.id === "free"}
              >
                {loading === plan.id
                  ? "Redirection..."
                  : isCurrent
                  ? "Plan actuel"
                  : plan.cta}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PricingPage;
