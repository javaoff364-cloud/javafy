export default function Loading() {
  return (
    <main
      role="status"
      aria-live="polite"
      style={{ maxWidth: 760, margin: "12vh auto", padding: 24, color: "#7dd3fc" }}
    >
      <p style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.08em" }}>
        JAVAfy NAVIGATION
      </p>
      <h1 style={{ color: "#f8fafc" }}>Loading page...</h1>
      <p style={{ color: "#a8b4c7" }}>Fetching the latest page data.</p>
    </main>
  );
}
