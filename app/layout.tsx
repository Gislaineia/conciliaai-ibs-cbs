import "./globals.css";
import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ToastProvider } from "@/components/ui/toast";
import { AppProvider } from "@/lib/app-context";

export const metadata: Metadata = {
  title: "ConciliaAI — Inteligência Fiscal e Contábil",
  description: "Plataforma de inteligência fiscal — captura, classificação, SPED e apuração IBS/CBS, ICMS, IPI e PIS/COFINS",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AppProvider>
          <ToastProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex-1 flex flex-col max-w-full overflow-x-hidden">
                <TopBar />
                <main className="flex-1">
                  <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">{children}</div>
                </main>
              </div>
            </div>
          </ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}
