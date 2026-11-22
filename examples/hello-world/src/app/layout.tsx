import type { ReactNode } from "react";
import { Link } from "javafy/router";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#101827", color: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ padding: "20px 8vw", borderBottom: "1px solid #263449", display: "flex", gap: 24, alignItems: "center" }}>
        <strong style={{ color: "#7dd3fc", fontSize: 20 }}>Javafy</strong>
        <nav style={{ display: "flex", gap: 18 }}>
          <Link href="/" style={{ color: "#f8fafc" }}>Home</Link>
          <Link href="/about" style={{ color: "#f8fafc" }}>About</Link>
          <Link href="/blog/first-post" style={{ color: "#f8fafc" }}>Dynamic route</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
