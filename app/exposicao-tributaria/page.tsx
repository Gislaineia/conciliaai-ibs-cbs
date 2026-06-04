"use client";
import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import { useApp } from "@/lib/app-context";
import { listDocumentos, listAllItens } from "@/lib/storage";
import { tabelaTransicaoCompleta } from "@/lib/transicao";
import { formatBRL, periodoToLabel } from "@/lib/utils";
import type { Documento, ItemDocumento } from "@/types";
import { TrendingUp, Printer, Scale } from "lucide-react";

export default function ExposicaoTributariaPage() {
  const { empresa } = useApp();
  const [docs, setDocs] = useState<Documento[]>([]);
  const [itens, setItens] = useState<ItemDocumento[]>([]);
  const [periodo, setPeriodo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [anoCompara, setAnoCompara] = useState<number>(2033);

  useEffect(() => {
    if (!empresa) return;
    (async () => {
      const d = await listDocumentos({ empresa_id: empresa.id });
      const i = await listAllItens(empresa.id);
      setDocs(d);
      setItens(i);
      const periodos = Array.from(new Set(d.map((x) => x.periodo_competencia))).sort().reverse();
      if (periodos.length > 0) setPeriodo(periodos[0]);
      setLoading(false);
    })();
  }, [empresa?.id]);

  const periodos = Array.from(new Set(docs.map((d) => d.periodo_competencia))).sort().reverse();
  const docsP = useMemo(() => docs.filter((d) => d.periodo_competencia === periodo), [docs, periodo]);
  const itensP = useMemo(() => itens.filter((i) => docsP.some((d) => d.id === i.documento_id)), [itens, docsP]);

  // ============= ATUAL =============
  // PIS/COFINS de saídas (débitos) — não considera créditos para simplificar
  const docsSaida = docsP.filter((d) => d.direcao === "SAIDA");
  const itensSaida = itensP.filter((i) => docsSaida.some((d) => d.id === i.documento_id));
  const itensEntrada = itensP.filter((i) => docsP.some((d) => d.id === i.documento_id && d.direcao === "ENTRADA"));

  const baseTotalSaida = itensSaida.reduce((s, i) => s + i.valor_total, 0);
  const pisAtualDeb = itensSaida.reduce((s, i) => s + (i.valor_pis || 0), 0);
  const cofinsAtualDeb = itensSaida.reduce((s, i) => s + (i.valor_cofins || 0), 0);
  const icmsAtualDeb = itensSaida.reduce((s, i) => s + (i.valor_icms || 0), 0);
  const ipiAtualDeb = itensSaida.reduce((s, i) => s + (i.valor_ipi || 0), 0);
  // Créditos (considerando regime não-cumulativo)
  const pisAtualCred = empresa?.regime_pis_cofins === "nao_cumulativo"
    ? itensEntrada.reduce((s, i) => s + (i.valor_pis || 0), 0) : 0;
  const cofinsAtualCred = empresa?.regime_pis_cofins === "nao_cumulativo"
    ? itensEntrada.reduce((s, i) => s + (i.valor_cofins || 0), 0) : 0;
  const icmsAtualCred = itensEntrada.reduce((s, i) => s + (i.valor_icms || 0), 0);
  const ipiAtualCred = itensEntrada.reduce((s, i) => s + (i.valor_ipi || 0), 0);

  const pisAtualSaldo = Math.max(0, pisAtualDeb - pisAtualCred);
  const cofinsAtualSaldo = Math.max(0, cofinsAtualDeb - cofinsAtualCred);
  const icmsAtualSaldo = Math.max(0, icmsAtualDeb - icmsAtualCred);
  const ipiAtualSaldo = Math.max(0, ipiAtualDeb - ipiAtualCred);
  const totalAtual = pisAtualSaldo + cofinsAtualSaldo + icmsAtualSaldo + ipiAtualSaldo;

  // ============= FUTURO (LC 214/2025 — regime IVA pleno) =============
  const aliqCBS = empresa?.aliquota_cbs ?? 8.8;
  const aliqIBS = (empresa?.aliquota_ibs_estadual ?? 17.7) + (empresa?.aliquota_ibs_municipal ?? 8.8);
  const fase = tabelaTransicaoCompleta().find((x) => x.ano === anoCompara) ?? tabelaTransicaoCompleta()[tabelaTransicaoCompleta().length - 1];

  // CBS débito = base × alíquota × percentual fase
  const cbsFutDeb = baseTotalSaida * (aliqCBS / 100) * fase.cbs;
  const ibsFutDeb = baseTotalSaida * (aliqIBS / 100) * fase.ibs;
  // Crédito amplo (entradas)
  const baseEntradas = itensEntrada.reduce((s, i) => s + i.valor_total, 0);
  const cbsFutCred = baseEntradas * (aliqCBS / 100) * fase.cbs;
  const ibsFutCred = baseEntradas * (aliqIBS / 100) * fase.ibs;
  const cbsFutSaldo = Math.max(0, cbsFutDeb - cbsFutCred);
  const ibsFutSaldo = Math.max(0, ibsFutDeb - ibsFutCred);
  const totalFut = cbsFutSaldo + ibsFutSaldo;

  // Diferença
  const dif = totalFut - totalAtual;
  const difPct = totalAtual > 0 ? (dif / totalAtual) * 100 : 0;

  // Dados gráficos
  const dadosCompara = [
    { categoria: "PIS",       atual: pisAtualSaldo,   futuro: 0 },
    { categoria: "COFINS",    atual: cofinsAtualSaldo, futuro: 0 },
    { categoria: "CBS",       atual: 0, futuro: cbsFutSaldo },
    { categoria: "ICMS",      atual: icmsAtualSaldo,   futuro: 0 },
    { categoria: "IPI",       atual: ipiAtualSaldo,    futuro: 0 },
    { categoria: "IBS",       atual: 0, futuro: ibsFutSaldo },
  ];
  const dadosPie = [
    { name: "PIS+COFINS",  value: pisAtualSaldo + cofinsAtualSaldo, color: "#3b82f6" },
    { name: "ICMS",        value: icmsAtualSaldo, color: "#10b981" },
    { name: "IPI",         value: ipiAtualSaldo, color: "#f59e0b" },
  ];
  const dadosPieFut = [
    { name: "CBS",  value: cbsFutSaldo, color: "#3b82f6" },
    { name: "IBS",  value: ibsFutSaldo, color: "#10b981" },
  ];

  // Dados por ano de transição
  const projecaoAnos = tabelaTransicaoCompleta().map((f) => {
    const cbs = baseTotalSaida * (aliqCBS / 100) * f.cbs - baseEntradas * (aliqCBS / 100) * f.cbs;
    const ibs = baseTotalSaida * (aliqIBS / 100) * f.ibs - baseEntradas * (aliqIBS / 100) * f.ibs;
    const cbsP = Math.max(0, cbs);
    const ibsP = Math.max(0, ibs);
    return {
      ano: String(f.ano),
      cbs: cbsP,
      ibs: ibsP,
      total: cbsP + ibsP,
    };
  });

  if (!empresa) return <div>Selecione uma empresa primeiro.</div>;
  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Scale className="h-6 w-6" /> Exposição Tributária — IBS/CBS
          </h1>
          <p className="text-sm text-muted-foreground">
            Simulação comparativa: carga atual (PIS/COFINS + ICMS + IPI) vs. carga futura (CBS + IBS).
          </p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Período</label>
            <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              {periodos.map((p) => <option key={p} value={p}>{periodoToLabel(p)}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Ano simulado</label>
            <Select value={anoCompara} onChange={(e) => setAnoCompara(Number(e.target.value))}>
              {tabelaTransicaoCompleta().map((f) => <option key={f.ano} value={f.ano}>{f.ano}</option>)}
            </Select>
          </div>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Carga ATUAL ({periodoToLabel(periodo)})</CardTitle>
            <CardDescription>PIS + COFINS + ICMS + IPI</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700">{formatBRL(totalAtual)}</div>
            <div className="mt-3 space-y-1 text-xs">
              <Row label="PIS" v={pisAtualSaldo} />
              <Row label="COFINS" v={cofinsAtualSaldo} />
              <Row label="ICMS" v={icmsAtualSaldo} />
              <Row label="IPI" v={ipiAtualSaldo} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Carga FUTURA ({anoCompara})</CardTitle>
            <CardDescription>CBS + IBS · {fase.descricao}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">{formatBRL(totalFut)}</div>
            <div className="mt-3 space-y-1 text-xs">
              <Row label={`CBS (${aliqCBS}% × ${(fase.cbs * 100).toFixed(2)}%)`} v={cbsFutSaldo} />
              <Row label={`IBS (${aliqIBS}% × ${(fase.ibs * 100).toFixed(2)}%)`} v={ibsFutSaldo} />
            </div>
          </CardContent>
        </Card>

        <Card className={dif < 0 ? "border-green-300" : "border-red-300"}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Variação
            </CardTitle>
            <CardDescription>Impacto estimado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${dif < 0 ? "text-green-700" : "text-red-700"}`}>
              {dif >= 0 ? "+" : ""}{formatBRL(dif)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {difPct >= 0 ? "+" : ""}{difPct.toFixed(2)}% sobre a carga atual
            </div>
            <Badge variant={dif < 0 ? "success" : "destructive"} className="mt-3">
              {dif < 0 ? "Redução de carga" : "Aumento de carga"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Comparação por tributo</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosCompara}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="categoria" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Legend />
                <Bar dataKey="atual" fill="#3b82f6" name="Atual" />
                <Bar dataKey="futuro" fill="#10b981" name="Futuro" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projeção da CBS+IBS por ano de transição</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projecaoAnos}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="ano" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Legend />
                <Bar dataKey="cbs" stackId="a" fill="#3b82f6" name="CBS" />
                <Bar dataKey="ibs" stackId="a" fill="#10b981" name="IBS" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalhamento</CardTitle>
          <CardDescription>Base de cálculo e composição da carga tributária</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Componente</TH>
                <TH className="text-right">Base de cálculo</TH>
                <TH className="text-right">Débito</TH>
                <TH className="text-right">Crédito</TH>
                <TH className="text-right">Saldo a pagar</TH>
              </TR>
            </THead>
            <TBody>
              <TR><TD className="font-semibold">Saídas (período)</TD><TD className="text-right font-mono" colSpan={4}>{formatBRL(baseTotalSaida)}</TD></TR>
              <TR><TD>PIS</TD><TD className="text-right font-mono">{formatBRL(baseTotalSaida)}</TD><TD className="text-right font-mono">{formatBRL(pisAtualDeb)}</TD><TD className="text-right font-mono">{formatBRL(pisAtualCred)}</TD><TD className="text-right font-mono font-semibold">{formatBRL(pisAtualSaldo)}</TD></TR>
              <TR><TD>COFINS</TD><TD className="text-right font-mono">{formatBRL(baseTotalSaida)}</TD><TD className="text-right font-mono">{formatBRL(cofinsAtualDeb)}</TD><TD className="text-right font-mono">{formatBRL(cofinsAtualCred)}</TD><TD className="text-right font-mono font-semibold">{formatBRL(cofinsAtualSaldo)}</TD></TR>
              <TR><TD>ICMS</TD><TD className="text-right font-mono">{formatBRL(baseTotalSaida)}</TD><TD className="text-right font-mono">{formatBRL(icmsAtualDeb)}</TD><TD className="text-right font-mono">{formatBRL(icmsAtualCred)}</TD><TD className="text-right font-mono font-semibold">{formatBRL(icmsAtualSaldo)}</TD></TR>
              <TR><TD>IPI</TD><TD className="text-right font-mono">{formatBRL(baseTotalSaida)}</TD><TD className="text-right font-mono">{formatBRL(ipiAtualDeb)}</TD><TD className="text-right font-mono">{formatBRL(ipiAtualCred)}</TD><TD className="text-right font-mono font-semibold">{formatBRL(ipiAtualSaldo)}</TD></TR>
              <TR className="bg-muted/30"><TD className="font-bold">Total atual</TD><TD></TD><TD></TD><TD></TD><TD className="text-right font-mono font-bold">{formatBRL(totalAtual)}</TD></TR>
              <TR><TD className="font-semibold pt-4">Reforma ({anoCompara})</TD><TD></TD><TD></TD><TD></TD><TD></TD></TR>
              <TR><TD>CBS</TD><TD className="text-right font-mono">{formatBRL(baseTotalSaida)}</TD><TD className="text-right font-mono">{formatBRL(cbsFutDeb)}</TD><TD className="text-right font-mono">{formatBRL(cbsFutCred)}</TD><TD className="text-right font-mono font-semibold">{formatBRL(cbsFutSaldo)}</TD></TR>
              <TR><TD>IBS</TD><TD className="text-right font-mono">{formatBRL(baseTotalSaida)}</TD><TD className="text-right font-mono">{formatBRL(ibsFutDeb)}</TD><TD className="text-right font-mono">{formatBRL(ibsFutCred)}</TD><TD className="text-right font-mono font-semibold">{formatBRL(ibsFutSaldo)}</TD></TR>
              <TR className="bg-muted/30"><TD className="font-bold">Total futuro</TD><TD></TD><TD></TD><TD></TD><TD className="text-right font-mono font-bold">{formatBRL(totalFut)}</TD></TR>
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="pt-5 text-sm">
          <strong className="text-amber-900">Importante:</strong> A simulação usa as alíquotas cadastradas
          na empresa e as bases dos documentos importados. Em produção, considerar:
          alíquotas reduzidas por setor (saúde, educação, agro, cesta básica), regimes especiais
          (IS — Imposto Seletivo) e creditamento amplo do IVA. Valores são estimativas para planejamento.
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center justify-between border-b py-1 last:border-0">
      <span>{label}</span>
      <span className="font-mono">{formatBRL(v)}</span>
    </div>
  );
}
