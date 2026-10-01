import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Contador de ventas",
  description: "Contador de ventas en tiempo real con lluvia de billetes.",
  // Landing interna: muestra cifras del negocio, no debe indexarse.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#41276b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
