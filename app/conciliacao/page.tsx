"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/app-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { Scale, Play, RefreshCw, FileText } from "lucide-react";
import { formatBRL } from "@/lib/utils";

interface Conciliacao {
  id: string;
  empresa_id: string;
  periodo: string;
  total_capturados: number;
  total_escriturados: number;
  total_entrada: number;
  total_saida: number;
  total_cbs_documentos: number;
  total_ibs_documentos: number;
  total_cbs_apurado: number;
  total_ibs_apurado: number;
  capturados_nao_escriturados: number;
  escriturados_nao_capturados: number;
  diferenca_cbs: number;
  diferenca_ibs: number;
  duracao_ms: number;
  executado_em: string;
}

export default function ConciliacaoPage() {
  const { empresa } = useApp();
  const { toast } = useToast();
  const hoje = new Date();
  const periodoInicial = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [executando, setExecutando] = useState(false);
  const [parseando, setParseando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  async function executar() {
    if (!empresa) return;
    setExecutando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/conciliacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresa.id, periodo }),
      });
      const data = await r.json();
      setResultado(data);
      if (r.ok && data.status === "OK") {
        toast({
          type: "success",
          title: "Conciliação executada",
          description: `${data.divergencias_geradas ?? 0} divergência(s) detectada(s).`,
        });
      } else {
        toast({ type: "error", title: "Falha", description: data.mensagem });
      }
    } catch (e: any) {
      toast({ type: "error", title: "Erro", description: e.message });
    } finally {
      setExecutando(false);
    }
  }

  async function parseXmls() {
    if (!empresa) return;
    setParseando(true);
    try {
      const r = await fetch("/api/documentos/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresa.id, limit: 200 }),
      });
      const data = await r.json();
      if (r.ok) {
        toast({
          type: "success",
          title: `Parseados: ${data.sucesso}`,
          description: `${data.falha} falha(s) em ${data.processados} XML(s).`,
        });
      } else {
        toast({ type: "error", title: "Falha", description: data.mensagem });
      }
    } catch (e: any) {
      toast({ type: "error", title: "Erro", description: e.message });
    } finally {
      setParseando(false);
    }
  }

  if (!empresa)
    return <p className="p-8 text-muted-foreground">Selecione uma empresa primeiro.</p>;

  const c: Conciliacao | undefined = resultado?.conciliacao;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Scale className="h-6 w-6" /> Conciliação Fiscal
        </h1>
        <p className="text-sm text-muted-foreground">
          Confronto entre documentos capturados na SEFAZ, escriturados no sistema e a apuração do
          período.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Período (YYYY-MM)</label>
            <Input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
            />
          </div>
          <Button
            onClick={parseXmls}
            disabled={parseando}
            variant="outline"
            className="self-end gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${parseando ? "animate-spin" : ""}`} />
            {parseando ? "Parseando..." : "Parsear XMLs capturados"}
          </Button>
          <Button onClick={executar} disabled={executando} className="self-end gap-2">
            <Play className="h-4 w-4" />
            {executando ? "Executando..." : "Executar conciliação"}
          </Button>
        </CardContent>
      </Card>

      {c && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Capturados (SEFAZ)</div>
                <div className="text-2xl font-bold">{c.total_capturados}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Escriturados</div>
                <div className="text-2xl font-bold">{c.total_escriturados}</div>
              </CardContent>
            </Card>
            <Card className={c.capturados_nao_escriturados > 0 ? "border-amber-300" : ""}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Capturados sem escrita</div>
                <div className="text-2xl font-bold">{c.capturados_nao_escriturados}</div>
              </CardContent>
            </Card>
            <Card className={c.escriturados_nao_capturados > 0 ? "border-amber-300" : ""}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Escriturados sem XML</div>
                <div className="text-2xl font-bold">{c.escriturados_nao_capturados}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader>
                <CardTitle>Movimentação no período</CardTitle>
                <CardDescription>{c.periodo}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TBody>
                    <TR>
                      <TH>Total entradas</TH>
                      <TD className="text-right font-mono">{formatBRL(c.total_entrada)}</TD>
                    </TR>
                    <TR>
                      <TH>Total saídas</TH>
                      <TD className="text-right font-mono">{formatBRL(c.total_saida)}</TD>
                    </TR>
                    <TR>
                      <TH>CBS (somatório docs)</TH>
                      <TD className="text-right font-mono">{formatBRL(c.total_cbs_documentos)}</TD>
                    </TR>
                    <TR>
                      <TH>CBS apurada</TH>
                      <TD className="text-right font-mono">{formatBRL(c.total_cbs_apurado)}</TD>
                    </TR>
                    <TR>
                      <TH>IBS (somatório docs)</TH>
                      <TD className="text-right font-mono">{formatBRL(c.total_ibs_documentos)}</TD>
                    </TR>
                    <TR>
                      <TH>IBS apurada</TH>
                      <TD className="text-right font-mono">{formatBRL(c.total_ibs_apurado)}</TD>
                    </TR>
                  </TBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Diferenças</CardTitle>
                <CardDescription>Documental × Apurado</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground">Diferença CBS</div>
                  <div
                    className={`text-2xl font-bold ${
                      Math.abs(c.diferenca_cbs) > 0.5 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {formatBRL(c.diferenca_cbs)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Diferença IBS</div>
                  <div
                    className={`text-2xl font-bold ${
                      Math.abs(c.diferenca_ibs) > 0.5 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {formatBRL(c.diferenca_ibs)}
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  Executado em {new Date(c.executado_em).toLocaleString("pt-BR")} (
                  {c.duracao_ms}ms)
                </Badge>
              </CardContent>
            </Card>
          </div>

          {resultado.capturados_nao_escriturados?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> XMLs capturados não escriturados (
                  {resultado.capturados_nao_escriturados.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>Chave</TH>
                      <TH>Schema</TH>
                      <TH>Origem</TH>
                      <TH>Importado em</TH>
                      <TH>Parseado</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {resultado.capturados_nao_escriturados.map((d: any, i: number) => (
                      <TR key={i}>
                        <TD className="text-xs font-mono max-w-[280px] truncate">
                          {d.chave_acesso}
                        </TD>
                        <TD>
                          <Badge variant="outline">{d.schema}</Badge>
                        </TD>
                        <TD className="text-xs">{d.sim}</TD>
                        <TD className="text-xs">
                          {d.importado_em
                            ? new Date(d.importado_em).toLocaleDateString("pt-BR")
                            : "-"}
                        </TD>
                        <TD>
                          {d.parseado_em ? (
                            <Badge variant="success">sim</Badge>
                          ) : (
                            <Badge variant="warning">não</Badge>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
