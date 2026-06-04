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
import { listProdutos, upsertProduto, deleteProduto } from "@/lib/storage";
import { useApp } from "@/lib/app-context";
import type { Produto, TipoUsoProduto } from "@/types";
import { Package, Plus, Trash2, Edit, Download } from "lucide-react";

const TIPOS_USO: Array<{ value: TipoUsoProduto; label: string; cred: boolean }> = [
  { value: "REVENDA", label: "Revenda", cred: true },
  { value: "INSUMO", label: "Insumo (matéria-prima)", cred: true },
  { value: "USO_CONSUMO", label: "Uso e consumo", cred: true },
  { value: "ATIVO_IMOB", label: "Ativo imobilizado", cred: true },
  { value: "SERVICO", label: "Serviço", cred: true },
  { value: "USO_PESSOAL", label: "Uso pessoal", cred: false },
  { value: "BENEFICIO_RH", label: "Benefício RH", cred: false },
];

export default function ProdutosPage() {
  const { toast } = useToast();
  const { empresa } = useApp();
  const [list, setList] = useState<Produto[]>([]);
  const [search, setSearch] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [dlgOpen, setDlgOpen] = useState(false);
  const [edit, setEdit] = useState<Partial<Produto>>({});
  const [loading, setLoading] = useState(true);

  async function reload() {
    if (!empresa) return;
    setLoading(true);
    setList(await listProdutos(empresa.id));
    setLoading(false);
  }
  useEffect(() => { reload(); }, [empresa?.id]);

  const filtered = useMemo(() => {
    return list.filter((p) => {
      if (filtroTipo && p.tipo_uso !== filtroTipo) return false;
      if (search) {
        const s = search.toLowerCase();
        return [p.codigo, p.descricao, p.ncm].some((v) =>
          (v ?? "").toString().toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [list, search, filtroTipo]);

  function abrirNovo() {
    setEdit({
      empresa_id: empresa?.id ?? "",
      codigo: "",
      descricao: "",
      tipo_uso: "REVENDA",
      origem: "manual",
      ativo: true,
      aliquota_cbs_padrao: empresa?.aliquota_cbs ?? 8.8,
      aliquota_ibs_estadual_padrao: empresa?.aliquota_ibs_estadual ?? 17.7,
      aliquota_ibs_municipal_padrao: empresa?.aliquota_ibs_municipal ?? 8.8,
      gera_credito_padrao: true,
    });
    setDlgOpen(true);
  }
  function abrirEdit(p: Produto) {
    setEdit({ ...p });
    setDlgOpen(true);
  }

  async function salvar() {
    if (!empresa || !edit.codigo || !edit.descricao) {
      toast({ type: "error", title: "Informe código e descrição" });
      return;
    }
    try {
      await upsertProduto({
        ...(edit as Produto),
        empresa_id: empresa.id,
      } as any);
      toast({ type: "success", title: "Produto salvo" });
      setDlgOpen(false);
      reload();
    } catch (e) {
      toast({ type: "error", title: "Erro", description: String((e as Error).message) });
    }
  }

  async function remover(id: string) {
    if (!confirm("Excluir produto?")) return;
    await deleteProduto(id);
    reload();
  }

  function exportarCSV() {
    const header = ["Código", "Descrição", "NCM", "Tipo Uso", "Aliq.CBS", "Aliq.IBS Est.", "Aliq.IBS Mun.", "Gera Crédito", "Origem"];
    const rows = filtered.map((p) => [
      p.codigo, p.descricao, p.ncm ?? "", p.tipo_uso,
      p.aliquota_cbs_padrao, p.aliquota_ibs_estadual_padrao, p.aliquota_ibs_municipal_padrao,
      p.gera_credito_padrao ? "Sim" : "Não", p.origem,
    ]);
    const csv = "\ufeff" + [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "produtos.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (!empresa) return <div>Selecione uma empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6" /> Produtos
          </h1>
          <p className="text-sm text-muted-foreground">
            Catálogo NCM com diferenciação por tipo de uso. Cadastrados automaticamente ao importar XMLs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarCSV}><Download className="h-4 w-4" /> CSV</Button>
          <Button onClick={abrirNovo}><Plus className="h-4 w-4" /> Novo</Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-5">
          <Input placeholder="Buscar (código, descrição, NCM)" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {TIPOS_USO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{filtered.length} produto(s)</CardTitle>
          <CardDescription>{empresa.razao_social}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <p>Carregando...</p> : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto. Importe XMLs ou cadastre manualmente.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Código</TH>
                  <TH>Descrição</TH>
                  <TH>NCM</TH>
                  <TH>Tipo Uso</TH>
                  <TH className="text-right">Aliq. CBS</TH>
                  <TH className="text-right">Aliq. IBS</TH>
                  <TH>Crédito</TH>
                  <TH>Origem</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs">{p.codigo}</TD>
                    <TD className="text-xs max-w-[260px] truncate" title={p.descricao}>{p.descricao}</TD>
                    <TD className="text-xs">{p.ncm}</TD>
                    <TD>
                      <Badge variant={p.tipo_uso === "USO_PESSOAL" || p.tipo_uso === "BENEFICIO_RH" ? "destructive" : "secondary"}>
                        {p.tipo_uso}
                      </Badge>
                    </TD>
                    <TD className="text-right text-xs">{p.aliquota_cbs_padrao}%</TD>
                    <TD className="text-right text-xs">{(p.aliquota_ibs_estadual_padrao + p.aliquota_ibs_municipal_padrao).toFixed(2)}%</TD>
                    <TD>{p.gera_credito_padrao ? <Badge variant="success">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TD>
                    <TD><Badge variant={p.origem === "auto_xml" ? "info" : "outline"}>{p.origem === "auto_xml" ? "auto" : "manual"}</Badge></TD>
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
          <DialogTitle>{edit.id ? "Editar" : "Novo"} produto</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Código *</Label>
              <Input value={edit.codigo ?? ""} onChange={(e) => setEdit({ ...edit, codigo: e.target.value })} />
            </div>
            <div>
              <Label>NCM</Label>
              <Input value={edit.ncm ?? ""} onChange={(e) => setEdit({ ...edit, ncm: e.target.value })} maxLength={8} />
            </div>
            <div className="col-span-2">
              <Label>Descrição *</Label>
              <Input value={edit.descricao ?? ""} onChange={(e) => setEdit({ ...edit, descricao: e.target.value })} />
            </div>
            <div>
              <Label>Tipo Uso</Label>
              <Select value={edit.tipo_uso ?? "REVENDA"} onChange={(e) => {
                const t = e.target.value as TipoUsoProduto;
                const tipo = TIPOS_USO.find((x) => x.value === t);
                setEdit({ ...edit, tipo_uso: t, gera_credito_padrao: tipo?.cred ?? true });
              }}>
                {TIPOS_USO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Input value={edit.unidade ?? ""} onChange={(e) => setEdit({ ...edit, unidade: e.target.value })} placeholder="UN, KG, ..." />
            </div>
            <div>
              <Label>CFOP padrão entrada</Label>
              <Input value={edit.cfop_padrao_entrada ?? ""} onChange={(e) => setEdit({ ...edit, cfop_padrao_entrada: e.target.value })} maxLength={4} />
            </div>
            <div>
              <Label>CFOP padrão saída</Label>
              <Input value={edit.cfop_padrao_saida ?? ""} onChange={(e) => setEdit({ ...edit, cfop_padrao_saida: e.target.value })} maxLength={4} />
            </div>
            <div>
              <Label>Aliq. CBS (%)</Label>
              <Input type="number" step="0.01" value={edit.aliquota_cbs_padrao ?? 0} onChange={(e) => setEdit({ ...edit, aliquota_cbs_padrao: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Aliq. IBS Estadual (%)</Label>
              <Input type="number" step="0.01" value={edit.aliquota_ibs_estadual_padrao ?? 0} onChange={(e) => setEdit({ ...edit, aliquota_ibs_estadual_padrao: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Aliq. IBS Municipal (%)</Label>
              <Input type="number" step="0.01" value={edit.aliquota_ibs_municipal_padrao ?? 0} onChange={(e) => setEdit({ ...edit, aliquota_ibs_municipal_padrao: Number(e.target.value) })} />
            </div>
            <div className="flex items-end gap-2">
              <input type="checkbox" id="cred" checked={edit.gera_credito_padrao ?? true} onChange={(e) => setEdit({ ...edit, gera_credito_padrao: e.target.checked })} />
              <Label htmlFor="cred" className="mb-0 cursor-pointer">Gera crédito por padrão</Label>
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
