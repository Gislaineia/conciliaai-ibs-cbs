"use client";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { BookOpen } from "lucide-react";
import {
  CSTS_ICMS_NORMAL, CSOSN_SN, CSTS_IPI, CSTS_PIS_COFINS,
  TIPI_AMOSTRA, CEST_AMOSTRA, CFOP_DESCRICOES, MVA_AMOSTRA,
  ALIQ_ICMS_INTERNA_UF,
} from "@/lib/tabelas-fiscais";
import { CSTS_CBS_SAIDA, CSTS_ENTRADA, ALIQUOTAS_BASE_UF } from "@/lib/aliquotas";

export default function TabelasFiscaisPage() {
  const [search, setSearch] = useState("");
  const s = search.toLowerCase();
  const f = <T,>(arr: T[], pred: (v: T) => boolean) => (search ? arr.filter(pred) : arr);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-6 w-6" /> Tabelas Fiscais
        </h1>
        <p className="text-sm text-muted-foreground">
          Referência consolidada: CSTs (ICMS, IPI, PIS/COFINS, IBS/CBS), CFOPs, NCMs/TIPI, CESTs, MVAs e alíquotas por UF.
        </p>
      </div>

      <Input
        placeholder="Buscar em todas as tabelas (CST, NCM, CFOP, descrição...)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      <Tabs defaultValue="cst-icms">
        <TabsList>
          <TabsTrigger value="cst-icms">CST ICMS</TabsTrigger>
          <TabsTrigger value="csosn">CSOSN (SN)</TabsTrigger>
          <TabsTrigger value="cst-ipi">CST IPI</TabsTrigger>
          <TabsTrigger value="cst-piscofins">CST PIS/COFINS</TabsTrigger>
          <TabsTrigger value="cst-cbs">CST CBS/IBS</TabsTrigger>
          <TabsTrigger value="cfop">CFOP</TabsTrigger>
          <TabsTrigger value="tipi">TIPI/NCM</TabsTrigger>
          <TabsTrigger value="cest">CEST</TabsTrigger>
          <TabsTrigger value="aliq-uf">Alíquotas UF</TabsTrigger>
          <TabsTrigger value="mva">MVA (ST)</TabsTrigger>
        </TabsList>

        <TabsContent value="cst-icms">
          <Card>
            <CardHeader>
              <CardTitle>CST ICMS — Regime Normal</CardTitle>
              <CardDescription>Tabela B Confaz — códigos para empresas no Lucro Real e Presumido</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>CST</TH><TH>Descrição</TH><TH>Origem</TH><TH>Crédito entrada</TH><TH>Débito saída</TH></TR></THead>
                <TBody>
                  {f(CSTS_ICMS_NORMAL, (c) => c.cst.includes(s) || c.descricao.toLowerCase().includes(s)).map((c) => (
                    <TR key={c.cst}>
                      <TD className="font-mono font-semibold">{c.cst}</TD>
                      <TD className="text-xs">{c.descricao}</TD>
                      <TD className="text-xs">{c.origem}</TD>
                      <TD>{c.gera_credito_entrada ? <Badge variant="success">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TD>
                      <TD>{c.gera_debito_saida ? <Badge variant="success">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="csosn">
          <Card>
            <CardHeader>
              <CardTitle>CSOSN — Simples Nacional</CardTitle>
              <CardDescription>Tabela C — empresas no SN/MEI</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>CSOSN</TH><TH>Descrição</TH></TR></THead>
                <TBody>
                  {f(CSOSN_SN, (c) => c.cst.includes(s) || c.descricao.toLowerCase().includes(s)).map((c) => (
                    <TR key={c.cst}>
                      <TD className="font-mono font-semibold">{c.cst}</TD>
                      <TD className="text-xs">{c.descricao}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cst-ipi">
          <Card>
            <CardHeader>
              <CardTitle>CST IPI</CardTitle>
              <CardDescription>Códigos de Situação Tributária do IPI — entradas e saídas</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>CST</TH><TH>Tipo</TH><TH>Descrição</TH><TH>Crédito</TH><TH>Débito</TH></TR></THead>
                <TBody>
                  {f(CSTS_IPI, (c) => c.cst.includes(s) || c.descricao.toLowerCase().includes(s)).map((c) => (
                    <TR key={c.cst}>
                      <TD className="font-mono font-semibold">{c.cst}</TD>
                      <TD><Badge variant="outline">{c.tipo}</Badge></TD>
                      <TD className="text-xs">{c.descricao}</TD>
                      <TD>{c.gera_credito ? <Badge variant="success">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TD>
                      <TD>{c.gera_debito ? <Badge variant="success">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cst-piscofins">
          <Card>
            <CardHeader>
              <CardTitle>CST PIS/COFINS</CardTitle>
              <CardDescription>Códigos para EFD Contribuições</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>CST</TH><TH>Tipo</TH><TH>Descrição</TH><TH>Crédito</TH><TH>Débito</TH></TR></THead>
                <TBody>
                  {f(CSTS_PIS_COFINS, (c) => c.cst.includes(s) || c.descricao.toLowerCase().includes(s)).map((c) => (
                    <TR key={c.cst}>
                      <TD className="font-mono font-semibold">{c.cst}</TD>
                      <TD><Badge variant="outline">{c.tipo}</Badge></TD>
                      <TD className="text-xs">{c.descricao}</TD>
                      <TD>{c.gera_credito ? <Badge variant="success">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TD>
                      <TD>{c.gera_debito ? <Badge variant="success">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cst-cbs">
          <Card>
            <CardHeader>
              <CardTitle>CST CBS/IBS — Reforma Tributária</CardTitle>
              <CardDescription>Códigos para apuração CBS/IBS no Bloco N</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-sm mb-2">Saídas (débito)</h3>
                  <Table>
                    <THead><TR><TH>CST</TH><TH>Descrição</TH></TR></THead>
                    <TBody>
                      {f([...CSTS_CBS_SAIDA], (c: any) => c.cst.includes(s) || c.desc.toLowerCase().includes(s)).map((c: any) => (
                        <TR key={c.cst}>
                          <TD className="font-mono font-semibold">{c.cst}</TD>
                          <TD className="text-xs">{c.desc}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-2">Entradas (crédito)</h3>
                  <Table>
                    <THead><TR><TH>CST</TH><TH>Descrição</TH><TH>Crédito</TH></TR></THead>
                    <TBody>
                      {f([...CSTS_ENTRADA], (c: any) => c.cst.includes(s) || c.desc.toLowerCase().includes(s)).map((c: any) => (
                        <TR key={c.cst}>
                          <TD className="font-mono font-semibold">{c.cst}</TD>
                          <TD className="text-xs">{c.desc}</TD>
                          <TD className="text-xs">{c.credito}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cfop">
          <Card>
            <CardHeader>
              <CardTitle>CFOPs comuns</CardTitle>
              <CardDescription>Código Fiscal de Operações e Prestações</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>CFOP</TH><TH>Descrição</TH></TR></THead>
                <TBody>
                  {Object.entries(CFOP_DESCRICOES).filter(([cfop, desc]) =>
                    !search || cfop.includes(s) || desc.toLowerCase().includes(s)
                  ).map(([cfop, desc]) => (
                    <TR key={cfop}>
                      <TD className="font-mono font-semibold">{cfop}</TD>
                      <TD className="text-xs">{desc}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tipi">
          <Card>
            <CardHeader>
              <CardTitle>TIPI — Tabela de Incidência IPI</CardTitle>
              <CardDescription>Alíquota IPI por capítulo NCM (amostra)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>NCM (prefixo)</TH><TH>Descrição</TH><TH className="text-right">Alíquota</TH><TH>Obs.</TH></TR></THead>
                <TBody>
                  {f(TIPI_AMOSTRA, (t) => t.ncm_prefix.includes(s) || t.descricao_capitulo.toLowerCase().includes(s)).map((t) => (
                    <TR key={t.ncm_prefix}>
                      <TD className="font-mono">{t.ncm_prefix}</TD>
                      <TD className="text-xs">{t.descricao_capitulo}</TD>
                      <TD className="text-right">
                        {t.aliquota_padrao === -1 ? <Badge variant="outline">NT</Badge> :
                          t.aliquota_padrao === 0 ? <Badge variant="secondary">Zero</Badge> :
                          <span className="font-mono">{t.aliquota_padrao}%</span>}
                      </TD>
                      <TD className="text-xs">{t.observacao ?? ""}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cest">
          <Card>
            <CardHeader>
              <CardTitle>CEST — Substituição Tributária</CardTitle>
              <CardDescription>Código Especificador da ST por segmento (amostra)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>CEST</TH><TH>NCM</TH><TH>Descrição</TH><TH>Segmento</TH></TR></THead>
                <TBody>
                  {f(CEST_AMOSTRA, (c) => c.cest.includes(s) || c.ncm_prefix.includes(s) || c.descricao.toLowerCase().includes(s)).map((c) => (
                    <TR key={c.cest}>
                      <TD className="font-mono">{c.cest}</TD>
                      <TD className="font-mono">{c.ncm_prefix}</TD>
                      <TD className="text-xs">{c.descricao}</TD>
                      <TD className="text-xs">{c.segmento}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aliq-uf">
          <Card>
            <CardHeader>
              <CardTitle>Alíquotas ICMS por UF</CardTitle>
              <CardDescription>Alíquota interna padrão (operações internas)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>UF</TH><TH>Estado</TH><TH className="text-right">Aliq. interna ICMS</TH><TH className="text-right">Aliq. IBS estadual</TH><TH className="text-right">Aliq. IBS municipal</TH></TR></THead>
                <TBody>
                  {ALIQUOTAS_BASE_UF.filter((u) => !search || u.uf.includes(search.toUpperCase()) || u.nome.toLowerCase().includes(s)).map((u) => (
                    <TR key={u.uf}>
                      <TD className="font-mono font-semibold">{u.uf}</TD>
                      <TD className="text-xs">{u.nome}</TD>
                      <TD className="text-right font-mono">{ALIQ_ICMS_INTERNA_UF[u.uf] ?? 18}%</TD>
                      <TD className="text-right font-mono">{u.estadual}%</TD>
                      <TD className="text-right font-mono">{u.municipal_padrao}%</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mva">
          <Card>
            <CardHeader>
              <CardTitle>MVA — Margem de Valor Agregado (ICMS-ST)</CardTitle>
              <CardDescription>Amostra por segmento. Atualização requer convênio CONFAZ.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>NCM</TH><TH>Segmento</TH><TH className="text-right">MVA original</TH><TH className="text-right">MVA aj. 4%</TH><TH className="text-right">MVA aj. 7%</TH><TH className="text-right">MVA aj. 12%</TH></TR></THead>
                <TBody>
                  {f(MVA_AMOSTRA, (m) => m.ncm_prefix.includes(s) || m.segmento.toLowerCase().includes(s)).map((m) => (
                    <TR key={m.ncm_prefix}>
                      <TD className="font-mono">{m.ncm_prefix}</TD>
                      <TD className="text-xs">{m.segmento}</TD>
                      <TD className="text-right font-mono">{m.mva_original}%</TD>
                      <TD className="text-right font-mono text-xs">{m.mva_ajustada_4 ?? "—"}</TD>
                      <TD className="text-right font-mono text-xs">{m.mva_ajustada_7 ?? "—"}</TD>
                      <TD className="text-right font-mono text-xs">{m.mva_ajustada_12 ?? "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
