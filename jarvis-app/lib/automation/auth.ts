export function isAutomationAuthorized(request: Request): boolean {
  const password = process.env.APP_PASSWORD;
  const header = request.headers.get("x-app-password");
  if (!password || !header) return false;
  if (header === password) return true;

  // Keep existing ASCII clients compatible. Non-ASCII passwords are sent as
  // percent-encoded UTF-8 so WebKit's Fetch Headers ByteString validation does
  // not reject the request before it reaches the API.
  if (header.startsWith("utf8:")) {
    try {
      return decodeURIComponent(header.slice(5)) === password;
    } catch {
      return false;
    }
  }
  return false;
}
