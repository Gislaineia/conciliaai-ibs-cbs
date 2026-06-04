"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  getEmpresa, listObrigacoes, saveObrigacao, updateObrigacao,
} from "@/lib/storage";
import type { Empresa, ObrigacaoAcessoria, RegimeTributario, StatusObrigacao } from "@/types";
import { CalendarCheck, Plus } from "lucide-react";

const TIPOS_POR_REGIME: Record<RegimeTributario, string[]> = {
  LUCRO_REAL: ["EFD_ICMS_IPI", "EFD_CONTRIBUICOES", "DCTF_WEB", "DECLAN_IBS", "GIA", "SINTEGRA"],
  LUCRO_PRESUMIDO: ["EFD_ICMS_IPI", "EFD_CONTRIBUICOES", "DCTF_WEB", "DECLAN_IBS", "GIA", "SINTEGRA"],
  SIMPLES_NACIONAL: ["DAS"],
  MEI: ["DAS_MEI"],
};

export default function ObrigacoesPage() {
  const { toast } = useToast();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [obrigacoes, setObrigacoes] = useState<ObrigacaoAcessoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [novaObr, setNovaObr] = useState({
    tipo: "EFD_ICMS_IPI",
    periodo: new Date().toISOString().substring(0, 7),
    data_vencimento: "",
    observacao: "",
  });

  async function reload() {
    setLoading(true);
    const e = await getEmpresa();
    setEmpresa(e);
    if (e) setObrigacoes(await listObrigacoes(e.id));
    setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  async function adicionar() {
    if (!empresa) return;
    if (!novaObr.data_vencimento) {
      toast({ type: "error", title: "Informe o vencimento" });
      return;
    }
    await saveObrigacao({
      empresa_id: empresa.id,
      tipo: novaObr.tipo,
      periodo: novaObr.periodo,
      data_vencimento: novaObr.data_vencimento,
      status: "pendente",
      observacao: novaObr.observacao || null,
    });
    toast({ type: "success", title: "Obrigação adicionada" });
    setDlgOpen(false);
    reload();
  }

  async function alterarStatus(o: ObrigacaoAcessoria, novo: StatusObrigacao) {
    await updateObrigacao(o.id, { status: novo });
    reload();
  }

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;
  if (!empresa) return <div>Cadastre a empresa.</div>;

  const hoje = new Date();
  const proximas = obrigacoes.filter((o) => {
    if (o.status !== "pendente") return false;
    const venc = new Date(o.data_vencimento);
    const diff = (venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  });

  const tiposDisponiveis = TIPOS_POR_REGIME[empresa.regime_tributario] ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Obrigações Acessórias</h1>
          <p className="text-sm text-muted-foreground">
            Calendário fiscal — regime {empresa.regime_tributario.replace(/_/g, " ")}.
          </p>
        </div>
        <Button onClick={() => setDlgOpen(true)}>
          <Plus className="h-4 w-4" /> Nova obrigação
        </Button>
      </div>

      {proximas.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-5">
            <div className="text-sm font-medium text-amber-900">
              {proximas.length} obrigação(ões) vencem nos próximos 7 dias.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4" /> Calendário ({obrigacoes.length})
          </CardTitle>
          <CardDescription>Atualize o status à medida que entrega cada obrigação.</CardDescription>
        </CardHeader>
        <CardContent>
          {obrigacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma obrigação cadastrada.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Tipo</TH>
                  <TH>Período</TH>
                  <TH>Vencimento</TH>
                  <TH>Status</TH>
                  <TH>Observação</TH>
                  <TH>Alterar</TH>
                </TR>
              </THead>
              <TBody>
                {obrigacoes.map((o) => (
                  <TR key={o.id}>
                    <TD className="font-medium">{o.tipo}</TD>
                    <TD>{o.periodo}</TD>
                    <TD>{new Date(o.data_vencimento).toLocaleDateString("pt-BR")}</TD>
                    <TD>
                      <Badge variant={
                        o.status === "entregue" ? "success" :
                        o.status === "atrasada" ? "destructive" :
                        o.status === "em_preparo" ? "info" : "warning"
                      }>{o.status}</Badge>
                    </TD>
                    <TD className="text-xs max-w-[200px] truncate">{o.observacao}</TD>
                    <TD>
                      <Select
                        value={o.status}
                        onChange={(e) => alterarStatus(o, e.target.value as StatusObrigacao)}
                        className="h-8 w-32 text-xs"
                      >
                        <option value="pendente">pendente</option>
                        <option value="em_preparo">em preparo</option>
                        <option value="entregue">entregue</option>
                        <option value="atrasada">atrasada</option>
                      </Select>
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
          <DialogTitle>Nova obrigação</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={novaObr.tipo} onChange={(e) => setNovaObr({ ...novaObr, tipo: e.target.value })}>
              {tiposDisponiveis.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <Label>Período (YYYY-MM)</Label>
            <Input
              type="month"
              value={novaObr.periodo}
              onChange={(e) => setNovaObr({ ...novaObr, periodo: e.target.value })}
            />
          </div>
          <div>
            <Label>Data de vencimento</Label>
            <Input
              type="date"
              value={novaObr.data_vencimento}
              onChange={(e) => setNovaObr({ ...novaObr, data_vencimento: e.target.value })}
            />
          </div>
          <div>
            <Label>Observação</Label>
            <Input
              value={novaObr.observacao}
              onChange={(e) => setNovaObr({ ...novaObr, observacao: e.target.value })}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDlgOpen(false)}>Cancelar</Button>
          <Button onClick={adicionar}>Salvar</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
