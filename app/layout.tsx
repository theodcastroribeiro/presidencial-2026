import type { Metadata } from "next";
import "./globals.css";
const site = "https://presidencial-2026-publico.theodcastroribeiro.chatgpt.site";
const description = "Apuração presidencial com dados oficiais do TSE, histórico de 2022, por estado e região. Cenários independentes.";
export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "Observatório | Presidencial 2026",
  description,
  alternates: { canonical: site },
  openGraph: { type: "website", locale: "pt_BR", url: site, title: "Observatório | Presidencial 2026", description, images: [{ url: `${site}/og.png`, width: 1200, height: 630, alt: "Observatório: apuração presidencial 2026, Lula em vermelho e Flávio Bolsonaro em amarelo" }] },
  twitter: { card: "summary_large_image", title: "Observatório | Presidencial 2026", description, images: [`${site}/og.png`] },
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({children}: {children: React.ReactNode}) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
