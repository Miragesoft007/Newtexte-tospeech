import React, { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Header from "./components/Header";
import TTSInterface from "./components/TTSInterface";
import AuthModal from "./components/AuthModal";
import PricingPage from "./pages/PricingPage";
import "./App.css";

function AppContent() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <>
      <Header onAuthClick={() => setShowAuth(true)} />
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={
              <>
                <div className="app-hero">
                  <h1>VoxCPM</h1>
                  <p>Convertissez votre texte en voix naturelle</p>
                </div>
                <TTSInterface onAuthClick={() => setShowAuth(true)} />
              </>
            }
          />
          <Route
            path="/pricing"
            element={<PricingPage onAuthClick={() => setShowAuth(true)} />}
          />
          <Route
            path="/success"
            element={
              <div className="success-page">
                <h2>Paiement réussi !</h2>
                <p>Votre abonnement est maintenant actif.</p>
                <a href="/">Retour à l'app</a>
              </div>
            }
          />
        </Routes>
      </main>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
