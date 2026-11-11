import { loadTomorrow } from "@/lib/plan";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (req.headers.get("x-app-password") !== process.env.APP_PASSWORD) return new Response("Nein", { status: 401 });
  return Response.json(await loadTomorrow());
}
