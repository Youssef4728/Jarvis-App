export function isAutomationAuthorized(request: Request): boolean {
  const password = process.env.APP_PASSWORD;
  return Boolean(password) && request.headers.get("x-app-password") === password;
}
