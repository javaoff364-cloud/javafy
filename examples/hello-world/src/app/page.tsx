import { Link } from "@javafy/router";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 760, margin: "12vh auto", padding: 24 }}>
      <p style={{ color: "#7dd3fc", fontWeight: 700 }}>JAVAfy 0.3.0 — ROUTING</p>
      <h1 style={{ fontSize: "clamp(2.5rem, 8vw, 4.5rem)", margin: "12px 0" }}>
        Hello, Javafy.
      </h1>
      <p style={{ color: "#a8b4c7", lineHeight: 1.8 }}>
        Routes now come from your folders. Add a page, create a layout, and use dynamic URL segments.
      </p>
      <Link href="/about" style={{ display: "inline-block", marginTop: 18, color: "#7dd3fc" }}>
        Explore the router →
      </Link>
    </main>
  );
}
