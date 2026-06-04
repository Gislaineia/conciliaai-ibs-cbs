"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, Lock, FileCode2, Calculator } from "lucide-react";
import {
  getEmpresa, getApuracao, listApuracaoPorEnte, listDocumentos, listAllItens,
  upsertApuracao, replaceApuracaoPorEnte, listItensByDocumento, saveArquivoSped,
} from "@/lib/storage";
import { gerarSped } from "@/lib/sped-generator";
import { gerarSpedContribuicoes } from "@/lib/sped-contribuicoes";
import { calcularApuracao } from "@/lib/apuracao-engine";
import { formatBRL, periodoToLabel } from "@/lib/utils";
import type { Empresa, Apuracao, ApuracaoPorEnte, Documento, ItemDocumento } from "@/types";

export default function ApuracaoDetalhe() {
  const params = useParams<{ mes: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [apur, setApur] = useState<Apuracao | null>(null);
  const [entes, setEntes] = useState<ApuracaoPorEnte[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [itens, setItens] = useState<ItemDocumento[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    const e = await getEmpresa();
    setEmpresa(e);
    if (e) {
      const a = await getApuracao(e.id, params.mes);
      setApur(a);
      if (a) setEntes(await listApuracaoPorEnte(a.id));
    }
    const allDocs = await listDocumentos({ periodo: params.mes });
    setDocs(allDocs);
    const ais = await listAllItens();
    setItens(ais.filter((i) => allDocs.some((d) => d.id === i.documento_id)));
    setLoading(false);
  }

  useEffect(() => { reload(); }, [params.mes]);

  async function recalcular() {
    if (!empresa) return;
    const itensPorDoc = new Map<string, ItemDocumento[]>();
    const allItens = await listAllItens();
    for (const i of allItens) {
      const list = itensPorDoc.get(i.documento_id) ?? [];
      list.push(i);
      itensPorDoc.set(i.documento_id, list);
    }
    const allDocs = await listDocumentos();
    const calc = calcularApuracao(empresa, params.mes, allDocs, itensPorDoc);
    const saved = await upsertApuracao({ ...calc.apuracao, id: apur?.id ?? "" });
    await replaceApuracaoPorEnte(saved.id, calc.por_ente);
    toast({ type: "success", title: "Apuração recalculada" });
    reload();
  }

  async function fechar() {
    if (!apur || apur.status !== "aberta") return;
    if (!confirm("Fechar período? Edições posteriores serão bloqueadas.")) return;
    const updated = await upsertApuracao({ ...apur, status: "fechada" });
    setApur(updated);
    toast({ type: "success", title: "Período fechado" });
  }

  async function gerarArquivoSped(tipo: "EFD_ICMS_IPI" | "EFD_CONTRIBUICOES") {
    if (!empresa || !apur) return;
    if (empresa.regime_tributario === "SIMPLES_NACIONAL" || empresa.regime_tributario === "MEI") {
      toast({ type: "warning", title: "Regime não emite SPED" });
      return;
    }
    const docsComItens = await Promise.all(
      docs.map(async (d) => ({ ...d, itens: await listItensByDocumento(d.id) }))
    );

    if (tipo === "EFD_ICMS_IPI") {
      const out = gerarSped({ empresa, apuracao: apur, documentos: docsComItens, apuracoes_ente: entes });
      if (out.erros.length > 0) {
        toast({ type: "warning", title: "Avisos na geração", description: out.erros.join("; ") });
      }
      const arq = await saveArquivoSped({
        empresa_id: empresa.id,
        apuracao_id: apur.id,
        periodo: apur.periodo,
        tipo_sped: "EFD_ICMS_IPI",
        versao_layout: "018",
        conteudo_txt: out.conteudo,
        hash_md5: out.hash_md5,
        status: "gerado",
      });
      toast({ type: "success", title: "SPED ICMS/IPI gerado", description: `${out.total_linhas} linhas` });
      router.push(`/sped/${arq.id}`);
    } else {
      const out = gerarSpedContribuicoes({ empresa, apuracao: apur, documentos: docsComItens });
      if (out.erros.length > 0) {
        toast({ type: "warning", title: "Avisos", description: out.erros.join("; ") });
      }
      const arq = await saveArquivoSped({
        empresa_id: empresa.id,
        apuracao_id: apur.id,
        periodo: apur.periodo,
        tipo_sped: "EFD_CONTRIBUICOES",
        versao_layout: "006",
        conteudo_txt: out.conteudo,
        hash_md5: out.hash_md5,
        status: "gerado",
      });
      toast({
        type: "success",
        title: "SPED Contribuições gerado",
        description: `PIS ${out.pis_saldo.toFixed(2)} · COFINS ${out.cofins_saldo.toFixed(2)}`,
      });
      router.push(`/sped/${arq.id}`);
    }
  }

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;
  if (!empresa) return <div>Cadastre a empresa.</div>;

  if (!apur) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Apuração {periodoToLabel(params.mes)}</h1>
        <Card>
          <CardContent className="pt-5 space-y-3">
            <p>Apuração ainda não gerada para este período.</p>
            <Button onClick={recalcular}>Gerar apuração</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalIBSPagar = apur.ibs_est_saldo_pagar + apur.ibs_mun_saldo_pagar;
  const totalRecolher = apur.cbs_saldo_pagar + totalIBSPagar;

  const docsEntradas = docs.filter((d) => d.direcao === "ENTRADA");
  const docsSaidas = docs.filter((d) => d.direcao === "SAIDA");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/apuracao"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold">Apuração {periodoToLabel(apur.periodo)}</h1>
            <p className="text-sm text-muted-foreground">
              Fase: {apur.fase_transicao} · {(apur.percentual_cbs * 100).toFixed(2)}% CBS · {(apur.percentual_ibs * 100).toFixed(2)}% IBS
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant={
            apur.status === "transmitida" ? "success" :
            apur.status === "fechada" ? "info" : "warning"
          }>{apur.status}</Badge>
          <Button variant="outline" onClick={recalcular} disabled={apur.status !== "aberta"}>
            <Calculator className="h-4 w-4" /> Recalcular
          </Button>
          {apur.status === "aberta" && (
            <Button variant="outline" onClick={fechar}>
              <Lock className="h-4 w-4" /> Fechar período
            </Button>
          )}
          <Button onClick={() => gerarArquivoSped("EFD_ICMS_IPI")}>
            <FileCode2 className="h-4 w-4" /> Gerar SPED ICMS/IPI
          </Button>
          <Button variant="secondary" onClick={() => gerarArquivoSped("EFD_CONTRIBUICOES")}>
            <FileCode2 className="h-4 w-4" /> Gerar SPED Contribuições
          </Button>
        </div>
      </div>

      <Tabs defaultValue="resumo">
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="cbs">CBS</TabsTrigger>
          <TabsTrigger value="ibs">IBS</TabsTrigger>
          <TabsTrigger value="pis-cofins">PIS/COFINS (paralelo)</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="CBS a pagar" value={formatBRL(apur.cbs_saldo_pagar)} highlight />
            <KPI label="IBS Estadual a pagar" value={formatBRL(apur.ibs_est_saldo_pagar)} highlight />
            <KPI label="IBS Municipal a pagar" value={formatBRL(apur.ibs_mun_saldo_pagar)} highlight />
            <KPI label="Total a recolher" value={formatBRL(totalRecolher)} highlight emphasized />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <KPI label="Docs entrada" value={String(apur.total_docs_entrada)} />
            <KPI label="Docs saída" value={String(apur.total_docs_saida)} />
            <KPI label="Itens classificados" value={String(apur.total_itens_classificados)} />
            <KPI label="Itens pendentes" value={String(apur.total_itens_pendentes)} />
          </div>
        </TabsContent>

        <TabsContent value="cbs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <KPI label="Débitos CBS" value={formatBRL(apur.cbs_debitos)} />
            <KPI label="Créditos CBS" value={formatBRL(apur.cbs_creditos)} />
            <KPI label="Saldo a pagar" value={formatBRL(apur.cbs_saldo_pagar)} highlight />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Saídas (débitos)</CardTitle>
              <CardDescription>{docsSaidas.length} documento(s)</CardDescription>
            </CardHeader>
            <CardContent>
              <DocsTable docs={docsSaidas} itens={itens} tipo="cbs" />
            </CardContent>
          </Card>
          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Entradas (créditos)</CardTitle>
              <CardDescription>{docsEntradas.length} documento(s) — só os com crédito habilitado contam</CardDescription>
            </CardHeader>
            <CardContent>
              <DocsTable docs={docsEntradas} itens={itens} tipo="cbs" mostrar="creditos" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ibs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Por Estado</CardTitle></CardHeader>
              <CardContent>
                <EnteTable entes={entes.filter((e) => e.tipo_ente === "ESTADO")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Por Município</CardTitle></CardHeader>
              <CardContent>
                <EnteTable entes={entes.filter((e) => e.tipo_ente === "MUNICIPIO")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pis-cofins">
          <Card>
            <CardHeader>
              <CardTitle>PIS/COFINS — apuração paralela (transição)</CardTitle>
              <CardDescription>
                Calculado a partir dos valores PIS/COFINS dos próprios documentos do período.
                {empresa.regime_pis_cofins === "cumulativo"
                  ? " Regime cumulativo (Lucro Presumido) — sem crédito."
                  : " Regime não-cumulativo (Lucro Real) — com crédito."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PisCofinsResumo docs={docs} regime={empresa.regime_pis_cofins} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ label, value, highlight, emphasized }: { label: string; value: string; highlight?: boolean; emphasized?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "bg-primary/5 border-primary/30" : ""} ${emphasized ? "ring-2 ring-primary" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono font-semibold text-lg">{value}</div>
    </div>
  );
}

function DocsTable({ docs, itens, tipo, mostrar = "todos" }: { docs: Documento[]; itens: ItemDocumento[]; tipo: "cbs" | "ibs"; mostrar?: "todos" | "creditos" }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Doc</TH>
          <TH>Emitente</TH>
          <TH className="text-right">Base</TH>
          <TH className="text-right">CBS</TH>
          <TH className="text-right">IBS Est.</TH>
          <TH className="text-right">IBS Mun.</TH>
          <TH className="text-right">Crédito CBS</TH>
        </TR>
      </THead>
      <TBody>
        {docs.map((d) => {
          const its = itens.filter((i) => i.documento_id === d.id);
          const base = its.reduce((s, i) => s + (i.base_calculo_cbs || i.valor_total), 0);
          const cbs = its.reduce((s, i) => s + i.valor_cbs_ofertado, 0);
          const ibsE = its.reduce((s, i) => s + i.valor_ibs_est_ofertado, 0);
          const ibsM = its.reduce((s, i) => s + i.valor_ibs_mun_ofertado, 0);
          const credCbs = its.reduce((s, i) => s + i.valor_credito_cbs, 0);
          if (mostrar === "creditos" && credCbs <= 0) return null;
          return (
            <TR key={d.id}>
              <TD className="text-xs">{d.tipo} {d.numero_doc}</TD>
              <TD className="text-xs max-w-[180px] truncate">{d.razao_emitente}</TD>
              <TD className="text-right font-mono text-xs">{formatBRL(base)}</TD>
              <TD className="text-right font-mono text-xs">{formatBRL(cbs)}</TD>
              <TD className="text-right font-mono text-xs">{formatBRL(ibsE)}</TD>
              <TD className="text-right font-mono text-xs">{formatBRL(ibsM)}</TD>
              <TD className="text-right font-mono text-xs">{formatBRL(credCbs)}</TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

function EnteTable({ entes }: { entes: ApuracaoPorEnte[] }) {
  if (entes.length === 0) return <p className="text-sm text-muted-foreground">Sem movimento.</p>;
  return (
    <Table>
      <THead>
        <TR>
          <TH>Ente</TH>
          <TH className="text-right">Aliq.</TH>
          <TH className="text-right">Base</TH>
          <TH className="text-right">Débitos</TH>
          <TH className="text-right">Créditos</TH>
          <TH className="text-right">A pagar</TH>
        </TR>
      </THead>
      <TBody>
        {entes.map((e) => (
          <TR key={e.id}>
            <TD className="text-xs">{e.nome_ente}</TD>
            <TD className="text-right text-xs">{e.aliquota.toFixed(2)}%</TD>
            <TD className="text-right font-mono text-xs">{formatBRL(e.base_calculo)}</TD>
            <TD className="text-right font-mono text-xs">{formatBRL(e.debitos)}</TD>
            <TD className="text-right font-mono text-xs">{formatBRL(e.creditos)}</TD>
            <TD className="text-right font-mono text-xs font-semibold">{formatBRL(e.saldo_pagar)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function PisCofinsResumo({ docs, regime }: { docs: Documento[]; regime: string }) {
  const pisDeb = docs.filter((d) => d.direcao === "SAIDA").reduce((s, d) => s + d.valor_pis, 0);
  const cofinsDeb = docs.filter((d) => d.direcao === "SAIDA").reduce((s, d) => s + d.valor_cofins, 0);
  const pisCred = regime === "nao_cumulativo" ? docs.filter((d) => d.direcao === "ENTRADA").reduce((s, d) => s + d.valor_pis, 0) : 0;
  const cofinsCred = regime === "nao_cumulativo" ? docs.filter((d) => d.direcao === "ENTRADA").reduce((s, d) => s + d.valor_cofins, 0) : 0;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KPI label="PIS débitos" value={formatBRL(pisDeb)} />
      <KPI label="PIS créditos" value={formatBRL(pisCred)} />
      <KPI label="COFINS débitos" value={formatBRL(cofinsDeb)} />
      <KPI label="COFINS créditos" value={formatBRL(cofinsCred)} />
      <KPI label="PIS a pagar" value={formatBRL(Math.max(0, pisDeb - pisCred))} highlight />
      <KPI label="COFINS a pagar" value={formatBRL(Math.max(0, cofinsDeb - cofinsCred))} highlight />
    </div>
  );
}
