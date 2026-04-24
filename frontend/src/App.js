import React from "react";
import TTSInterface from "./components/TTSInterface";
import "./App.css";

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>VoxCPM</h1>
        <p>Convertissez votre texte en voix naturelle</p>
      </header>
      <main>
        <TTSInterface />
      </main>
    </div>
  );
}

export default App;
