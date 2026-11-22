type RouteContext = { params: Record<string, string> };

export function GET(_request: Request, { params }: RouteContext) {
  return Response.json({ id: params.id, title: "Post " + params.id });
}

export async function PUT(request: Request, { params }: RouteContext) {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return Response.json({ id: params.id, updated: true, data });
}
