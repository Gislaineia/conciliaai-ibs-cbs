"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { listDivergencias, updateDivergencia } from "@/lib/storage";
import { useApp } from "@/lib/app-context";
import type { Divergencia, SeveridadeDivergencia } from "@/types";
import { AlertTriangle, AlertCircle, CheckCircle2, XCircle, ExternalLink, Filter } from "lucide-react";

export default function DivergenciasPage() {
  const { toast } = useToast();
  const { empresa } = useApp();
  const [list, setList] = useState<Divergencia[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<string>("aberta");
  const [filtroSev, setFiltroSev] = useState<string>("");
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [dlgOpen, setDlgOpen] = useState(false);
  const [edit, setEdit] = useState<Divergencia | null>(null);
  const [decisao, setDecisao] = useState("");
  const [loading, setLoading] = useState(true);

  async function reload() {
    if (!empresa) return;
    setLoading(true);
    setList(await listDivergencias(empresa.id));
    setLoading(false);
  }
  useEffect(() => { reload(); }, [empresa?.id]);

  const filtered = useMemo(() => {
    return list.filter((d) => {
      if (filtroStatus && d.status !== filtroStatus) return false;
      if (filtroSev && d.severidade !== filtroSev) return false;
      if (filtroTipo && d.tipo !== filtroTipo) return false;
      if (search) {
        const s = search.toLowerCase();
        return [d.titulo, d.descricao].some((v) => (v ?? "").toString().toLowerCase().includes(s));
      }
      return true;
    });
  }, [list, filtroStatus, filtroSev, filtroTipo, search]);

  // Resumo por severidade
  const abertas = list.filter((d) => d.status === "aberta");
  const criticas = abertas.filter((d) => d.severidade === "CRITICO");
  const atencao = abertas.filter((d) => d.severidade === "ATENCAO");

  function abrirResolucao(d: Divergencia) {
    setEdit(d);
    setDecisao(d.resolucao_decisao ?? "");
    setDlgOpen(true);
  }

  async function resolver() {
    if (!edit) return;
    await updateDivergencia(edit.id, {
      status: "resolvida",
      resolucao_decisao: decisao,
      resolucao_em: new Date().toISOString(),
    });
    toast({ type: "success", title: "Divergência resolvida" });
    setDlgOpen(false);
    reload();
  }

  async function ignorar(d: Divergencia) {
    if (!confirm("Ignorar esta divergência? Ela não aparecerá nos alertas.")) return;
    await updateDivergencia(d.id, { status: "ignorada" });
    reload();
  }

  async function reabrir(d: Divergencia) {
    await updateDivergencia(d.id, { status: "aberta", resolucao_decisao: null, resolucao_em: null });
    reload();
  }

  if (!empresa) return <div>Selecione uma empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <AlertTriangle className="h-6 w-6" /> Divergências
        </h1>
        <p className="text-sm text-muted-foreground">
          Tudo que não se encaixou nas regras. Resolva uma vez — o sistema grava a decisão.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <CardSev label="OK" qtd={list.length - abertas.length} cor="success" icon={<CheckCircle2 className="h-4 w-4" />} subtitle={`${list.length - abertas.length} resolvidas/ignoradas`} />
        <CardSev label="Atenção" qtd={atencao.length} cor="warning" icon={<AlertTriangle className="h-4 w-4" />} subtitle="Pode liberar SPED com ressalvas" />
        <CardSev label="Crítico" qtd={criticas.length} cor="destructive" icon={<XCircle className="h-4 w-4" />} subtitle="Bloqueia geração do SPED" />
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-5">
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos status</option>
            <option value="aberta">Aberta</option>
            <option value="resolvida">Resolvida</option>
            <option value="ignorada">Ignorada</option>
          </Select>
          <Select value={filtroSev} onChange={(e) => setFiltroSev(e.target.value)}>
            <option value="">Toda severidade</option>
            <option value="CRITICO">Crítico</option>
            <option value="ATENCAO">Atenção</option>
            <option value="OK">OK</option>
          </Select>
          <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos tipos</option>
            <option value="ITEM_SEM_CLASSIFICACAO">Item sem classificação</option>
            <option value="NCM_INEXISTENTE">NCM inexistente</option>
            <option value="FORNECEDOR_DESCONHECIDO">Fornecedor desconhecido</option>
            <option value="CFOP_INCONSISTENTE">CFOP inconsistente</option>
            <option value="CST_VEDADO_COM_CREDITO">CST vedado com crédito</option>
            <option value="ALIQUOTA_DIVERGENTE">Alíquota divergente</option>
            <option value="VALOR_DESTACADO_DIVERGENTE">Valor destacado divergente</option>
            <option value="DOC_FORA_PERIODO">Documento fora do período</option>
            <option value="DOC_DUPLICADO">Documento duplicado</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-4 w-4" /> {filtered.length} divergência(s)</CardTitle>
          <CardDescription>Empresa: {empresa.razao_social}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <p>Carregando...</p> : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma divergência. ✓</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Severidade</TH>
                  <TH>Tipo</TH>
                  <TH>Título</TH>
                  <TH>Descrição</TH>
                  <TH>Doc</TH>
                  <TH>Status</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.slice(0, 200).map((d) => (
                  <TR key={d.id}>
                    <TD>
                      <Badge variant={
                        d.severidade === "CRITICO" ? "destructive" :
                        d.severidade === "ATENCAO" ? "warning" : "success"
                      }>{d.severidade}</Badge>
                    </TD>
                    <TD className="text-xs">{d.tipo}</TD>
                    <TD className="text-xs font-medium">{d.titulo}</TD>
                    <TD className="text-xs max-w-[280px] truncate" title={d.descricao}>{d.descricao}</TD>
                    <TD>
                      {d.documento_id && (
                        <Link href={`/documentos/${d.documento_id}`}>
                          <Button variant="ghost" size="icon"><ExternalLink className="h-3.5 w-3.5" /></Button>
                        </Link>
                      )}
                    </TD>
                    <TD>
                      <Badge variant={
                        d.status === "resolvida" ? "success" :
                        d.status === "ignorada" ? "outline" : "warning"
                      }>{d.status}</Badge>
                    </TD>
                    <TD className="flex gap-1">
                      {d.status === "aberta" && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => abrirResolucao(d)}>Resolver</Button>
                          <Button variant="ghost" size="sm" onClick={() => ignorar(d)}>Ignorar</Button>
                        </>
                      )}
                      {(d.status === "resolvida" || d.status === "ignorada") && (
                        <Button variant="ghost" size="sm" onClick={() => reabrir(d)}>Reabrir</Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogHeader>
          <DialogTitle>Resolver divergência</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          {edit && (
            <>
              <div className="rounded-md border p-3 text-sm bg-muted/40">
                <div className="font-medium">{edit.titulo}</div>
                <div className="text-xs text-muted-foreground mt-1">{edit.descricao}</div>
                {edit.sugestao && (
                  <div className="text-xs mt-2 p-2 rounded bg-blue-50 border border-blue-200">
                    <strong>Sugestão:</strong> {edit.sugestao}
                  </div>
                )}
              </div>
              <div>
                <Label>Decisão tomada *</Label>
                <textarea
                  className="w-full h-24 rounded-md border px-3 py-2 text-sm"
                  value={decisao}
                  onChange={(e) => setDecisao(e.target.value)}
                  placeholder="Ex.: Confirmado uso pessoal — sem direito a crédito conforme art. X..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  A decisão fica registrada para auditoria.
                </p>
              </div>
            </>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDlgOpen(false)}>Cancelar</Button>
          <Button onClick={resolver} disabled={!decisao.trim()}>Marcar como resolvida</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function CardSev({ label, qtd, cor, icon, subtitle }: {
  label: string;
  qtd: number;
  cor: "success" | "warning" | "destructive";
  icon: React.ReactNode;
  subtitle: string;
}) {
  const corBg =
    cor === "success" ? "border-green-200 bg-green-50" :
    cor === "warning" ? "border-amber-200 bg-amber-50" :
    "border-red-200 bg-red-50";
  return (
    <div className={`rounded-lg border p-4 ${corBg}`}>
      <div className="flex items-center gap-2 text-xs">
        {icon} <span className="uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="mt-2 text-3xl font-bold">{qtd}</div>
      <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
    </div>
  );
}
