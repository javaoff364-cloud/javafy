import { useRouter } from "@javafy/router";

export default function AboutPage() {
  const router = useRouter();
  return (
    <main style={{ maxWidth: 720, margin: "10vh auto", padding: 24 }}>
      <h1>About Javafy 0.3.0</h1>
      <p style={{ color: "#a8b4c7", lineHeight: 1.8 }}>
        This page is generated from <code>src/app/about/page.tsx</code>.
      </p>
      <p style={{ color: "#7dd3fc" }}>Current route: {router.pathname}</p>
      <button onClick={() => router.navigate("/")} style={{ padding: "10px 16px", cursor: "pointer" }}>
        Go home
      </button>
    </main>
  );
}
