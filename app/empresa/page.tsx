"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { AlertTriangle, Save } from "lucide-react";
import { getEmpresa, saveEmpresa } from "@/lib/storage";
import { ALIQUOTAS_BASE_UF } from "@/lib/aliquotas";
import { getPercentualTransicao, tabelaTransicaoCompleta } from "@/lib/transicao";
import type { Empresa, RegimeTributario, TipoEstabelecimento } from "@/types";

const REGIMES: Array<{ value: RegimeTributario; label: string }> = [
  { value: "LUCRO_REAL", label: "Lucro Real" },
  { value: "LUCRO_PRESUMIDO", label: "Lucro Presumido" },
  { value: "SIMPLES_NACIONAL", label: "Simples Nacional" },
  { value: "MEI", label: "MEI" },
];

const SETORES_DIFERENCIADOS = [
  "nenhum", "saude", "educacao", "financeiro", "agro", "transporte_coletivo",
];

export default function EmpresaPage() {
  const { toast } = useToast();
  const [emp, setEmp] = useState<Empresa>({
    id: "",
    cnpj: "",
    razao_social: "",
    nome_fantasia: "",
    uf: "SP",
    municipio: "",
    cod_municipio_ibge: "",
    regime_tributario: "LUCRO_REAL",
    regime_pis_cofins: "nao_cumulativo",
    crt: "3",
    regime_ibs_cbs: "contribuinte_padrao",
    setor_diferenciado: "nenhum",
    simples_opta_destaque_ibs: false,
    is_mei: false,
    faturamento_anual_estimado: 0,
    aliquota_cbs: 8.8,
    aliquota_ibs_estadual: 17.7,
    aliquota_ibs_municipal: 8.8,
    ano_vigencia_aliquota: new Date().getFullYear(),
    tipo_estabelecimento: "COMERCIAL",
    contribuinte_ipi: false,
    contribuinte_icms: true,
    inscricao_estadual: "",
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const e = await getEmpresa();
      if (e) setEmp(e);
      setLoaded(true);
    })();
  }, []);

  // Quando muda o regime, ajusta CRT e PIS/COFINS automaticamente
  function handleRegimeChange(regime: RegimeTributario) {
    setEmp((p) => ({
      ...p,
      regime_tributario: regime,
      crt: regime === "LUCRO_REAL" || regime === "LUCRO_PRESUMIDO" ? "3" : "1",
      regime_pis_cofins:
        regime === "LUCRO_REAL" ? "nao_cumulativo" : "cumulativo",
      is_mei: regime === "MEI",
    }));
  }

  // Quando muda UF, sugere alíquotas vigentes
  function handleUFChange(uf: string) {
    const aliq = ALIQUOTAS_BASE_UF.find((a) => a.uf === uf);
    setEmp((p) => ({
      ...p,
      uf,
      aliquota_ibs_estadual: aliq?.estadual ?? p.aliquota_ibs_estadual,
      aliquota_ibs_municipal: aliq?.municipal_padrao ?? p.aliquota_ibs_municipal,
    }));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!emp.cnpj || !emp.razao_social || !emp.uf) {
      toast({ type: "error", title: "Campos obrigatórios", description: "Preencha CNPJ, Razão Social e UF." });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveEmpresa(emp);
      setEmp(saved);
      toast({ type: "success", title: "Empresa salva", description: "Configuração armazenada com sucesso." });
    } catch (err) {
      toast({ type: "error", title: "Erro ao salvar", description: String((err as Error).message) });
    } finally {
      setSaving(false);
    }
  }

  const fase = getPercentualTransicao(emp.ano_vigencia_aliquota);

  if (!loaded) return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <form onSubmit={onSave} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cadastro de Empresa</h1>
        <p className="text-sm text-muted-foreground">
          Dados, regime tributário e alíquotas vigentes para apuração IBS/CBS.
        </p>
      </div>

      {emp.regime_tributario === "LUCRO_PRESUMIDO" && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong className="text-amber-900">
                  Aviso — Empresa no Lucro Presumido tem direito a crédito integral de IBS/CBS
                </strong>
                <p className="mt-1 text-amber-900">
                  No PIS/COFINS atual o regime cumulativo não dá crédito; no IBS/CBS a não-cumulatividade
                  é plena para todos os contribuintes. Durante a transição, apure ambos em paralelo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>CNPJ *</Label>
            <Input
              value={emp.cnpj}
              onChange={(e) => setEmp({ ...emp, cnpj: e.target.value })}
              placeholder="00.000.000/0000-00"
              required
            />
          </div>
          <div>
            <Label>Razão Social *</Label>
            <Input
              value={emp.razao_social}
              onChange={(e) => setEmp({ ...emp, razao_social: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>Nome Fantasia</Label>
            <Input
              value={emp.nome_fantasia ?? ""}
              onChange={(e) => setEmp({ ...emp, nome_fantasia: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>UF *</Label>
              <Select
                value={emp.uf}
                onChange={(e) => handleUFChange(e.target.value)}
                required
              >
                {ALIQUOTAS_BASE_UF.map((u) => (
                  <option key={u.uf} value={u.uf}>{u.uf}</option>
                ))}
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Município</Label>
              <Input
                value={emp.municipio}
                onChange={(e) => setEmp({ ...emp, municipio: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Código IBGE Município</Label>
            <Input
              value={emp.cod_municipio_ibge}
              maxLength={7}
              onChange={(e) => setEmp({ ...emp, cod_municipio_ibge: e.target.value.replace(/\D/g, "") })}
              placeholder="3550308"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regime Tributário</CardTitle>
          <CardDescription>Determina como você apura IBS/CBS, gera crédito e quais obrigações cumpre.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Regime *</Label>
            <Select
              value={emp.regime_tributario}
              onChange={(e) => handleRegimeChange(e.target.value as RegimeTributario)}
            >
              {REGIMES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </div>
          <div>
            <Label>CRT (NF-e emitida)</Label>
            <Select value={emp.crt} onChange={(e) => setEmp({ ...emp, crt: e.target.value as Empresa["crt"] })}>
              <option value="1">1 — Simples Nacional</option>
              <option value="2">2 — SN excesso de sublimite</option>
              <option value="3">3 — Regime Normal</option>
            </Select>
          </div>
          <div>
            <Label>PIS/COFINS</Label>
            <Select
              value={emp.regime_pis_cofins}
              onChange={(e) => setEmp({ ...emp, regime_pis_cofins: e.target.value as Empresa["regime_pis_cofins"] })}
            >
              <option value="cumulativo">Cumulativo (LP)</option>
              <option value="nao_cumulativo">Não-cumulativo (LR)</option>
            </Select>
          </div>
          <div>
            <Label>Setor Diferenciado</Label>
            <Select
              value={emp.setor_diferenciado ?? "nenhum"}
              onChange={(e) => setEmp({ ...emp, setor_diferenciado: e.target.value })}
            >
              {SETORES_DIFERENCIADOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>

          {emp.regime_tributario === "SIMPLES_NACIONAL" && (
            <>
              <div>
                <Label>Faturamento anual estimado (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={emp.faturamento_anual_estimado ?? 0}
                  onChange={(e) => setEmp({ ...emp, faturamento_anual_estimado: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end gap-2">
                <input
                  id="optaDest"
                  type="checkbox"
                  checked={emp.simples_opta_destaque_ibs}
                  onChange={(e) => setEmp({ ...emp, simples_opta_destaque_ibs: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="optaDest" className="mb-0 cursor-pointer">
                  Optou por destacar IBS/CBS na NF-e (crédito integral ao comprador)
                </Label>
              </div>
            </>
          )}
          {emp.regime_tributario === "MEI" && (
            <div className="md:col-span-2 text-sm bg-blue-50 border border-blue-200 rounded p-3">
              MEI não é contribuinte de IBS/CBS e não emite SPED EFD ICMS/IPI.
              O sistema continuará armazenando documentos para controle interno.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alíquotas Vigentes</CardTitle>
          <CardDescription>
            Preenchidas automaticamente pela UF e fase de transição. Editáveis para casos específicos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Ano de vigência</Label>
              <Input
                type="number"
                value={emp.ano_vigencia_aliquota}
                min={2026}
                max={2033}
                onChange={(e) => setEmp({ ...emp, ano_vigencia_aliquota: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Alíquota CBS (%)</Label>
              <Input
                type="number"
                step="0.0001"
                value={emp.aliquota_cbs}
                onChange={(e) => setEmp({ ...emp, aliquota_cbs: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>IBS Estadual (%)</Label>
              <Input
                type="number"
                step="0.0001"
                value={emp.aliquota_ibs_estadual}
                onChange={(e) => setEmp({ ...emp, aliquota_ibs_estadual: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>IBS Municipal (%)</Label>
              <Input
                type="number"
                step="0.0001"
                value={emp.aliquota_ibs_municipal}
                onChange={(e) => setEmp({ ...emp, aliquota_ibs_municipal: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="info">Fase {emp.ano_vigencia_aliquota}</Badge>
              <span>{fase.descricao}</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Percentuais efetivos aplicados sobre as alíquotas: CBS {(fase.cbs * 100).toFixed(2)}% · IBS {(fase.ibs * 100).toFixed(2)}%
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ICMS / IPI</CardTitle>
          <CardDescription>
            Contribuição estadual (ICMS) e federal (IPI). Determina geração do Bloco E no SPED.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Tipo de estabelecimento</Label>
            <Select
              value={emp.tipo_estabelecimento ?? "COMERCIAL"}
              onChange={(e) => {
                const t = e.target.value as TipoEstabelecimento;
                setEmp({
                  ...emp,
                  tipo_estabelecimento: t,
                  contribuinte_ipi: t === "INDUSTRIAL" || t === "EQUIPARADO",
                });
              }}
            >
              <option value="COMERCIAL">Comercial (não contribuinte IPI)</option>
              <option value="INDUSTRIAL">Industrial (contribuinte pleno IPI)</option>
              <option value="EQUIPARADO">Equiparado a industrial</option>
              <option value="PRESTADOR_SERVICO">Prestador de serviço</option>
            </Select>
          </div>
          <div>
            <Label>Inscrição Estadual</Label>
            <Input
              value={emp.inscricao_estadual ?? ""}
              onChange={(e) => setEmp({ ...emp, inscricao_estadual: e.target.value })}
              placeholder="Ex: 123.456.789.012"
            />
          </div>
          <div className="flex items-end gap-2">
            <input
              id="cIcms"
              type="checkbox"
              checked={emp.contribuinte_icms ?? true}
              onChange={(e) => setEmp({ ...emp, contribuinte_icms: e.target.checked })}
              className="h-4 w-4"
            />
            <Label htmlFor="cIcms" className="mb-0 cursor-pointer">Contribuinte do ICMS (gera Bloco E)</Label>
          </div>
          <div className="flex items-end gap-2">
            <input
              id="cIpi"
              type="checkbox"
              checked={emp.contribuinte_ipi ?? false}
              onChange={(e) => setEmp({ ...emp, contribuinte_ipi: e.target.checked })}
              className="h-4 w-4"
            />
            <Label htmlFor="cIpi" className="mb-0 cursor-pointer">Contribuinte do IPI (gera E500/E520)</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tabela de Transição</CardTitle>
          <CardDescription>Cronograma 2026–2033 conforme LC 214/2025.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase">
                <tr>
                  <th className="text-left p-2">Ano</th>
                  <th className="text-left p-2">% CBS efetivo</th>
                  <th className="text-left p-2">% IBS efetivo</th>
                  <th className="text-left p-2">Fase</th>
                </tr>
              </thead>
              <tbody>
                {tabelaTransicaoCompleta().map((t) => (
                  <tr
                    key={t.ano}
                    className={t.ano === emp.ano_vigencia_aliquota ? "bg-primary/10 font-semibold" : "border-b"}
                  >
                    <td className="p-2">{t.ano}</td>
                    <td className="p-2">{(t.cbs * 100).toFixed(2)}%</td>
                    <td className="p-2">{(t.ibs * 100).toFixed(2)}%</td>
                    <td className="p-2 text-xs">{t.descricao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar empresa"}
        </Button>
      </div>
    </form>
  );
}
