import { useRouter } from "javafy/router";

type BlogPageProps = {
  params: Record<string, string>;
  title?: string;
  summary?: string;
};

export default function BlogPostPage({ params, title, summary }: BlogPageProps) {
  const router = useRouter();
  return (
    <main style={{ maxWidth: 720, margin: "10vh auto", padding: 24 }}>
      <p style={{ color: "#7dd3fc", fontWeight: 700 }}>JAVAfy 0.4.0 — SSG</p>
      <h1>{title ?? "Dynamic route"}</h1>
      <p style={{ color: "#a8b4c7" }}>{summary ?? "The value of [id] is " + params.id + "."}</p>
      <p style={{ color: "#7dd3fc" }}>Path: {router.pathname}</p>
    </main>
  );
}

export async function getStaticPaths() {
  return [
    { params: { id: "first-post" } },
    { params: { id: "second-post" } }
  ];
}

export async function getStaticProps({ params }: { params: Record<string, string> }) {
  return {
    title: params.id === "first-post" ? "First Javafy post" : "Second Javafy post",
    summary: "This page was generated at build time for the route: " + params.id
  };
}
