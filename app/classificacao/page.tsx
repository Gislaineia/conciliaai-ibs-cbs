"use client";
import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  getEmpresa,
  listAllItens,
  listDocumentos,
  listRegras,
  saveRegra,
  updateItem,
} from "@/lib/storage";
import { CSTS_ENTRADA, CSTS_CBS_SAIDA, NATUREZAS_OPERACAO } from "@/lib/aliquotas";
import { classificarItem, calcularValoresIbsCbs } from "@/lib/classificador";
import { getPercentualTransicao } from "@/lib/transicao";
import type { Empresa, Documento, ItemDocumento, RegraClassificacao, NaturezaOperacao } from "@/types";
import { formatBRL, formatPercent } from "@/lib/utils";
import { Wand2, Save, Layers } from "lucide-react";

interface ItemComContexto {
  item: ItemDocumento;
  documento: Documento;
}

export default function ClassificacaoPage() {
  const { toast } = useToast();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [itens, setItens] = useState<ItemDocumento[]>([]);
  const [regras, setRegras] = useState<RegraClassificacao[]>([]);
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("pendente");
  const [filtroDirecao, setFiltroDirecao] = useState<string>("");
  const [filtroCRT, setFiltroCRT] = useState<string>("");
  const [selecionado, setSelecionado] = useState<ItemComContexto | null>(null);
  const [loading, setLoading] = useState(true);

  // form de edição
  const [edicao, setEdicao] = useState({
    natureza_operacao: "" as NaturezaOperacao | "",
    cst_cbs: "",
    cst_ibs: "",
    aliquota_cbs: 0,
    aliquota_ibs_estadual: 0,
    aliquota_ibs_municipal: 0,
    gera_credito: false,
    motivo_vedacao: "",
  });

  async function reload() {
    setLoading(true);
    const e = await getEmpresa();
    setEmpresa(e);
    setDocs(await listDocumentos());
    setItens(await listAllItens());
    if (e) setRegras(await listRegras(e.id));
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  const itensComCtx: ItemComContexto[] = useMemo(() => {
    return itens
      .map((i) => {
        const d = docs.find((x) => x.id === i.documento_id);
        return d ? { item: i, documento: d } : null;
      })
      .filter((x): x is ItemComContexto => !!x);
  }, [itens, docs]);

  const filtrados = useMemo(() => {
    return itensComCtx.filter(({ item, documento }) => {
      if (filtroStatus && item.status_item !== filtroStatus) return false;
      if (filtroDirecao && documento.direcao !== filtroDirecao) return false;
      if (filtroCRT && documento.crt_emitente !== filtroCRT) return false;
      if (search) {
        const s = search.toLowerCase();
        return [item.descricao, item.ncm, documento.razao_emitente]
          .some((v) => (v ?? "").toString().toLowerCase().includes(s));
      }
      return true;
    });
  }, [itensComCtx, filtroStatus, filtroDirecao, filtroCRT, search]);

  function selecionar(ic: ItemComContexto) {
    setSelecionado(ic);
    setEdicao({
      natureza_operacao: ic.item.natureza_operacao ?? "",
      cst_cbs: ic.item.cst_cbs ?? "",
      cst_ibs: ic.item.cst_ibs ?? "",
      aliquota_cbs: ic.item.aliquota_cbs,
      aliquota_ibs_estadual: ic.item.aliquota_ibs_estadual,
      aliquota_ibs_municipal: ic.item.aliquota_ibs_municipal,
      gera_credito: ic.item.gera_credito,
      motivo_vedacao: ic.item.motivo_vedacao_credito ?? "",
    });
  }

  function aplicarSugestao() {
    if (!selecionado || !empresa) return;
    const s = classificarItem(empresa, selecionado.documento, selecionado.item, regras);
    setEdicao({
      natureza_operacao: s.natureza_operacao ?? "",
      cst_cbs: s.cst_cbs ?? "",
      cst_ibs: s.cst_ibs ?? "",
      aliquota_cbs: empresa.aliquota_cbs,
      aliquota_ibs_estadual: empresa.aliquota_ibs_estadual,
      aliquota_ibs_municipal: empresa.aliquota_ibs_municipal,
      gera_credito: s.gera_credito,
      motivo_vedacao: s.motivo_vedacao ?? "",
    });
    toast({ type: "info", title: "Sugestão aplicada", description: `Fonte: ${s.fonte} (${Math.round(s.confianca * 100)}%)` });
  }

  async function salvar(criarRegra: boolean) {
    if (!selecionado || !empresa) return;
    const fase = getPercentualTransicao(empresa.ano_vigencia_aliquota);

    const updated = {
      natureza_operacao: edicao.natureza_operacao || null,
      cst_cbs: edicao.cst_cbs || null,
      cst_ibs: edicao.cst_ibs || null,
      aliquota_cbs: edicao.aliquota_cbs,
      aliquota_ibs_estadual: edicao.aliquota_ibs_estadual,
      aliquota_ibs_municipal: edicao.aliquota_ibs_municipal,
      gera_credito: edicao.gera_credito,
      motivo_vedacao_credito: edicao.motivo_vedacao || null,
      classificado_por: "manual" as const,
      status_item: "classificado" as const,
    };

    // recalcula valores
    const calc = calcularValoresIbsCbs(
      { ...selecionado.item, ...updated, tipo_calculo_credito: "destacado" },
      empresa,
      fase
    );

    const fullUpdate: Partial<ItemDocumento> = {
      ...updated,
      valor_cbs_ofertado: calc.valor_cbs_ofertado,
      valor_ibs_est_ofertado: calc.valor_ibs_est_ofertado,
      valor_ibs_mun_ofertado: calc.valor_ibs_mun_ofertado,
      base_calculo_cbs: calc.base_calculo_cbs,
      base_calculo_ibs: calc.base_calculo_ibs,
      valor_credito_cbs: edicao.gera_credito ? calc.valor_cbs_ofertado : 0,
      valor_credito_ibs_est: edicao.gera_credito ? calc.valor_ibs_est_ofertado : 0,
      valor_credito_ibs_mun: edicao.gera_credito ? calc.valor_ibs_mun_ofertado : 0,
    };

    try {
      await updateItem(selecionado.item.id, fullUpdate);
      if (criarRegra) {
        await saveRegra({
          empresa_id: empresa.id,
          descricao: `Auto: NCM ${selecionado.item.ncm ?? "—"} CFOP ${selecionado.item.cfop ?? "—"}`,
          ncm_prefixo: selecionado.item.ncm ?? null,
          cfop: selecionado.item.cfop ?? null,
          uf_emitente: selecionado.documento.uf_emitente ?? null,
          cnpj_emitente: null,
          direcao: selecionado.documento.direcao,
          crt_emitente: selecionado.documento.crt_emitente ?? null,
          natureza_contem: null,
          cst_cbs_destino: edicao.cst_cbs || null,
          cst_ibs_destino: edicao.cst_ibs || null,
          natureza_destino: (edicao.natureza_operacao as NaturezaOperacao) || null,
          gera_credito: edicao.gera_credito,
          motivo_vedacao: edicao.motivo_vedacao || null,
          origem: "manual",
          prioridade: 50,
          ativa: true,
          aplicacoes: 0,
        });
      }
      toast({ type: "success", title: "Item classificado" });
      await reload();
      setSelecionado(null);
    } catch (e) {
      toast({ type: "error", title: "Erro ao salvar", description: String((e as Error).message) });
    }
  }

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;
  if (!empresa) return <div>Cadastre a empresa primeiro.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Classificação IBS/CBS</h1>
        <p className="text-sm text-muted-foreground">
          Defina natureza, CST e crédito por item. Crie regras para automatizar próximos itens semelhantes.
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-5">
          <Input placeholder="Buscar (descrição, NCM, emitente)" value={search} onChange={(e) => setSearch(e.target.value)} className="md:col-span-2" />
          <Select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos status</option>
            <option value="pendente">Pendente</option>
            <option value="classificado">Classificado</option>
            <option value="critico">Crítico</option>
          </Select>
          <Select value={filtroDirecao} onChange={(e) => setFiltroDirecao(e.target.value)}>
            <option value="">Todas direções</option>
            <option value="ENTRADA">Entradas</option>
            <option value="SAIDA">Saídas</option>
          </Select>
          <Select value={filtroCRT} onChange={(e) => setFiltroCRT(e.target.value)}>
            <option value="">Todos CRT</option>
            <option value="1">CRT 1 — SN</option>
            <option value="2">CRT 2 — SN excesso</option>
            <option value="3">CRT 3 — Normal</option>
          </Select>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4" /> {filtrados.length} item(ns)
            </CardTitle>
            <CardDescription>Clique em um item para classificar</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Status</TH>
                  <TH>Direção</TH>
                  <TH>Descrição</TH>
                  <TH>NCM</TH>
                  <TH>CFOP</TH>
                  <TH>Emitente / CRT</TH>
                  <TH className="text-right">Valor</TH>
                </TR>
              </THead>
              <TBody>
                {filtrados.slice(0, 200).map(({ item, documento }) => {
                  const isSel = selecionado?.item.id === item.id;
                  return (
                    <TR
                      key={item.id}
                      onClick={() => selecionar({ item, documento })}
                      className={`cursor-pointer ${isSel ? "bg-primary/10" : ""}`}
                    >
                      <TD>
                        <Badge variant={
                          item.status_item === "classificado" ? "success" :
                          item.status_item === "critico" ? "destructive" : "warning"
                        }>{item.status_item}</Badge>
                      </TD>
                      <TD><Badge variant="outline">{documento.direcao}</Badge></TD>
                      <TD className="text-xs max-w-[200px] truncate" title={item.descricao}>{item.descricao}</TD>
                      <TD className="text-xs">{item.ncm}</TD>
                      <TD className="text-xs">{item.cfop}</TD>
                      <TD className="text-xs">
                        <div className="max-w-[140px] truncate">{documento.razao_emitente}</div>
                        <Badge variant="outline" className="text-[10px]">CRT {documento.crt_emitente ?? "—"}</Badge>
                      </TD>
                      <TD className="text-right font-mono text-xs">{formatBRL(item.valor_total)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-6 self-start">
          <CardHeader>
            <CardTitle>Painel de classificação</CardTitle>
            <CardDescription>
              {selecionado
                ? `Item ${selecionado.item.numero_item} de ${selecionado.documento.tipo} ${selecionado.documento.numero_doc}`
                : "Selecione um item à esquerda"}
            </CardDescription>
          </CardHeader>
          {selecionado && (
            <CardContent className="space-y-3">
              <div className="bg-muted/40 rounded p-3 text-xs space-y-1">
                <div><strong>Produto:</strong> {selecionado.item.descricao}</div>
                <div><strong>Valor:</strong> {formatBRL(selecionado.item.valor_total)}</div>
                <div><strong>NCM:</strong> {selecionado.item.ncm} · <strong>CFOP:</strong> {selecionado.item.cfop}</div>
                <div><strong>Emitente:</strong> {selecionado.documento.razao_emitente} (CRT {selecionado.documento.crt_emitente})</div>
              </div>

              <Button type="button" variant="secondary" className="w-full" onClick={aplicarSugestao}>
                <Wand2 className="h-4 w-4" /> Aplicar sugestão automática
              </Button>

              <div>
                <Label>Natureza da Operação</Label>
                <Select value={edicao.natureza_operacao} onChange={(e) => setEdicao({ ...edicao, natureza_operacao: e.target.value as NaturezaOperacao })}>
                  <option value="">Selecione...</option>
                  {NATUREZAS_OPERACAO.map((n) => <option key={n.codigo} value={n.codigo}>{n.desc}</option>)}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>CST CBS</Label>
                  <Select value={edicao.cst_cbs} onChange={(e) => setEdicao({ ...edicao, cst_cbs: e.target.value })}>
                    <option value="">—</option>
                    {(selecionado.documento.direcao === "SAIDA" ? CSTS_CBS_SAIDA : CSTS_ENTRADA).map((c) => (
                      <option key={c.cst} value={c.cst}>{c.cst} — {c.desc}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>CST IBS</Label>
                  <Select value={edicao.cst_ibs} onChange={(e) => setEdicao({ ...edicao, cst_ibs: e.target.value })}>
                    <option value="">—</option>
                    {(selecionado.documento.direcao === "SAIDA" ? CSTS_CBS_SAIDA : CSTS_ENTRADA).map((c) => (
                      <option key={c.cst} value={c.cst}>{c.cst} — {c.desc}</option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Alíq. CBS (%)</Label>
                  <Input type="number" step="0.0001" value={edicao.aliquota_cbs} onChange={(e) => setEdicao({ ...edicao, aliquota_cbs: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>IBS Est. (%)</Label>
                  <Input type="number" step="0.0001" value={edicao.aliquota_ibs_estadual} onChange={(e) => setEdicao({ ...edicao, aliquota_ibs_estadual: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>IBS Mun. (%)</Label>
                  <Input type="number" step="0.0001" value={edicao.aliquota_ibs_municipal} onChange={(e) => setEdicao({ ...edicao, aliquota_ibs_municipal: Number(e.target.value) })} />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  id="geraCred"
                  type="checkbox"
                  checked={edicao.gera_credito}
                  onChange={(e) => setEdicao({ ...edicao, gera_credito: e.target.checked })}
                />
                <Label htmlFor="geraCred" className="mb-0 cursor-pointer">Gera crédito</Label>
              </div>

              {!edicao.gera_credito && (
                <div>
                  <Label>Motivo da vedação</Label>
                  <Input
                    value={edicao.motivo_vedacao}
                    onChange={(e) => setEdicao({ ...edicao, motivo_vedacao: e.target.value })}
                    placeholder="Ex: uso pessoal, benefício RH..."
                  />
                </div>
              )}

              <div className="flex flex-col gap-2 pt-3">
                <Button onClick={() => salvar(true)}>
                  <Save className="h-4 w-4" /> Aplicar e criar regra
                </Button>
                <Button variant="outline" onClick={() => salvar(false)}>
                  Aplicar só neste item
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
