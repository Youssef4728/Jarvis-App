export const metadata = { title: "Jarvis" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body style={{ margin: 0, background: "#10141a", color: "#e8ecf1", fontFamily: "system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
