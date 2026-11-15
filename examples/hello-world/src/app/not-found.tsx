import { Link } from "@javafy/router";

export default function NotFoundPage() {
  return (
    <main style={{ maxWidth: 720, margin: "10vh auto", padding: 24 }}>
      <h1>404 — Page not found</h1>
      <p style={{ color: "#a8b4c7" }}>This route does not exist in the Javafy app.</p>
      <Link href="/" style={{ color: "#7dd3fc" }}>Return home</Link>
    </main>
  );
}
