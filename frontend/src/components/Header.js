import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Header.css";

function Header({ onAuthClick }) {
  const { user, logout } = useAuth();

  return (
    <header className="header">
      <Link to="/" className="header-logo">VoxCPM</Link>
      <nav className="header-nav">
        <Link to="/pricing">Tarifs</Link>
        {user ? (
          <>
            <span className="header-plan">{user.plan.toUpperCase()}</span>
            <button className="btn-logout" onClick={logout}>Déconnexion</button>
          </>
        ) : (
          <button className="btn-login" onClick={onAuthClick}>Connexion</button>
        )}
      </nav>
    </header>
  );
}

export default Header;
