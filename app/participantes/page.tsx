"use client";
import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { listParticipantes, upsertParticipante, deleteParticipante } from "@/lib/storage";
import { useApp } from "@/lib/app-context";
import type { Participante, RegimeTributario, CRT, TipoParticipante } from "@/types";
import { Users, Plus, Trash2, Edit, Download } from "lucide-react";
import { ALIQUOTAS_BASE_UF } from "@/lib/aliquotas";

export default function ParticipantesPage() {
  const { toast } = useToast();
  const { empresa } = useApp();
  const [list, setList] = useState<Participante[]>([]);
  const [search, setSearch] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [filtroOrigem, setFiltroOrigem] = useState<string>("");
  const [dlgOpen, setDlgOpen] = useState(false);
  const [edit, setEdit] = useState<Partial<Participante>>({});
  const [loading, setLoading] = useState(true);

  async function reload() {
    if (!empresa) return;
    setLoading(true);
    setList(await listParticipantes(empresa.id));
    setLoading(false);
  }
  useEffect(() => { reload(); }, [empresa?.id]);

  const filtered = useMemo(() => {
    return list.filter((p) => {
      if (filtroTipo && p.tipo !== filtroTipo) return false;
      if (filtroOrigem && p.origem !== filtroOrigem) return false;
      if (search) {
        const s = search.toLowerCase();
        return [p.cnpj, p.razao_social, p.nome_fantasia, p.uf].some((v) =>
          (v ?? "").toString().toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [list, search, filtroTipo, filtroOrigem]);

  function abrirNovo() {
    setEdit({
      empresa_id: empresa?.id ?? "",
      cnpj: "",
      tipo: "fornecedor",
      origem: "manual",
      ativo: true,
    });
    setDlgOpen(true);
  }
  function abrirEdit(p: Participante) {
    setEdit({ ...p });
    setDlgOpen(true);
  }

  async function salvar() {
    if (!empresa || !edit.cnpj) {
      toast({ type: "error", title: "Informe CNPJ" });
      return;
    }
    try {
      await upsertParticipante({
        ...(edit as Participante),
        empresa_id: empresa.id,
        ativo: edit.ativo ?? true,
        tipo: (edit.tipo as TipoParticipante) ?? "fornecedor",
        origem: edit.origem ?? "manual",
      } as any);
      toast({ type: "success", title: "Participante salvo" });
      setDlgOpen(false);
      reload();
    } catch (e) {
      toast({ type: "error", title: "Erro", description: String((e as Error).message) });
    }
  }

  async function remover(id: string) {
    if (!confirm("Excluir participante?")) return;
    await deleteParticipante(id);
    reload();
  }

  function exportarCSV() {
    const header = ["CNPJ", "Razão", "Fantasia", "Tipo", "Regime", "CRT", "UF", "Município", "Origem"];
    const rows = filtered.map((p) => [
      p.cnpj, p.razao_social ?? "", p.nome_fantasia ?? "",
      p.tipo, p.regime_tributario ?? "", p.crt ?? "",
      p.uf ?? "", p.municipio ?? "", p.origem,
    ]);
    const csv = "\ufeff" + [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "participantes.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (!empresa) return <div>Selecione/cadastre uma empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" /> Participantes
          </h1>
          <p className="text-sm text-muted-foreground">
            Clientes e fornecedores. Cadastrados automaticamente ao importar XMLs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarCSV}><Download className="h-4 w-4" /> CSV</Button>
          <Button onClick={abrirNovo}><Plus className="h-4 w-4" /> Novo</Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-5">
          <Input placeholder="Buscar (CNPJ, razão, fantasia)" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            <option value="cliente">Cliente</option>
            <option value="fornecedor">Fornecedor</option>
            <option value="ambos">Ambos</option>
          </Select>
          <Select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)}>
            <option value="">Toda origem</option>
            <option value="auto_xml">Auto (XML)</option>
            <option value="manual">Manual</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{filtered.length} participante(s)</CardTitle>
          <CardDescription>{empresa.razao_social}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <p>Carregando...</p> : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum participante. Importe XMLs ou cadastre manualmente.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>CNPJ</TH>
                  <TH>Razão</TH>
                  <TH>Tipo</TH>
                  <TH>Regime</TH>
                  <TH>CRT</TH>
                  <TH>UF</TH>
                  <TH>Origem</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs">{p.cnpj}</TD>
                    <TD className="text-xs max-w-[220px] truncate" title={p.razao_social ?? ""}>{p.razao_social}</TD>
                    <TD><Badge variant="secondary">{p.tipo}</Badge></TD>
                    <TD className="text-xs">{p.regime_tributario ?? "—"}</TD>
                    <TD className="text-xs">{p.crt ?? "—"}</TD>
                    <TD className="text-xs">{p.uf ?? "—"}</TD>
                    <TD>
                      <Badge variant={p.origem === "auto_xml" ? "info" : "outline"}>{p.origem === "auto_xml" ? "auto" : "manual"}</Badge>
                    </TD>
                    <TD className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => abrirEdit(p)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remover(p.id)}><Trash2 className="h-4 w-4" /></Button>
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
          <DialogTitle>{edit.id ? "Editar" : "Novo"} participante</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>CNPJ *</Label>
              <Input value={edit.cnpj ?? ""} onChange={(e) => setEdit({ ...edit, cnpj: e.target.value })} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={edit.tipo ?? "fornecedor"} onChange={(e) => setEdit({ ...edit, tipo: e.target.value as TipoParticipante })}>
                <option value="cliente">Cliente</option>
                <option value="fornecedor">Fornecedor</option>
                <option value="ambos">Ambos</option>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Razão Social</Label>
              <Input value={edit.razao_social ?? ""} onChange={(e) => setEdit({ ...edit, razao_social: e.target.value })} />
            </div>
            <div>
              <Label>Nome Fantasia</Label>
              <Input value={edit.nome_fantasia ?? ""} onChange={(e) => setEdit({ ...edit, nome_fantasia: e.target.value })} />
            </div>
            <div>
              <Label>UF</Label>
              <Select value={edit.uf ?? ""} onChange={(e) => setEdit({ ...edit, uf: e.target.value })}>
                <option value="">—</option>
                {ALIQUOTAS_BASE_UF.map((u) => <option key={u.uf} value={u.uf}>{u.uf}</option>)}
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Município</Label>
              <Input value={edit.municipio ?? ""} onChange={(e) => setEdit({ ...edit, municipio: e.target.value })} />
            </div>
            <div>
              <Label>Inscrição Estadual</Label>
              <Input value={edit.inscricao_estadual ?? ""} onChange={(e) => setEdit({ ...edit, inscricao_estadual: e.target.value })} />
            </div>
            <div>
              <Label>Inscrição Municipal</Label>
              <Input value={edit.inscricao_municipal ?? ""} onChange={(e) => setEdit({ ...edit, inscricao_municipal: e.target.value })} />
            </div>
            <div>
              <Label>Regime</Label>
              <Select value={edit.regime_tributario ?? ""} onChange={(e) => setEdit({ ...edit, regime_tributario: e.target.value as RegimeTributario })}>
                <option value="">—</option>
                <option value="LUCRO_REAL">Lucro Real</option>
                <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
                <option value="SIMPLES_NACIONAL">Simples Nacional</option>
                <option value="MEI">MEI</option>
              </Select>
            </div>
            <div>
              <Label>CRT</Label>
              <Select value={edit.crt ?? ""} onChange={(e) => setEdit({ ...edit, crt: e.target.value as CRT })}>
                <option value="">—</option>
                <option value="1">1 — SN</option>
                <option value="2">2 — SN excesso</option>
                <option value="3">3 — Normal</option>
              </Select>
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={edit.telefone ?? ""} onChange={(e) => setEdit({ ...edit, telefone: e.target.value })} />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDlgOpen(false)}>Cancelar</Button>
          <Button onClick={salvar}>Salvar</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
