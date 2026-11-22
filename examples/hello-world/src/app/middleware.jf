export default async function middleware(
  _request: Request,
  next: (request?: Request) => Promise<Response>
): Promise<Response> {
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set("x-powered-by", "Javafy");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
