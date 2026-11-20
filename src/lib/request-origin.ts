export function isSameOrigin(request: Request, origin: string): boolean {
  try {
    const parsed = new URL(origin);
    // Next may use an internal hostname in request.url. The Host header is the
    // browser-facing authority and, unlike Origin, cannot be chosen by page JS.
    const host = request.headers.get("host") || new URL(request.url).host;
    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.origin === origin && parsed.host === host;
  } catch {
    return false;
  }
}
