"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  AlertTriangle,
  FileText,
  TrendingUp,
  CalendarClock,
  CheckCircle2,
  Building2,
  XCircle,
  Sparkles,
} from "lucide-react";
import {
  listDocumentos,
  listAllItens,
  listObrigacoes,
  listApuracoes,
  listDivergencias,
} from "@/lib/storage";
import { useApp } from "@/lib/app-context";
import type { Documento, ItemDocumento, Apuracao, ObrigacaoAcessoria, Divergencia } from "@/types";
import { formatBRL, periodoToLabel } from "@/lib/utils";
import { getPercentualTransicao } from "@/lib/transicao";

export default function DashboardPage() {
  const { empresa, escritorio, carregando } = useApp();
  const [docs, setDocs] = useState<Documento[]>([]);
  const [itens, setItens] = useState<ItemDocumento[]>([]);
  const [apuracoes, setApuracoes] = useState<Apuracao[]>([]);
  const [obrigacoes, setObrigacoes] = useState<ObrigacaoAcessoria[]>([]);
  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresa) { setLoading(false); return; }
    (async () => {
      try {
        setLoading(true);
        const d = await listDocumentos({ empresa_id: empresa.id });
        setDocs(d);
        const i = await listAllItens(empresa.id);
        setItens(i);
        setApuracoes(await listApuracoes(empresa.id));
        setObrigacoes(await listObrigacoes(empresa.id));
        setDivergencias(await listDivergencias(empresa.id, "aberta"));
      } finally {
        setLoading(false);
      }
    })();
  }, [empresa?.id]);

  const hoje = new Date();
  const periodoAtual = hoje.toISOString().substring(0, 7);
  const docsMes = docs.filter((d) => d.periodo_competencia === periodoAtual);

  const itensPendentes = itens.filter((i) => i.status_item === "pendente").length;
  const totalItens = itens.length;
  const percClassificados = totalItens > 0 ? Math.round(((totalItens - itensPendentes) / totalItens) * 100) : 0;

  const apuracaoAtual = apuracoes.find((a) => a.periodo === periodoAtual);
  const cbsPagar = apuracaoAtual?.cbs_saldo_pagar ?? 0;
  const ibsPagar = (apuracaoAtual?.ibs_est_saldo_pagar ?? 0) + (apuracaoAtual?.ibs_mun_saldo_pagar ?? 0);

  const obrigProximas = obrigacoes.filter((o) => {
    const venc = new Date(o.data_vencimento);
    const diff = (venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
    return o.status === "pendente" && diff >= 0 && diff <= 7;
  }).length;

  const divCriticas = divergencias.filter((d) => d.severidade === "CRITICO").length;
  const divAtencao = divergencias.filter((d) => d.severidade === "ATENCAO").length;

  const fase = getPercentualTransicao(empresa?.ano_vigencia_aliquota ?? 2026);

  // dados para gráfico (últimos 6 meses)
  const ultimos6 = (() => {
    const result: { mes: string; debitos: number; creditos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const ap = apuracoes.find((a) => a.periodo === periodo);
      result.push({
        mes: periodoToLabel(periodo),
        debitos: (ap?.cbs_debitos ?? 0) + (ap?.ibs_est_debitos ?? 0) + (ap?.ibs_mun_debitos ?? 0),
        creditos: (ap?.cbs_creditos ?? 0) + (ap?.ibs_est_creditos ?? 0) + (ap?.ibs_mun_creditos ?? 0),
      });
    }
    return result;
  })();

  if (carregando || loading) {
    return <div className="text-muted-foreground">Carregando...</div>;
  }

  if (!empresa) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Bem-vindo ao {escritorio?.nome ?? "ConciliaAI"}</h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Cadastre a primeira empresa
            </CardTitle>
            <CardDescription>
              Antes de capturar documentos e gerar apurações, cadastre a primeira empresa cliente.
              Você pode também configurar o branding do escritório (white label).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Link
              href="/empresa"
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 text-sm font-medium"
            >
              Cadastrar empresa
            </Link>
            <Link
              href="/escritorio"
              className="inline-flex items-center justify-center rounded-md border border-input hover:bg-accent h-10 px-6 text-sm font-medium"
            >
              Configurar escritório
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {empresa.razao_social} · {empresa.cnpj} · {empresa.regime_tributario.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">
            Fase {empresa.ano_vigencia_aliquota}: {fase.descricao}
          </Badge>
          <Link href="/assistente">
            <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80 gap-1">
              <Sparkles className="h-3 w-3" /> Assistente IA
            </Badge>
          </Link>
        </div>
      </div>

      {(divCriticas > 0 || divAtencao > 0) && (
        <Link href="/divergencias">
          <Card className="border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer">
            <CardContent className="pt-5 flex items-center justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium">
                    {divCriticas > 0 && <span className="text-red-700">{divCriticas} crítica(s)</span>}
                    {divCriticas > 0 && divAtencao > 0 && <span> · </span>}
                    {divAtencao > 0 && <span>{divAtencao} atenção</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Divergências aberta(s) — clique para resolver.
                  </div>
                </div>
              </div>
              <Badge variant={divCriticas > 0 ? "destructive" : "warning"}>{divergencias.length} aberta(s)</Badge>
            </CardContent>
          </Card>
        </Link>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <CardKPI
          icon={<FileText className="h-4 w-4" />}
          label="NFs do mês"
          value={String(docsMes.length)}
          subtitle={`${docs.length} totais`}
        />
        <CardKPI
          icon={<TrendingUp className="h-4 w-4 text-red-600" />}
          label="CBS a pagar"
          value={formatBRL(cbsPagar)}
          subtitle={periodoToLabel(periodoAtual)}
        />
        <CardKPI
          icon={<TrendingUp className="h-4 w-4 text-red-600" />}
          label="IBS a pagar"
          value={formatBRL(ibsPagar)}
          subtitle={periodoToLabel(periodoAtual)}
        />
        <CardKPI
          icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
          label="Itens pendentes"
          value={String(itensPendentes)}
          subtitle={totalItens > 0 ? `de ${totalItens}` : "—"}
          highlight={itensPendentes > 0}
        />
        <CardKPI
          icon={<CalendarClock className="h-4 w-4 text-blue-600" />}
          label="Obrigações ≤7d"
          value={String(obrigProximas)}
          subtitle="próximas"
          highlight={obrigProximas > 0}
        />
        <CardKPI
          icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
          label="% classificados"
          value={`${percClassificados}%`}
          subtitle="dos itens"
        />
      </div>

      {empresa.regime_tributario === "LUCRO_PRESUMIDO" && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong className="text-amber-900">Atenção — Lucro Presumido:</strong>{" "}
                Empresa no Lucro Presumido tem direito a <em>crédito integral</em> de IBS/CBS
                (regime novo, não-cumulativo pleno). PIS/COFINS atual continua cumulativo
                (sem crédito) até a extinção progressiva.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Débitos x Créditos (últimos 6 meses)</CardTitle>
            <CardDescription>IBS + CBS consolidados</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ultimos6}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Legend />
                <Bar dataKey="debitos" fill="hsl(var(--destructive))" name="Débitos" />
                <Bar dataKey="creditos" fill="hsl(142 71% 45%)" name="Créditos" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximas obrigações</CardTitle>
            <CardDescription>Pendentes nos próximos 30 dias</CardDescription>
          </CardHeader>
          <CardContent>
            {obrigacoes.filter((o) => o.status === "pendente").slice(0, 6).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma obrigação cadastrada.</p>
            ) : (
              <ul className="space-y-2">
                {obrigacoes
                  .filter((o) => o.status === "pendente")
                  .slice(0, 6)
                  .map((o) => (
                    <li key={o.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                      <div>
                        <div className="text-sm font-medium">{o.tipo}</div>
                        <div className="text-xs text-muted-foreground">
                          Período {o.periodo} · venc. {new Date(o.data_vencimento).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                      <Badge variant="warning">pendente</Badge>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CardKPI({
  icon,
  label,
  value,
  subtitle,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-amber-300" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon} {label}
        </div>
        <div className="mt-2 text-xl font-bold tracking-tight">{value}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}
