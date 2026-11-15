import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeContent: "center",
      textAlign: "center",
      background: "#101827",
      color: "#f8fafc",
      fontFamily: "system-ui, sans-serif",
      padding: "24px"
    }}>
      <h1 style={{ fontSize: "clamp(2.5rem, 8vw, 4.5rem)", margin: 0 }}>
        Hello, Javafy.
      </h1>
      <p style={{ color: "#a8b4c7", lineHeight: 1.7 }}>
        Edit <code>src/main.tsx</code> and save to see live reload.
      </p>
      <p style={{ color: "#7dd3fc" }}>Build faster. Run smarter.</p>
    </main>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Javafy: #root element was not found.");

createRoot(rootElement).render(<App />);
