"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  getEmpresa, listApuracoes, listDocumentos, listAllItens, upsertApuracao, replaceApuracaoPorEnte,
} from "@/lib/storage";
import { calcularApuracao } from "@/lib/apuracao-engine";
import { formatBRL, periodoToLabel } from "@/lib/utils";
import type { Empresa, Apuracao, Documento, ItemDocumento } from "@/types";
import { Calculator, ChevronRight, Plus } from "lucide-react";

export default function ApuracaoListPage() {
  const { toast } = useToast();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [apuracoes, setApuracoes] = useState<Apuracao[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [itens, setItens] = useState<ItemDocumento[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    const e = await getEmpresa();
    setEmpresa(e);
    setDocs(await listDocumentos());
    setItens(await listAllItens());
    if (e) setApuracoes(await listApuracoes(e.id));
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  const periodosComDocs = Array.from(new Set(docs.map((d) => d.periodo_competencia))).sort().reverse();

  async function gerarApuracao(periodo: string) {
    if (!empresa) return;
    const itensPorDoc = new Map<string, ItemDocumento[]>();
    for (const i of itens) {
      const list = itensPorDoc.get(i.documento_id) ?? [];
      list.push(i);
      itensPorDoc.set(i.documento_id, list);
    }
    const calc = calcularApuracao(empresa, periodo, docs, itensPorDoc);
    const saved = await upsertApuracao(calc.apuracao);
    await replaceApuracaoPorEnte(saved.id, calc.por_ente);
    toast({ type: "success", title: "Apuração gerada", description: periodoToLabel(periodo) });
    reload();
  }

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;
  if (!empresa) return <div>Cadastre a empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Apurações Mensais</h1>
        <p className="text-sm text-muted-foreground">Selecione um período para visualizar débitos, créditos e saldo.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Apurações ({apuracoes.length})
          </CardTitle>
          <CardDescription>Status: aberta = editável · fechada = bloqueada · transmitida = enviada à RFB</CardDescription>
        </CardHeader>
        <CardContent>
          {apuracoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma apuração. Gere uma a partir dos períodos com documentos abaixo.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Período</TH>
                  <TH>Status</TH>
                  <TH>Fase</TH>
                  <TH className="text-right">CBS a pagar</TH>
                  <TH className="text-right">IBS Est. a pagar</TH>
                  <TH className="text-right">IBS Mun. a pagar</TH>
                  <TH className="text-right">Total</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {apuracoes.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-semibold">{periodoToLabel(a.periodo)}</TD>
                    <TD>
                      <Badge variant={
                        a.status === "transmitida" ? "success" :
                        a.status === "fechada" ? "info" : "warning"
                      }>{a.status}</Badge>
                    </TD>
                    <TD className="text-xs">{a.fase_transicao}</TD>
                    <TD className="text-right font-mono text-sm">{formatBRL(a.cbs_saldo_pagar)}</TD>
                    <TD className="text-right font-mono text-sm">{formatBRL(a.ibs_est_saldo_pagar)}</TD>
                    <TD className="text-right font-mono text-sm">{formatBRL(a.ibs_mun_saldo_pagar)}</TD>
                    <TD className="text-right font-mono font-semibold">
                      {formatBRL(a.cbs_saldo_pagar + a.ibs_est_saldo_pagar + a.ibs_mun_saldo_pagar)}
                    </TD>
                    <TD>
                      <Link href={`/apuracao/${a.periodo}`}>
                        <Button variant="ghost" size="icon"><ChevronRight className="h-4 w-4" /></Button>
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Períodos com documentos</CardTitle>
          <CardDescription>Gere ou atualize a apuração de qualquer período.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {periodosComDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum documento importado.</p>
          ) : (
            periodosComDocs.map((p) => {
              const ja = apuracoes.find((a) => a.periodo === p);
              return (
                <Button
                  key={p}
                  variant={ja ? "outline" : "default"}
                  onClick={() => gerarApuracao(p)}
                >
                  <Plus className="h-4 w-4" />
                  {ja ? `Atualizar ${periodoToLabel(p)}` : `Gerar ${periodoToLabel(p)}`}
                </Button>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
