"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { getDocumento, listItensByDocumento } from "@/lib/storage";
import type { Documento, ItemDocumento } from "@/types";
import { formatBRL, formatPercent, formatNumber } from "@/lib/utils";

export default function DocumentoDetalhe() {
  const params = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Documento | null>(null);
  const [itens, setItens] = useState<ItemDocumento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      setDoc(await getDocumento(params.id));
      setItens(await listItensByDocumento(params.id));
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;
  if (!doc) return <div>Documento não encontrado.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/documentos">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {doc.tipo} {doc.numero_doc} <span className="text-muted-foreground">— Série {doc.serie}</span>
          </h1>
          <p className="text-sm text-muted-foreground">{doc.chave_acesso}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Emitente</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">Razão:</span> {doc.razao_emitente}</div>
            <div><span className="text-muted-foreground">CNPJ:</span> {doc.cnpj_emitente}</div>
            <div><span className="text-muted-foreground">CRT:</span> {doc.crt_emitente ?? "-"}</div>
            <div><span className="text-muted-foreground">UF/Município:</span> {doc.uf_emitente}/{doc.municipio_emitente}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Operação</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Direção:</span>{" "}
              <Badge variant={doc.direcao === "ENTRADA" ? "info" : "secondary"}>{doc.direcao}</Badge>
            </div>
            <div><span className="text-muted-foreground">Data emissão:</span> {doc.data_emissao}</div>
            <div><span className="text-muted-foreground">CFOP principal:</span> {doc.cfop_principal}</div>
            <div><span className="text-muted-foreground">Período:</span> {doc.periodo_competencia}</div>
            <div>
              <span className="text-muted-foreground">Status:</span>{" "}
              <Badge variant={doc.status_classificacao === "classificado" ? "success" : "warning"}>
                {doc.status_classificacao}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Totalizadores</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Valor total" value={formatBRL(doc.valor_total)} />
          <Stat label="Produtos" value={formatBRL(doc.valor_produtos)} />
          <Stat label="Frete" value={formatBRL(doc.valor_frete)} />
          <Stat label="ICMS" value={formatBRL(doc.valor_icms)} />
          <Stat label="IPI" value={formatBRL(doc.valor_ipi)} />
          <Stat label="PIS" value={formatBRL(doc.valor_pis)} />
          <Stat label="COFINS" value={formatBRL(doc.valor_cofins)} />
          <Stat label="CBS" value={formatBRL(doc.valor_cbs_documento)} highlight />
          <Stat label="IBS" value={formatBRL(doc.valor_ibs_documento)} highlight />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Itens ({itens.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Produto</TH>
                <TH>NCM</TH>
                <TH>CFOP</TH>
                <TH className="text-right">Qtd</TH>
                <TH className="text-right">V. Total</TH>
                <TH>CST CBS</TH>
                <TH className="text-right">Aliq. CBS</TH>
                <TH className="text-right">V. CBS</TH>
                <TH>CST IBS</TH>
                <TH className="text-right">V. IBS Est.</TH>
                <TH className="text-right">V. IBS Mun.</TH>
                <TH>Natureza</TH>
                <TH>Crédito</TH>
              </TR>
            </THead>
            <TBody>
              {itens.map((i) => (
                <TR key={i.id}>
                  <TD>{i.numero_item}</TD>
                  <TD className="text-xs max-w-[180px] truncate" title={i.descricao}>{i.descricao}</TD>
                  <TD className="text-xs">{i.ncm}</TD>
                  <TD className="text-xs">{i.cfop}</TD>
                  <TD className="text-right font-mono text-xs">{formatNumber(i.quantidade, 2)}</TD>
                  <TD className="text-right font-mono">{formatBRL(i.valor_total)}</TD>
                  <TD>{i.cst_cbs ?? "-"}</TD>
                  <TD className="text-right text-xs">{formatPercent(i.aliquota_cbs)}</TD>
                  <TD className="text-right font-mono text-xs">{formatBRL(i.valor_cbs_ofertado)}</TD>
                  <TD>{i.cst_ibs ?? "-"}</TD>
                  <TD className="text-right font-mono text-xs">{formatBRL(i.valor_ibs_est_ofertado)}</TD>
                  <TD className="text-right font-mono text-xs">{formatBRL(i.valor_ibs_mun_ofertado)}</TD>
                  <TD className="text-xs">{i.natureza_operacao ?? "-"}</TD>
                  <TD>
                    {i.gera_credito ? (
                      <Badge variant="success">{i.tipo_calculo_credito}</Badge>
                    ) : (
                      <Badge variant="outline">não</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-sm ${highlight ? "font-semibold" : ""}`}>{value}</div>
    </div>
  );
}
