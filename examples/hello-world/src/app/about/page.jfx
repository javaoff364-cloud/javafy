import { useRouter } from "javafy/router";

export default function AboutPage({ renderedAt }: { renderedAt?: string }) {
  const router = useRouter();
  return (
    <main style={{ maxWidth: 720, margin: "10vh auto", padding: 24 }}>
      <h1>About Javafy 0.8.0</h1>
      <p style={{ color: "#a8b4c7", lineHeight: 1.8 }}>
        This page is rendered on the server for each request.
      </p>
      <p style={{ color: "#7dd3fc" }}>Current route: {router.pathname}</p>
      <p style={{ color: "#a8b4c7" }}>Server render time: {renderedAt}</p>
      <button onClick={() => router.navigate("/")} style={{ padding: "10px 16px", cursor: "pointer" }}>
        Go home
      </button>
    </main>
  );
}

export async function getServerSideProps() {
  return { renderedAt: new Date().toISOString() };
}
