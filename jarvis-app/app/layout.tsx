import "./globals.css";

export const metadata = { title: "Jarvis" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#0c111b" /></head>
      <body>{children}</body>
    </html>
  );
}
