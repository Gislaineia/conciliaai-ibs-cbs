"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Upload,
  FileText,
  Tags,
  Calculator,
  FileCode2,
  CalendarCheck,
  Settings2,
  BarChart3,
  Users,
  Package,
  AlertTriangle,
  Sparkles,
  Radio,
  Briefcase,
  Building,
  ChevronDown,
  BookOpen,
  Scale,
  Search,
  GitCompare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/app-context";
import { useState } from "react";

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
}> = [
  {
    label: "Visão geral",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/divergencias", label: "Divergências", icon: AlertTriangle },
      { href: "/assistente", label: "Assistente IA", icon: Sparkles },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { href: "/empresas", label: "Empresas", icon: Building },
      { href: "/empresa", label: "Empresa ativa", icon: Building2 },
      { href: "/participantes", label: "Participantes", icon: Users },
      { href: "/produtos", label: "Produtos", icon: Package },
    ],
  },
  {
    label: "Captura & classificação",
    items: [
      { href: "/captura", label: "Capturar XMLs", icon: Upload },
      { href: "/captura-sefaz", label: "Captura SEFAZ", icon: Radio },
      { href: "/consultas", label: "Consultas Fiscais", icon: Search },
      { href: "/conciliacao", label: "Conciliação", icon: GitCompare },
      { href: "/documentos", label: "Documentos", icon: FileText },
      { href: "/classificacao", label: "Classificação", icon: Tags },
      { href: "/regras", label: "Motor de Regras", icon: Settings2 },
    ],
  },
  {
    label: "Apuração & SPED",
    items: [
      { href: "/apuracao", label: "Apuração", icon: Calculator },
      { href: "/sped", label: "SPED", icon: FileCode2 },
      { href: "/obrigacoes", label: "Obrigações", icon: CalendarCheck },
      { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
      { href: "/exposicao-tributaria", label: "Exposição IBS/CBS", icon: Scale },
      { href: "/tabelas-fiscais", label: "Tabelas fiscais", icon: BookOpen },
    ],
  },
  {
    label: "Configuração",
    items: [
      { href: "/escritorio", label: "Escritório (White label)", icon: Briefcase },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { empresa, empresas, escritorio, trocarEmpresa } = useApp();
  const [mostrarSeletor, setMostrarSeletor] = useState(false);

  const corPrimaria = escritorio?.cor_primaria;

  return (
    <aside className="w-64 border-r bg-muted/30 hidden md:flex flex-col h-screen sticky top-0">
      {/* Branding do escritório */}
      <div className="p-4 border-b">
        <Link href="/" className="flex items-center gap-3">
          {escritorio?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={escritorio.logo_url} alt="logo" className="h-10 w-10 rounded object-contain bg-white" />
          ) : (
            <div
              className="h-10 w-10 rounded flex items-center justify-center text-white font-bold"
              style={{ background: corPrimaria ?? "hsl(221.2 83% 53%)" }}
            >
              {(escritorio?.nome ?? "C").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-sm font-bold tracking-tight leading-tight">
              {escritorio?.nome ?? "ConciliaAI"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {escritorio ? "Inteligência fiscal" : "IBS/CBS · Reforma"}
            </div>
          </div>
        </Link>
      </div>

      {/* Seletor de empresa ativa */}
      <div className="p-3 border-b">
        <button
          type="button"
          onClick={() => setMostrarSeletor((v) => !v)}
          className="w-full text-left rounded-md border bg-background px-3 py-2 hover:bg-accent transition-colors"
        >
          <div className="text-[10px] uppercase text-muted-foreground tracking-wide mb-0.5">Empresa ativa</div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium truncate">
              {empresa?.razao_social ?? "Nenhuma cadastrada"}
            </div>
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          </div>
          {empresa && (
            <div className="text-[10px] text-muted-foreground mt-0.5">{empresa.cnpj}</div>
          )}
        </button>

        {mostrarSeletor && (
          <div className="mt-2 max-h-60 overflow-auto rounded-md border bg-background shadow-sm">
            {empresas.length === 0 ? (
              <Link
                href="/empresa"
                onClick={() => setMostrarSeletor(false)}
                className="block px-3 py-2 text-xs hover:bg-accent"
              >
                Cadastrar primeira empresa →
              </Link>
            ) : (
              empresas.map((e) => (
                <button
                  key={e.id}
                  onClick={() => { trocarEmpresa(e.id); setMostrarSeletor(false); }}
                  className={cn(
                    "block w-full text-left px-3 py-2 text-xs hover:bg-accent border-b last:border-0",
                    e.id === empresa?.id && "bg-accent/50 font-medium"
                  )}
                >
                  <div className="truncate">{e.razao_social}</div>
                  <div className="text-muted-foreground">{e.cnpj}</div>
                </button>
              ))
            )}
            <Link
              href="/empresas"
              onClick={() => setMostrarSeletor(false)}
              className="block px-3 py-2 text-xs hover:bg-accent border-t font-medium text-primary"
            >
              + Gerenciar empresas
            </Link>
          </div>
        )}
      </div>

      {/* Menu */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors",
                      active
                        ? "bg-primary text-primary-foreground font-medium shadow-sm"
                        : "hover:bg-accent text-foreground/70"
                    )}
                    style={active && corPrimaria ? { background: corPrimaria } : undefined}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t">
        <div className="text-[10px] text-muted-foreground">
          ConciliaAI v1.0 · LC 214/2025
        </div>
      </div>
    </aside>
  );
}
