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
  getEmpresa, listRegras, saveRegra, updateRegra, deleteRegra,
} from "@/lib/storage";
import type { Empresa, RegraClassificacao, NaturezaOperacao } from "@/types";
import { Settings2, Plus, Trash2, Power, PowerOff } from "lucide-react";
import { CSTS_ENTRADA, CSTS_CBS_SAIDA, NATUREZAS_OPERACAO } from "@/lib/aliquotas";

export default function RegrasPage() {
  const { toast } = useToast();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [regras, setRegras] = useState<RegraClassificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [form, setForm] = useState({
    descricao: "",
    ncm_prefixo: "",
    cfop: "",
    uf_emitente: "",
    direcao: "" as "ENTRADA" | "SAIDA" | "",
    crt_emitente: "" as "1" | "2" | "3" | "",
    cst_cbs_destino: "",
    cst_ibs_destino: "",
    natureza_destino: "" as NaturezaOperacao | "",
    gera_credito: true,
    motivo_vedacao: "",
    prioridade: 100,
  });

  async function reload() {
    setLoading(true);
    const e = await getEmpresa();
    setEmpresa(e);
    if (e) setRegras(await listRegras(e.id));
    setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  async function salvar() {
    if (!empresa) return;
    await saveRegra({
      empresa_id: empresa.id,
      descricao: form.descricao || null,
      ncm_prefixo: form.ncm_prefixo || null,
      cfop: form.cfop || null,
      uf_emitente: form.uf_emitente || null,
      cnpj_emitente: null,
      direcao: form.direcao || null,
      crt_emitente: form.crt_emitente || null,
      natureza_contem: null,
      cst_cbs_destino: form.cst_cbs_destino || null,
      cst_ibs_destino: form.cst_ibs_destino || null,
      natureza_destino: form.natureza_destino || null,
      gera_credito: form.gera_credito,
      motivo_vedacao: form.motivo_vedacao || null,
      origem: "manual",
      prioridade: form.prioridade,
      ativa: true,
      aplicacoes: 0,
    });
    toast({ type: "success", title: "Regra criada" });
    setDlgOpen(false);
    reload();
  }

  async function toggleAtiva(r: RegraClassificacao) {
    await updateRegra(r.id, { ativa: !r.ativa });
    reload();
  }
  async function remover(r: RegraClassificacao) {
    if (!confirm("Excluir regra?")) return;
    await deleteRegra(r.id);
    reload();
  }

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;
  if (!empresa) return <div>Cadastre a empresa.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Motor de Regras</h1>
          <p className="text-sm text-muted-foreground">
            Regras de classificação automática para itens. Aplicadas em ordem de prioridade.
          </p>
        </div>
        <Button onClick={() => setDlgOpen(true)}><Plus className="h-4 w-4" /> Nova regra</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Regras ({regras.length})</CardTitle>
          <CardDescription>Quanto menor o número da prioridade, mais cedo é avaliada.</CardDescription>
        </CardHeader>
        <CardContent>
          {regras.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma regra cadastrada.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Prio</TH>
                  <TH>Descrição</TH>
                  <TH>NCM</TH>
                  <TH>CFOP</TH>
                  <TH>UF</TH>
                  <TH>CRT</TH>
                  <TH>CST CBS/IBS</TH>
                  <TH>Natureza</TH>
                  <TH>Crédito</TH>
                  <TH>Origem</TH>
                  <TH>Apl.</TH>
                  <TH>Status</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {regras.map((r) => (
                  <TR key={r.id} className={!r.ativa ? "opacity-60" : ""}>
                    <TD className="font-mono">{r.prioridade}</TD>
                    <TD className="text-xs max-w-[180px] truncate">{r.descricao}</TD>
                    <TD className="text-xs">{r.ncm_prefixo}</TD>
                    <TD className="text-xs">{r.cfop}</TD>
                    <TD className="text-xs">{r.uf_emitente}</TD>
                    <TD className="text-xs">{r.crt_emitente}</TD>
                    <TD className="text-xs">{r.cst_cbs_destino}/{r.cst_ibs_destino}</TD>
                    <TD className="text-xs">{r.natureza_destino}</TD>
                    <TD>{r.gera_credito ? <Badge variant="success">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TD>
                    <TD><Badge variant="outline">{r.origem}</Badge></TD>
                    <TD>{r.aplicacoes}</TD>
                    <TD>{r.ativa ? <Badge variant="success">ativa</Badge> : <Badge variant="outline">inativa</Badge>}</TD>
                    <TD className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => toggleAtiva(r)}>
                        {r.ativa ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remover(r)}>
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

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogHeader>
          <DialogTitle>Nova regra de classificação</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div>
            <Label>Descrição</Label>
            <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>NCM (prefixo)</Label>
              <Input value={form.ncm_prefixo} onChange={(e) => setForm({ ...form, ncm_prefixo: e.target.value })} placeholder="ex: 2710" />
            </div>
            <div>
              <Label>CFOP</Label>
              <Input value={form.cfop} onChange={(e) => setForm({ ...form, cfop: e.target.value })} maxLength={4} />
            </div>
            <div>
              <Label>UF emitente</Label>
              <Input value={form.uf_emitente} onChange={(e) => setForm({ ...form, uf_emitente: e.target.value.toUpperCase() })} maxLength={2} />
            </div>
            <div>
              <Label>Direção</Label>
              <Select value={form.direcao} onChange={(e) => setForm({ ...form, direcao: e.target.value as any })}>
                <option value="">Qualquer</option>
                <option value="ENTRADA">Entrada</option>
                <option value="SAIDA">Saída</option>
              </Select>
            </div>
            <div>
              <Label>CRT emitente</Label>
              <Select value={form.crt_emitente} onChange={(e) => setForm({ ...form, crt_emitente: e.target.value as any })}>
                <option value="">Qualquer</option>
                <option value="1">1 SN</option>
                <option value="2">2 SN excesso</option>
                <option value="3">3 Normal</option>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Input type="number" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: Number(e.target.value) })} />
            </div>
          </div>
          <hr />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>CST CBS</Label>
              <Select value={form.cst_cbs_destino} onChange={(e) => setForm({ ...form, cst_cbs_destino: e.target.value })}>
                <option value="">—</option>
                {[...CSTS_ENTRADA, ...CSTS_CBS_SAIDA].map((c) => <option key={c.cst} value={c.cst}>{c.cst}</option>)}
              </Select>
            </div>
            <div>
              <Label>CST IBS</Label>
              <Select value={form.cst_ibs_destino} onChange={(e) => setForm({ ...form, cst_ibs_destino: e.target.value })}>
                <option value="">—</option>
                {[...CSTS_ENTRADA, ...CSTS_CBS_SAIDA].map((c) => <option key={c.cst} value={c.cst}>{c.cst}</option>)}
              </Select>
            </div>
            <div>
              <Label>Natureza</Label>
              <Select value={form.natureza_destino} onChange={(e) => setForm({ ...form, natureza_destino: e.target.value as any })}>
                <option value="">—</option>
                {NATUREZAS_OPERACAO.map((n) => <option key={n.codigo} value={n.codigo}>{n.codigo}</option>)}
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input id="cred" type="checkbox" checked={form.gera_credito} onChange={(e) => setForm({ ...form, gera_credito: e.target.checked })} />
            <Label htmlFor="cred" className="mb-0 cursor-pointer">Gera crédito</Label>
          </div>
          {!form.gera_credito && (
            <div>
              <Label>Motivo da vedação</Label>
              <Input value={form.motivo_vedacao} onChange={(e) => setForm({ ...form, motivo_vedacao: e.target.value })} />
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDlgOpen(false)}>Cancelar</Button>
          <Button onClick={salvar}>Criar regra</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
