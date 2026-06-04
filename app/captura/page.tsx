"use client";
import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { Upload, FileText, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { parseXMLDocument, type ParsedDocumento } from "@/lib/xml-parser";
import {
  saveDocumentoComItens, listRegras,
  upsertParticipante, getParticipanteByCnpj,
  upsertProduto, getProdutoByCodigo,
  saveDivergencia, listParticipantes, listProdutos,
} from "@/lib/storage";
import { useApp } from "@/lib/app-context";
import { classificarItem, calcularValoresIbsCbs } from "@/lib/classificador";
import { classificarICMS } from "@/lib/classificador-icms";
import { classificarIPI } from "@/lib/classificador-ipi";
import { detectarDivergencias } from "@/lib/divergencias";
import { getPercentualTransicao } from "@/lib/transicao";
import { formatBRL } from "@/lib/utils";
import type { CRT, RegimeTributario, TipoUsoProduto } from "@/types";

interface PreviewItem {
  nome: string;
  parsed: ParsedDocumento;
  contemIbsCbs: boolean;
  erro?: string;
}

function inferRegimeFromCRT(crt?: CRT | null): RegimeTributario | null {
  if (crt === "1" || crt === "2") return "SIMPLES_NACIONAL";
  if (crt === "3") return null; // pode ser LR ou LP — contador decide
  return null;
}

function inferTipoUsoFromCFOP(cfop?: string | null): TipoUsoProduto {
  if (!cfop) return "REVENDA";
  if (cfop.startsWith("1102") || cfop.startsWith("2102") || cfop.startsWith("5102") || cfop.startsWith("6102")) return "REVENDA";
  if (cfop.startsWith("1101") || cfop.startsWith("2101") || cfop.startsWith("5101") || cfop.startsWith("6101")) return "INSUMO";
  if (cfop.startsWith("1551") || cfop.startsWith("2551")) return "ATIVO_IMOB";
  if (cfop.startsWith("1556") || cfop.startsWith("2556")) return "USO_CONSUMO";
  if (cfop.startsWith("1949") || cfop.startsWith("2949")) return "USO_PESSOAL";
  if (cfop.startsWith("1933") || cfop.startsWith("2933")) return "SERVICO";
  return "REVENDA";
}

export default function CapturaPage() {
  const { toast } = useToast();
  const { empresa } = useApp();
  const [files, setFiles] = useState<PreviewItem[]>([]);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function processFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList).filter((f) => /\.xml$/i.test(f.name));
    if (arr.length === 0) {
      toast({ type: "warning", title: "Nenhum XML válido", description: "Selecione arquivos .xml de NF-e ou CT-e." });
      return;
    }
    const results: PreviewItem[] = [];
    for (const f of arr) {
      try {
        const text = await f.text();
        const parsed = parseXMLDocument(text);
        const contemIbsCbs = parsed.itens.some(
          (i) => i.valor_cbs_ofertado > 0 || i.valor_ibs_est_ofertado > 0
        );
        results.push({ nome: f.name, parsed, contemIbsCbs });
      } catch (e) {
        results.push({ nome: f.name, parsed: null as any, contemIbsCbs: false, erro: String((e as Error).message) });
      }
    }
    setFiles((prev) => [...prev, ...results]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
  }

  async function importarTodos() {
    if (!empresa) {
      toast({ type: "error", title: "Empresa não cadastrada", description: "Cadastre/selecione uma empresa primeiro." });
      return;
    }
    setImporting(true);
    let ok = 0, fail = 0, divCount = 0;
    const fase = getPercentualTransicao(empresa.ano_vigencia_aliquota);
    const regras = await listRegras(empresa.id);

    for (const f of files) {
      if (f.erro || !f.parsed) { fail++; continue; }
      try {
        // 1) Auto-cadastro de PARTICIPANTE (emitente)
        if (f.parsed.documento.cnpj_emitente) {
          const existente = await getParticipanteByCnpj(empresa.id, f.parsed.documento.cnpj_emitente);
          if (!existente) {
            await upsertParticipante({
              empresa_id: empresa.id,
              cnpj: f.parsed.documento.cnpj_emitente,
              razao_social: f.parsed.documento.razao_emitente,
              uf: f.parsed.documento.uf_emitente,
              municipio: f.parsed.documento.municipio_emitente,
              tipo: f.parsed.documento.direcao === "ENTRADA" ? "fornecedor" : "cliente",
              crt: f.parsed.documento.crt_emitente,
              regime_tributario: inferRegimeFromCRT(f.parsed.documento.crt_emitente),
              ativo: true,
              origem: "auto_xml",
            });
          }
        }

        // 2) Auto-cadastro de PRODUTOS por item
        for (const it of f.parsed.itens) {
          const codigo = it.codigo_produto ?? `AUTO-${it.ncm ?? "0"}-${it.descricao.substring(0, 10)}`;
          const existente = await getProdutoByCodigo(empresa.id, codigo);
          if (!existente) {
            const tipoUso = inferTipoUsoFromCFOP(it.cfop);
            await upsertProduto({
              empresa_id: empresa.id,
              codigo,
              descricao: it.descricao,
              ncm: it.ncm,
              unidade: it.unidade,
              tipo_uso: tipoUso,
              cfop_padrao_entrada: f.parsed.documento.direcao === "ENTRADA" ? it.cfop : null,
              cfop_padrao_saida: f.parsed.documento.direcao === "SAIDA" ? it.cfop : null,
              aliquota_cbs_padrao: empresa.aliquota_cbs,
              aliquota_ibs_estadual_padrao: empresa.aliquota_ibs_estadual,
              aliquota_ibs_municipal_padrao: empresa.aliquota_ibs_municipal,
              gera_credito_padrao: tipoUso !== "USO_PESSOAL" && tipoUso !== "BENEFICIO_RH",
              origem: "auto_xml",
              ativo: true,
            });
          }
        }

        // 3) Classificação automática + cálculo IBS/CBS por item
        const itensCalc = f.parsed.itens.map((i) => {
          const docCtx = {
            direcao: f.parsed.documento.direcao,
            crt_emitente: f.parsed.documento.crt_emitente,
            uf_emitente: f.parsed.documento.uf_emitente,
            uf_destinatario: f.parsed.documento.uf_destinatario,
            cnpj_emitente: f.parsed.documento.cnpj_emitente,
            cfop_principal: f.parsed.documento.cfop_principal,
          };
          const classif = classificarItem(empresa, docCtx, i, regras);
          const calc = calcularValoresIbsCbs(
            {
              ...i,
              tipo_calculo_credito: classif.tipo_calculo_credito,
              aliquota_presumida_cbs: classif.aliquota_presumida_cbs,
              aliquota_presumida_ibs: classif.aliquota_presumida_ibs,
            },
            empresa,
            fase
          );

          // ICMS — só recalcula se o XML não trouxer (valores 0)
          let cstIcms = i.cst_icms;
          let aliquotaIcms = i.aliquota_icms;
          let valorIcms = i.valor_icms;
          if ((!valorIcms || valorIcms === 0) && empresa.contribuinte_icms !== false) {
            const r = classificarICMS(empresa, docCtx, i);
            cstIcms = r.cst_icms;
            aliquotaIcms = r.aliquota_icms;
            valorIcms = r.valor_icms;
          }

          // IPI — só recalcula se necessário
          let cstIpi = i.cst_ipi;
          let valorIpi = i.valor_ipi;
          if ((!valorIpi || valorIpi === 0) && empresa.contribuinte_ipi) {
            const r = classificarIPI(empresa, docCtx, i);
            cstIpi = r.cst_ipi;
            valorIpi = r.valor_ipi;
          }

          const valorCreditoCbs = classif.tipo_calculo_credito === "presumido"
            ? calc.credito_presumido_cbs
            : (classif.gera_credito ? calc.valor_cbs_ofertado : 0);
          const valorCreditoIbsEst = classif.tipo_calculo_credito === "presumido"
            ? calc.credito_presumido_ibs / 2
            : (classif.gera_credito ? calc.valor_ibs_est_ofertado : 0);
          const valorCreditoIbsMun = classif.tipo_calculo_credito === "presumido"
            ? calc.credito_presumido_ibs / 2
            : (classif.gera_credito ? calc.valor_ibs_mun_ofertado : 0);

          return {
            ...i,
            cst_icms: cstIcms,
            aliquota_icms: aliquotaIcms,
            valor_icms: valorIcms,
            cst_ipi: cstIpi,
            valor_ipi: valorIpi,
            cst_cbs: classif.cst_cbs ?? i.cst_cbs,
            cst_ibs: classif.cst_ibs ?? i.cst_ibs,
            natureza_operacao: classif.natureza_operacao,
            gera_credito: classif.gera_credito,
            motivo_vedacao_credito: classif.motivo_vedacao,
            classificado_por: classif.classificado_por,
            regra_aplicada_id: classif.regra_aplicada_id,
            tipo_calculo_credito: classif.tipo_calculo_credito,
            aliquota_presumida_cbs: classif.aliquota_presumida_cbs,
            aliquota_presumida_ibs: classif.aliquota_presumida_ibs,
            aliquota_cbs: calc.aliquota_cbs,
            aliquota_ibs_estadual: calc.aliquota_ibs_estadual,
            aliquota_ibs_municipal: calc.aliquota_ibs_municipal,
            valor_cbs_ofertado: calc.valor_cbs_ofertado,
            valor_ibs_est_ofertado: calc.valor_ibs_est_ofertado,
            valor_ibs_mun_ofertado: calc.valor_ibs_mun_ofertado,
            base_calculo_cbs: calc.base_calculo_cbs,
            base_calculo_ibs: calc.base_calculo_ibs,
            valor_credito_cbs: valorCreditoCbs,
            valor_credito_ibs_est: valorCreditoIbsEst,
            valor_credito_ibs_mun: valorCreditoIbsMun,
            status_item: (classif.confianca >= 0.6 ? "classificado" : "pendente") as "classificado" | "pendente",
          };
        });

        const valorCbsDoc = itensCalc.reduce((s, i) => s + i.valor_cbs_ofertado, 0);
        const valorIbsDoc = itensCalc.reduce(
          (s, i) => s + i.valor_ibs_est_ofertado + i.valor_ibs_mun_ofertado,
          0
        );

        const docToSave = {
          ...f.parsed.documento,
          empresa_id: empresa.id,
          valor_cbs_documento: valorCbsDoc,
          valor_ibs_documento: valorIbsDoc,
          status_classificacao: itensCalc.every((i) => i.status_item === "classificado")
            ? "classificado" as const
            : itensCalc.some((i) => i.status_item === "classificado")
            ? "parcial" as const
            : "pendente" as const,
        };

        const { documento: savedDoc, itens: savedItens } = await saveDocumentoComItens(docToSave, itensCalc);

        // 4) Detectar divergências (após salvar para ter IDs)
        const participantes = await listParticipantes(empresa.id);
        const produtos = await listProdutos(empresa.id);
        const divs = detectarDivergencias(empresa, savedDoc, savedItens, participantes, produtos);
        for (const d of divs) {
          await saveDivergencia({
            empresa_id: empresa.id,
            documento_id: d.documento_id,
            item_id: d.item_id ?? null,
            tipo: d.tipo,
            severidade: d.severidade,
            titulo: d.titulo,
            descricao: d.descricao,
            sugestao: d.sugestao,
            status: "aberta",
          });
          divCount++;
        }
        ok++;
      } catch (err) {
        console.error(err);
        fail++;
      }
    }

    setImporting(false);
    setFiles([]);
    toast({
      type: ok > 0 ? "success" : "error",
      title: `Importação concluída`,
      description: `${ok} documento(s), ${fail} erro(s), ${divCount} divergência(s) detectada(s).`,
    });
  }

  if (!empresa) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Capturar XMLs</h1>
        <Card>
          <CardContent className="pt-5">
            Cadastre/selecione uma empresa primeiro.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Capturar XMLs</h1>
        <p className="text-sm text-muted-foreground">
          Importação manual em bloco. Auto-cadastra participantes e produtos. Detecta divergências.
        </p>
      </div>

      <Card>
        <CardContent
          className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
            }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="mt-3 font-medium">Arraste XMLs aqui ou clique para selecionar</div>
          <div className="text-xs text-muted-foreground mt-1">
            Múltiplos arquivos · NF-e (modelo 55), CT-e (57), NFS-e (ABRASF)
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xml"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && processFiles(e.target.files)}
          />
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Pré-visualização ({files.length})
            </CardTitle>
            <CardDescription>Revise antes de importar para o banco.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Status</TH>
                  <TH>Arquivo</TH>
                  <TH>Tipo</TH>
                  <TH>Número</TH>
                  <TH>Emitente</TH>
                  <TH>CRT</TH>
                  <TH>Data</TH>
                  <TH>Valor</TH>
                  <TH>IBS/CBS no XML?</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {files.map((f, idx) => (
                  <TR key={idx}>
                    <TD>
                      {f.erro ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" /> Erro
                        </Badge>
                      ) : (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> OK
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-xs max-w-[180px] truncate" title={f.nome}>{f.nome}</TD>
                    <TD>{f.parsed?.documento.tipo}</TD>
                    <TD>{f.parsed?.documento.numero_doc}</TD>
                    <TD className="text-xs max-w-[160px] truncate">
                      {f.parsed?.documento.razao_emitente}
                    </TD>
                    <TD>{f.parsed?.documento.crt_emitente ?? "-"}</TD>
                    <TD className="text-xs">{f.parsed?.documento.data_emissao}</TD>
                    <TD>{f.parsed ? formatBRL(f.parsed.documento.valor_total) : "-"}</TD>
                    <TD>
                      {f.contemIbsCbs ? (
                        <Badge variant="success">Sim</Badge>
                      ) : (
                        <Badge variant="warning">Calcular</Badge>
                      )}
                    </TD>
                    <TD>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="outline" onClick={() => setFiles([])}>Limpar</Button>
              <Button onClick={importarTodos} disabled={importing}>
                {importing ? "Importando..." : `Importar ${files.length} documento(s)`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
