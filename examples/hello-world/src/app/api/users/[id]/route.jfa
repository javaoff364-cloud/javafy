type Context = { params: Record<string, string> };

export async function GET(_request: Request, { params }: Context) {
  return Response.json({
    id: params.id,
    name: "Javafy User",
    source: "file-based API route"
  });
}

export async function PUT(request: Request, { params }: Context) {
  const body = await request.json() as { name?: string };
  if (!body.name || typeof body.name !== "string") {
    return Response.json({ error: "A name string is required." }, { status: 400 });
  }
  return Response.json({ id: params.id, name: body.name, updated: true });
}
