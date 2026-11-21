import type { JavafyErrorProps } from "@javafy/router";

export default function ErrorPage({ error, reset }: JavafyErrorProps) {
  return (
    <main style={{ maxWidth: 760, margin: "12vh auto", padding: 24 }} role="alert">
      <p style={{ color: "#fca5a5", fontWeight: 700 }}>JAVAfy ERROR</p>
      <h1>Something went wrong.</h1>
      <p style={{ color: "#a8b4c7", lineHeight: 1.8 }}>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
