import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verso",
  description: "Transcreve música em letra editável e sincroniza como karaokê.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="min-h-screen bg-ground text-ink">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-6xl items-baseline gap-5 px-5 py-4">
            <Link
              href="/"
              className="font-display text-2xl font-extrabold tracking-tight text-ink hover:text-amber"
            >
              Ver<span className="text-amber">so</span>
            </Link>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
              transcrição e revisão de letras
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
