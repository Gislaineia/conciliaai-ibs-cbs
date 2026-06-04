"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { listDocumentos, deleteDocumento } from "@/lib/storage";
import type { Documento } from "@/types";
import { formatBRL } from "@/lib/utils";
import { ChevronRight, Trash2, FileText } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export default function DocumentosPage() {
  const { toast } = useToast();
  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroDirecao, setFiltroDirecao] = useState<string>("");
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>("");
  const [filtroStatus, setFiltroStatus] = useState<string>("");

  async function reload() {
    setLoading(true);
    setDocs(await listDocumentos());
    setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (filtroDirecao && d.direcao !== filtroDirecao) return false;
      if (filtroPeriodo && d.periodo_competencia !== filtroPeriodo) return false;
      if (filtroStatus && d.status_classificacao !== filtroStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        return [d.numero_doc, d.cnpj_emitente, d.razao_emitente, d.chave_acesso].some((v) =>
          (v ?? "").toString().toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [docs, filtroDirecao, filtroPeriodo, filtroStatus, search]);

  const periodos = Array.from(new Set(docs.map((d) => d.periodo_competencia))).sort().reverse();

  async function onDelete(id: string) {
    if (!confirm("Excluir este documento e seus itens?")) return;
    await deleteDocumento(id);
    toast({ type: "success", title: "Documento excluído" });
    reload();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documentos Fiscais</h1>
        <p className="text-sm text-muted-foreground">
          Lista completa de NF-e, CT-e e NFS-e capturados.
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-5">
          <Input
            placeholder="Buscar (número, CNPJ, razão social, chave)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:col-span-2"
          />
          <Select value={filtroDirecao} onChange={(e) => setFiltroDirecao(e.target.value)}>
            <option value="">Todas direções</option>
            <option value="ENTRADA">Entradas</option>
            <option value="SAIDA">Saídas</option>
          </Select>
          <Select value={filtroPeriodo} onChange={(e) => setFiltroPeriodo(e.target.value)}>
            <option value="">Todos os períodos</option>
            {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <Select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos status</option>
            <option value="pendente">Pendente</option>
            <option value="parcial">Parcial</option>
            <option value="classificado">Classificado</option>
            <option value="critico">Crítico</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> {filtered.length} documento(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">Nenhum documento. Acesse <Link href="/captura" className="underline">Capturar XMLs</Link> para importar.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Tipo</TH>
                  <TH>Direção</TH>
                  <TH>Número</TH>
                  <TH>Data</TH>
                  <TH>Emitente</TH>
                  <TH>CRT</TH>
                  <TH>Período</TH>
                  <TH className="text-right">Valor</TH>
                  <TH>Status</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((d) => (
                  <TR key={d.id}>
                    <TD><Badge variant="outline">{d.tipo}</Badge></TD>
                    <TD>
                      <Badge variant={d.direcao === "ENTRADA" ? "info" : "secondary"}>
                        {d.direcao}
                      </Badge>
                    </TD>
                    <TD>{d.numero_doc}</TD>
                    <TD className="text-xs">{d.data_emissao}</TD>
                    <TD className="text-xs max-w-[200px] truncate" title={d.razao_emitente ?? ""}>
                      <div>{d.razao_emitente}</div>
                      <div className="text-muted-foreground">{d.cnpj_emitente}</div>
                    </TD>
                    <TD>{d.crt_emitente ?? "-"}</TD>
                    <TD className="text-xs">{d.periodo_competencia}</TD>
                    <TD className="text-right font-mono">{formatBRL(d.valor_total)}</TD>
                    <TD>
                      <Badge
                        variant={
                          d.status_classificacao === "classificado" ? "success" :
                          d.status_classificacao === "parcial" ? "warning" :
                          d.status_classificacao === "critico" ? "destructive" : "outline"
                        }
                      >
                        {d.status_classificacao}
                      </Badge>
                    </TD>
                    <TD className="flex items-center gap-1">
                      <Link href={`/documentos/${d.id}`}>
                        <Button variant="ghost" size="icon"><ChevronRight className="h-4 w-4" /></Button>
                      </Link>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(d.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
