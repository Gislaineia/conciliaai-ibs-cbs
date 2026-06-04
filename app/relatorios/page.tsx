"use client";
import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  getEmpresa, listApuracoes, listDocumentos, listAllItens,
} from "@/lib/storage";
import type { Empresa, Apuracao, Documento, ItemDocumento } from "@/types";
import { formatBRL, periodoToLabel } from "@/lib/utils";
import { Download, Printer, BarChart3 } from "lucide-react";

export default function RelatoriosPage() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [apuracoes, setApuracoes] = useState<Apuracao[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [itens, setItens] = useState<ItemDocumento[]>([]);
  const [periodo, setPeriodo] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const e = await getEmpresa();
      setEmpresa(e);
      const d = await listDocumentos();
      setDocs(d);
      setItens(await listAllItens());
      if (e) {
        const a = await listApuracoes(e.id);
        setApuracoes(a);
        if (a.length > 0) setPeriodo(a[0].periodo);
        else if (d.length > 0) setPeriodo(d[0].periodo_competencia);
      }
      setLoading(false);
    })();
  }, []);

  const periodos = Array.from(new Set([
    ...apuracoes.map((a) => a.periodo),
    ...docs.map((d) => d.periodo_competencia),
  ])).sort().reverse();

  const docsP = useMemo(() => docs.filter((d) => d.periodo_competencia === periodo), [docs, periodo]);
  const itensP = useMemo(
    () => itens.filter((i) => docsP.some((d) => d.id === i.documento_id)),
    [itens, docsP]
  );
  const apuracaoP = apuracoes.find((a) => a.periodo === periodo);

  function exportCSV(linhas: string[][], filename: string) {
    const csv = linhas.map((row) => row.map((c) => `"${(c ?? "").toString().replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function printPage() { window.print(); }

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;
  if (!empresa) return <div>Cadastre a empresa.</div>;

  const entradas = docsP.filter((d) => d.direcao === "ENTRADA");
  const saidas = docsP.filter((d) => d.direcao === "SAIDA");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Apuração consolidada, livros entrada/saída e demonstrativos.</p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Período</label>
            <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              {periodos.map((p) => <option key={p} value={p}>{periodoToLabel(p)}</option>)}
            </Select>
          </div>
          <Button variant="outline" onClick={printPage}><Printer className="h-4 w-4" /> Imprimir / PDF</Button>
        </div>
      </div>

      <Tabs defaultValue="consolidado">
        <TabsList className="print:hidden">
          <TabsTrigger value="consolidado">Apuração Consolidada</TabsTrigger>
          <TabsTrigger value="entrada">Livro Entradas</TabsTrigger>
          <TabsTrigger value="saida">Livro Saídas</TabsTrigger>
          <TabsTrigger value="creditos">Demonstrativo de Créditos</TabsTrigger>
          <TabsTrigger value="pis-cofins">PIS/COFINS Paralelo</TabsTrigger>
        </TabsList>

        <TabsContent value="consolidado">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Apuração consolidada — {periodoToLabel(periodo)}</CardTitle>
              <CardDescription>{empresa.razao_social} · {empresa.cnpj}</CardDescription>
            </CardHeader>
            <CardContent>
              {apuracaoP ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Stat label="CBS débitos" value={formatBRL(apuracaoP.cbs_debitos)} />
                  <Stat label="CBS créditos" value={formatBRL(apuracaoP.cbs_creditos)} />
                  <Stat label="CBS a pagar" value={formatBRL(apuracaoP.cbs_saldo_pagar)} />
                  <Stat label="IBS Est. débitos" value={formatBRL(apuracaoP.ibs_est_debitos)} />
                  <Stat label="IBS Est. créditos" value={formatBRL(apuracaoP.ibs_est_creditos)} />
                  <Stat label="IBS Est. a pagar" value={formatBRL(apuracaoP.ibs_est_saldo_pagar)} />
                  <Stat label="IBS Mun. débitos" value={formatBRL(apuracaoP.ibs_mun_debitos)} />
                  <Stat label="IBS Mun. créditos" value={formatBRL(apuracaoP.ibs_mun_creditos)} />
                  <Stat label="IBS Mun. a pagar" value={formatBRL(apuracaoP.ibs_mun_saldo_pagar)} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem apuração para esse período.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="entrada">
          <LivroTable
            title="Livro de Entradas"
            docs={entradas}
            itens={itensP}
            onExport={() => exportCSV(
              [
                ["Data", "Tipo", "Número", "Emitente", "CNPJ", "CRT", "CFOP", "Valor", "ICMS", "PIS", "COFINS", "CBS", "IBS"],
                ...entradas.map((d) => [
                  d.data_emissao, d.tipo, d.numero_doc ?? "", d.razao_emitente ?? "", d.cnpj_emitente,
                  d.crt_emitente ?? "", d.cfop_principal ?? "",
                  String(d.valor_total), String(d.valor_icms), String(d.valor_pis), String(d.valor_cofins),
                  String(d.valor_cbs_documento), String(d.valor_ibs_documento),
                ]),
              ],
              `livro-entradas-${periodo}.csv`
            )}
          />
        </TabsContent>

        <TabsContent value="saida">
          <LivroTable
            title="Livro de Saídas"
            docs={saidas}
            itens={itensP}
            onExport={() => exportCSV(
              [
                ["Data", "Tipo", "Número", "Destinatário", "CNPJ", "CFOP", "Valor", "ICMS", "PIS", "COFINS", "CBS", "IBS"],
                ...saidas.map((d) => [
                  d.data_emissao, d.tipo, d.numero_doc ?? "", d.razao_emitente ?? "", d.cnpj_emitente,
                  d.cfop_principal ?? "",
                  String(d.valor_total), String(d.valor_icms), String(d.valor_pis), String(d.valor_cofins),
                  String(d.valor_cbs_documento), String(d.valor_ibs_documento),
                ]),
              ],
              `livro-saidas-${periodo}.csv`
            )}
          />
        </TabsContent>

        <TabsContent value="creditos">
          <Card>
            <CardHeader>
              <CardTitle>Demonstrativo de Créditos</CardTitle>
              <CardDescription>Quebra integral × presumido × vedado</CardDescription>
            </CardHeader>
            <CardContent>
              <DemoCreditos itens={itensP} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pis-cofins">
          <Card>
            <CardHeader>
              <CardTitle>PIS/COFINS Paralelo</CardTitle>
              <CardDescription>Apuração paralela durante a transição</CardDescription>
            </CardHeader>
            <CardContent>
              <PisCofinsResumo docs={docsP} regime={empresa.regime_pis_cofins} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono font-semibold">{value}</div>
    </div>
  );
}

function LivroTable({ title, docs, itens, onExport }: { title: string; docs: Documento[]; itens: ItemDocumento[]; onExport: () => void }) {
  const total = docs.reduce((s, d) => s + d.valor_total, 0);
  const totalCbs = docs.reduce((s, d) => s + d.valor_cbs_documento, 0);
  const totalIbs = docs.reduce((s, d) => s + d.valor_ibs_documento, 0);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{docs.length} documento(s) · Total {formatBRL(total)}</CardDescription>
        </div>
        <Button variant="outline" onClick={onExport} className="print:hidden"><Download className="h-4 w-4" /> CSV</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <THead>
            <TR>
              <TH>Data</TH><TH>Tipo</TH><TH>Nº</TH><TH>Emitente</TH>
              <TH>CFOP</TH>
              <TH className="text-right">Valor</TH>
              <TH className="text-right">CBS</TH>
              <TH className="text-right">IBS</TH>
            </TR>
          </THead>
          <TBody>
            {docs.map((d) => (
              <TR key={d.id}>
                <TD className="text-xs">{d.data_emissao}</TD>
                <TD className="text-xs">{d.tipo}</TD>
                <TD>{d.numero_doc}</TD>
                <TD className="text-xs max-w-[180px] truncate">{d.razao_emitente}</TD>
                <TD className="text-xs">{d.cfop_principal}</TD>
                <TD className="text-right font-mono text-xs">{formatBRL(d.valor_total)}</TD>
                <TD className="text-right font-mono text-xs">{formatBRL(d.valor_cbs_documento)}</TD>
                <TD className="text-right font-mono text-xs">{formatBRL(d.valor_ibs_documento)}</TD>
              </TR>
            ))}
          </TBody>
          <tfoot>
            <tr className="font-semibold border-t-2 bg-muted/30">
              <td colSpan={5} className="p-3">Totais</td>
              <td className="p-3 text-right font-mono">{formatBRL(total)}</td>
              <td className="p-3 text-right font-mono">{formatBRL(totalCbs)}</td>
              <td className="p-3 text-right font-mono">{formatBRL(totalIbs)}</td>
            </tr>
          </tfoot>
        </Table>
      </CardContent>
    </Card>
  );
}

function DemoCreditos({ itens }: { itens: ItemDocumento[] }) {
  const integral = itens.filter((i) => i.gera_credito && i.tipo_calculo_credito !== "presumido");
  const presumido = itens.filter((i) => i.gera_credito && i.tipo_calculo_credito === "presumido");
  const vedado = itens.filter((i) => !i.gera_credito);
  const sumCBS = (arr: ItemDocumento[]) => arr.reduce((s, i) => s + i.valor_credito_cbs, 0);
  const sumIBS = (arr: ItemDocumento[]) => arr.reduce((s, i) => s + i.valor_credito_ibs_est + i.valor_credito_ibs_mun, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Stat label="Integral — itens" value={String(integral.length)} />
      <Stat label="Integral — CBS crédito" value={formatBRL(sumCBS(integral))} />
      <Stat label="Integral — IBS crédito" value={formatBRL(sumIBS(integral))} />
      <Stat label="Presumido — itens" value={String(presumido.length)} />
      <Stat label="Presumido — CBS crédito" value={formatBRL(sumCBS(presumido))} />
      <Stat label="Presumido — IBS crédito" value={formatBRL(sumIBS(presumido))} />
      <Stat label="Vedado — itens" value={String(vedado.length)} />
      <Stat label="Vedado — CBS (perdido)" value={formatBRL(vedado.reduce((s, i) => s + i.valor_cbs_ofertado, 0))} />
      <Stat label="Vedado — IBS (perdido)" value={formatBRL(vedado.reduce((s, i) => s + i.valor_ibs_est_ofertado + i.valor_ibs_mun_ofertado, 0))} />
    </div>
  );
}

function PisCofinsResumo({ docs, regime }: { docs: Documento[]; regime: string }) {
  const pisDeb = docs.filter((d) => d.direcao === "SAIDA").reduce((s, d) => s + d.valor_pis, 0);
  const cofinsDeb = docs.filter((d) => d.direcao === "SAIDA").reduce((s, d) => s + d.valor_cofins, 0);
  const pisCred = regime === "nao_cumulativo" ? docs.filter((d) => d.direcao === "ENTRADA").reduce((s, d) => s + d.valor_pis, 0) : 0;
  const cofinsCred = regime === "nao_cumulativo" ? docs.filter((d) => d.direcao === "ENTRADA").reduce((s, d) => s + d.valor_cofins, 0) : 0;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Stat label="PIS débitos" value={formatBRL(pisDeb)} />
      <Stat label="PIS créditos" value={formatBRL(pisCred)} />
      <Stat label="PIS a pagar" value={formatBRL(Math.max(0, pisDeb - pisCred))} />
      <Stat label="COFINS débitos" value={formatBRL(cofinsDeb)} />
      <Stat label="COFINS créditos" value={formatBRL(cofinsCred)} />
      <Stat label="COFINS a pagar" value={formatBRL(Math.max(0, cofinsDeb - cofinsCred))} />
    </div>
  );
}
