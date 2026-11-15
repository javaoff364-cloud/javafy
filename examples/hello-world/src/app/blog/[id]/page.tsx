import { useRouter } from "@javafy/router";

export default function BlogPostPage({ params }: { params: Record<string, string> }) {
  const router = useRouter();
  return (
    <main style={{ maxWidth: 720, margin: "10vh auto", padding: 24 }}>
      <h1>Dynamic route</h1>
      <p style={{ color: "#a8b4c7" }}>
        The value of <code>[id]</code> is <strong>{params.id}</strong>.
      </p>
      <p style={{ color: "#7dd3fc" }}>Path: {router.pathname}</p>
    </main>
  );
}
