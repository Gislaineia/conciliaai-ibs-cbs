"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Search, ChevronDown, LogOut, Settings, User, Briefcase } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { cn, formatCNPJ } from "@/lib/utils";
import {
  listEmpresas, listDocumentos, listAllItens, listParticipantes,
  listDivergencias,
} from "@/lib/storage";

interface SearchResult {
  type: "empresa" | "documento" | "ncm" | "participante";
  label: string;
  sub: string;
  href: string;
}

export function TopBar() {
  const { empresa, escritorio } = useApp();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [showResults, setShowResults] = React.useState(false);
  const [showUser, setShowUser] = React.useState(false);
  const [showNotif, setShowNotif] = React.useState(false);
  const [divergenciasCount, setDivergenciasCount] = React.useState(0);
  const [searching, setSearching] = React.useState(false);
  const searchRef = React.useRef<HTMLDivElement>(null);
  const userRef = React.useRef<HTMLDivElement>(null);
  const notifRef = React.useRef<HTMLDivElement>(null);

  // contagem divergências
  React.useEffect(() => {
    if (!empresa) return;
    listDivergencias(empresa.id, "aberta").then((d) => setDivergenciasCount(d.length));
  }, [empresa?.id]);

  // fechar dropdowns ao clicar fora
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUser(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // busca global (debounced)
  React.useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const q = query.toLowerCase();
        const results: SearchResult[] = [];

        // Empresas
        const empresas = await listEmpresas();
        for (const e of empresas) {
          if (
            e.razao_social.toLowerCase().includes(q) ||
            e.cnpj.includes(query) ||
            e.nome_fantasia?.toLowerCase().includes(q)
          ) {
            results.push({
              type: "empresa",
              label: e.razao_social,
              sub: `${formatCNPJ(e.cnpj)} · ${e.uf}`,
              href: `/empresas`,
            });
          }
        }

        if (empresa) {
          // Documentos
          const docs = await listDocumentos({ empresa_id: empresa.id });
          for (const d of docs.slice(0, 200)) {
            if (
              d.chave_acesso?.includes(query) ||
              d.numero_doc?.includes(query) ||
              d.razao_emitente?.toLowerCase().includes(q) ||
              d.cnpj_emitente?.includes(query)
            ) {
              results.push({
                type: "documento",
                label: `${d.tipo} ${d.numero_doc} — ${d.razao_emitente ?? d.cnpj_emitente}`,
                sub: `${d.direcao} · ${d.data_emissao}`,
                href: `/documentos/${d.id}`,
              });
              if (results.length > 30) break;
            }
          }

          // Itens / NCM
          const itens = await listAllItens(empresa.id);
          const ncmHits = new Map<string, number>();
          for (const i of itens) {
            if (i.ncm?.startsWith(query) || i.descricao?.toLowerCase().includes(q)) {
              if (i.ncm) ncmHits.set(i.ncm, (ncmHits.get(i.ncm) ?? 0) + 1);
            }
          }
          for (const [ncm, qtd] of ncmHits) {
            if (results.length > 40) break;
            results.push({
              type: "ncm",
              label: `NCM ${ncm}`,
              sub: `${qtd} item(ns)`,
              href: `/classificacao?ncm=${ncm}`,
            });
          }

          // Participantes
          const part = await listParticipantes(empresa.id);
          for (const p of part) {
            if (
              p.cnpj?.includes(query) ||
              p.razao_social?.toLowerCase().includes(q) ||
              p.nome_fantasia?.toLowerCase().includes(q)
            ) {
              if (results.length > 50) break;
              results.push({
                type: "participante",
                label: p.razao_social ?? p.cnpj,
                sub: `${formatCNPJ(p.cnpj)} · ${p.tipo}`,
                href: `/participantes`,
              });
            }
          }
        }

        setResults(results.slice(0, 20));
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, empresa?.id]);

  function selecionarResultado(r: SearchResult) {
    setQuery("");
    setResults([]);
    setShowResults(false);
    router.push(r.href);
  }

  // Dados do usuário (cai para defaults razoáveis)
  const nomeEscritorio = escritorio?.nome ?? "Escritorio Contabil Bazaga";
  const responsavel = escritorio?.responsavel ?? "Gislaine Araujo";
  const iniciais = responsavel.split(/\s+/).slice(0, 2).map((s) => s.charAt(0).toUpperCase()).join("");
  const corPrimaria = escritorio?.cor_primaria ?? "#2563eb";

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center gap-4 px-4 lg:px-6 h-16">
        {/* Search global */}
        <div ref={searchRef} className="relative flex-1 max-w-2xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              placeholder="Buscar empresa, CNPJ, NCM, chave de acesso..."
              className="w-full h-10 rounded-lg border bg-background pl-10 pr-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {showResults && (query.length >= 2 || results.length > 0) && (
            <div className="absolute top-12 left-0 right-0 rounded-lg border bg-background shadow-xl max-h-[480px] overflow-auto">
              {searching && results.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground text-center">Buscando…</div>
              )}
              {!searching && results.length === 0 && query.length >= 2 && (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  Nenhum resultado para "{query}"
                </div>
              )}
              {results.length > 0 && (
                <div className="py-2">
                  {(["empresa", "documento", "ncm", "participante"] as const).map((tipo) => {
                    const grupo = results.filter((r) => r.type === tipo);
                    if (grupo.length === 0) return null;
                    return (
                      <div key={tipo} className="mb-1">
                        <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                          {tipo === "empresa" ? "Empresas"
                            : tipo === "documento" ? "Documentos"
                            : tipo === "ncm" ? "NCMs"
                            : "Participantes"}
                        </div>
                        {grupo.map((r, i) => (
                          <button
                            key={`${tipo}-${i}`}
                            onClick={() => selecionarResultado(r)}
                            className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
                          >
                            <div className="text-sm font-medium truncate">{r.label}</div>
                            <div className="text-xs text-muted-foreground truncate">{r.sub}</div>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Espaço flex */}
        <div className="flex-1 hidden lg:block" />

        {/* Notificações */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setShowNotif((v) => !v)}
            className="relative h-10 w-10 rounded-full hover:bg-accent flex items-center justify-center transition-colors"
            aria-label="Notificações"
          >
            <Bell className="h-5 w-5" />
            {divergenciasCount > 0 && (
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>
          {showNotif && (
            <div className="absolute top-12 right-0 w-80 rounded-lg border bg-background shadow-xl">
              <div className="p-3 border-b font-medium text-sm">Notificações</div>
              <div className="max-h-80 overflow-auto">
                {divergenciasCount > 0 ? (
                  <Link
                    href="/divergencias"
                    onClick={() => setShowNotif(false)}
                    className="block p-3 hover:bg-accent border-b transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium">
                          {divergenciasCount} divergência(s) aberta(s)
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Clique para resolver no painel.
                        </div>
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Nenhuma notificação no momento.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Perfil */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setShowUser((v) => !v)}
            className="flex items-center gap-2.5 h-10 px-2 pr-3 rounded-full hover:bg-accent transition-colors"
          >
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-white font-semibold text-sm"
              style={{ background: corPrimaria }}
            >
              {iniciais || "U"}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-sm font-medium leading-tight">{responsavel}</div>
              <div className="text-[11px] text-muted-foreground leading-tight">{nomeEscritorio}</div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>

          {showUser && (
            <div className="absolute top-12 right-0 w-64 rounded-lg border bg-background shadow-xl">
              <div className="p-4 border-b">
                <div className="font-medium">{responsavel}</div>
                <div className="text-xs text-muted-foreground">{nomeEscritorio}</div>
                {empresa && (
                  <div className="mt-2 pt-2 border-t text-xs">
                    <div className="text-muted-foreground">Empresa ativa:</div>
                    <div className="font-medium truncate">{empresa.razao_social}</div>
                  </div>
                )}
              </div>
              <div className="py-1">
                <Link
                  href="/escritorio"
                  onClick={() => setShowUser(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <Briefcase className="h-4 w-4" /> Configurar escritório
                </Link>
                <Link
                  href="/empresas"
                  onClick={() => setShowUser(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <Settings className="h-4 w-4" /> Gerenciar empresas
                </Link>
                <Link
                  href="/empresa"
                  onClick={() => setShowUser(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <User className="h-4 w-4" /> Empresa ativa
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
