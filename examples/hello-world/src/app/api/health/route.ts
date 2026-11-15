export async function GET() {
  return Response.json({
    ok: true,
    framework: "Javafy",
    version: "0.4.0",
    timestamp: new Date().toISOString()
  });
}
