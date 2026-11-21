import { Link } from "@javafy/router";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 760, margin: "12vh auto", padding: 24 }}>
      <p style={{ color: "#7dd3fc", fontWeight: 700 }}>Javafy 0.5.0 — FULLSTACK</p>
      <h1 style={{ fontSize: "clamp(2.5rem, 8vw, 4.5rem)", margin: "12px 0" }}>
        Hello, Javafy.
      </h1>
      <p style={{ color: "#a8b4c7", lineHeight: 1.8 }}>
        API routes, server-side rendering, server data loaders, and static generation now work together.
      </p>
      <nav style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 20 }}>
        <Link href="/about" style={{ color: "#7dd3fc" }}>SSR example →</Link>
        <Link href="/blog/first-post" style={{ color: "#7dd3fc" }}>SSG example →</Link>
        <a href="/api/health" style={{ color: "#7dd3fc" }}>API health →</a>
      </nav>
    </main>
  );
}
