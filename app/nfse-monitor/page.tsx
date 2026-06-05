"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/app-context";
import { getCapturaSefaz, saveCapturaSefaz } from "@/lib/storage";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  Activity,
  Building2,
  Cloud,
  FileText,
  Play,
  RefreshCw,
  Server,
  Stethoscope,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface NfseDoc {
  id: string;
  empresa_id: string;
  chave_acesso: string;
  schema: string;
  sim: string;
  importado_em: string;
  parseado_em?: string | null;
}

interface AbrasfMunicipio {
  ibge: string;
  nome: string;
  uf: string;
  versao: string;
}

interface ConsultaRow {
  id: string;
  tipo: string;
  origem: string;
  status: string;
  mensagem: string;
  duracao_ms: number;
  criado_em: string;
}

export default function NfseMonitorPage() {
  const { empresa } = useApp();
  const { toast } = useToast();

  // ── Cert (lido do localStorage da pagina /captura-sefaz) ──
  const [pfxBase64, setPfxBase64] = useState<string | null>(null);
  const [pfxSenha, setPfxSenha] = useState("");
  const [ambiente, setAmbiente] = useState<"homologacao" | "producao">("homologacao");

  // ── Dados ──
  const [docs, setDocs] = useState<NfseDoc[]>([]);
  const [historico, setHistorico] = useState<ConsultaRow[]>([]);
  const [municipios, setMunicipios] = useState<AbrasfMunicipio[]>([]);

  // ── RFB (Portal Nacional) ──
  const hojeIso = new Date().toISOString().substring(0, 10);
  const inicioMes = `${hojeIso.substring(0, 7)}-01`;
  const [rfbInicio, setRfbInicio] = useState(inicioMes);
  const [rfbFim, setRfbFim] = useState(hojeIso);
  const [executandoRfb, setExecutandoRfb] = useState(false);

  // ── ABRASF (municipal) ──
  const [abrasfIbge, setAbrasfIbge] = useState("");
  const [abrasfFiltro, setAbrasfFiltro] = useState("");
  const [abrasfInicio, setAbrasfInicio] = useState(inicioMes);
  const [abrasfFim, setAbrasfFim] = useState(hojeIso);
  const [executandoAbrasf, setExecutandoAbrasf] = useState(false);

  // ── Loading state ──
  const [loading, setLoading] = useState(true);

  // ── Diagnostico ──
  const [diagnosticando, setDiagnosticando] = useState(false);
  const [diagnostico, setDiagnostico] = useState<any>(null);

  async function carregar() {
    if (!empresa) return;
    setLoading(true);
    try {
      const cfg = await getCapturaSefaz(empresa.id);
      if (cfg) {
        setAmbiente(((cfg as any).ambiente ?? "homologacao") as any);
      }

      // Documentos NFS-e ja capturados (filtramos schema=nfse no fetch direto)
      const r = await fetch(`/api/consultas?empresa_id=${empresa.id}&limit=200`);
      const d = await r.json();
      setHistorico(d.consultas ?? []);

      // Lista municipios ABRASF mapeados
      const m = await fetch("/api/nfse/abrasf/municipios");
      const md = await m.json();
      setMunicipios(md.municipios ?? []);

      // NFS-e capturados (consulta direta no Supabase via API publica de leitura nao existe;
      // exibimos os capturados via historico filtrado por tipo)
      const nfse = (d.consultas ?? []).filter((c: ConsultaRow) =>
        c.tipo === "NFSE_RFB" || c.tipo === "NFSE_ABRASF"
      );
      setHistorico(nfse);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [empresa?.id]);

  function handlePfx(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPfxBase64(((r.result as string) || "").split(",")[1] ?? null);
    r.readAsDataURL(f);
  }

  async function executarRfb() {
    if (!empresa) return;
    if (!pfxBase64 || !pfxSenha) {
      toast({ type: "error", title: "Carregue o certificado .pfx e informe a senha" });
      return;
    }
    setExecutandoRfb(true);
    try {
      const res = await fetch("/api/nfse/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresa.id,
          cnpj: empresa.cnpj?.replace(/\D/g, ""),
          pfx_base64: pfxBase64,
          pfx_senha: pfxSenha,
          data_inicio: rfbInicio,
          data_fim: rfbFim,
          ambiente,
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === "OK") {
        toast({
          type: "success",
          title: `RFB: ${data.total} NFS-e capturada(s)`,
          description: data.url_consultada,
        });
      } else {
        toast({
          type: "error",
          title: "Falha RFB",
          description: data.mensagem ?? `HTTP ${res.status}`,
        });
      }
      carregar();
    } catch (e: any) {
      toast({ type: "error", title: "Erro", description: e.message });
    } finally {
      setExecutandoRfb(false);
    }
  }

  async function diagnosticar() {
    if (!empresa) return;
    if (!pfxBase64 || !pfxSenha) {
      toast({ type: "error", title: "Carregue o .pfx e informe a senha antes do diagnóstico" });
      return;
    }
    setDiagnosticando(true);
    setDiagnostico(null);
    try {
      const res = await fetch("/api/nfse/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresa.id,
          cnpj: empresa.cnpj?.replace(/\D/g, ""),
          pfx_base64: pfxBase64,
          pfx_senha: pfxSenha,
          ambiente,
        }),
      });
      const data = await res.json();
      setDiagnostico(data);
      if (data.status === "OK") {
        toast({ type: "success", title: "Diagnóstico OK", description: data.sugestao });
      } else {
        toast({ type: "error", title: "Diagnóstico encontrou problemas", description: data.sugestao });
      }
    } catch (e: any) {
      toast({ type: "error", title: "Erro", description: e.message });
    } finally {
      setDiagnosticando(false);
    }
  }

  async function executarAbrasf() {
    if (!empresa) return;
    if (!abrasfIbge) {
      toast({ type: "error", title: "Selecione um municipio" });
      return;
    }
    if (!pfxBase64 || !pfxSenha) {
      toast({ type: "error", title: "Carregue o certificado .pfx e informe a senha" });
      return;
    }
    // Roteia automaticamente para endpoint correto
    const munSel = municipios.find((m) => m.ibge === abrasfIbge);
    const ehSP = abrasfIbge === "3550308";
    const endpoint = ehSP ? "/api/nfse/sp" : "/api/nfse/abrasf";

    setExecutandoAbrasf(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresa.id,
          cnpj: empresa.cnpj?.replace(/\D/g, ""),
          municipio_ibge: abrasfIbge,
          pfx_base64: pfxBase64,
          pfx_senha: pfxSenha,
          data_inicial: abrasfInicio,
          data_final: abrasfFim,
          ambiente,
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === "OK") {
        toast({
          type: "success",
          title: `${data.municipio ?? munSel?.nome}: ${data.total_capturados ?? 0} NFS-e`,
        });
      } else {
        toast({
          type: "error",
          title: "Falha",
          description: data.mensagem ?? `HTTP ${res.status}`,
        });
      }
      carregar();
    } catch (e: any) {
      toast({ type: "error", title: "Erro", description: e.message });
    } finally {
      setExecutandoAbrasf(false);
    }
  }

  if (!empresa)
    return <p className="p-8 text-muted-foreground">Selecione uma empresa primeiro.</p>;

  const totalRfb = historico.filter((h) => h.tipo === "NFSE_RFB").length;
  const totalAbrasf = historico.filter((h) => h.tipo === "NFSE_ABRASF").length;
  const ultimoOk = historico.find((h) => h.status === "OK");
  const ultimoErro = historico.find((h) => h.status === "ERRO");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Cloud className="h-6 w-6 text-purple-600" /> Monitor NFS-e Nacional
          </h1>
          <p className="text-sm text-muted-foreground">
            Portal Nacional RFB (SNNFS-e/ADN) + ABRASF municipal. Empresa:{" "}
            <strong>{empresa.razao_social}</strong> ({empresa.cnpj})
          </p>
        </div>
        <div className="flex gap-2">
          {(["homologacao", "producao"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAmbiente(a)}
              className={`px-3 py-1 text-xs rounded-full font-semibold border ${
                ambiente === a
                  ? a === "producao"
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-yellow-500 text-white border-yellow-500"
                  : "bg-white text-gray-500 border-gray-300"
              }`}
            >
              {a === "producao" ? "Produção" : "Homologação"}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Server className="h-3 w-3" /> RFB Nacional
            </div>
            <div className="text-2xl font-bold">{totalRfb}</div>
            <div className="text-xs text-muted-foreground">execuções</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3 w-3" /> ABRASF Municipal
            </div>
            <div className="text-2xl font-bold">{totalAbrasf}</div>
            <div className="text-xs text-muted-foreground">execuções</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Municípios ABRASF mapeados</div>
            <div className="text-2xl font-bold">{municipios.length}</div>
            <div className="text-xs text-muted-foreground">capitais e capitais de UF</div>
          </CardContent>
        </Card>
        <Card className={ultimoErro ? "border-red-300" : ultimoOk ? "border-green-300" : ""}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" /> Última
            </div>
            <div className="text-sm font-medium">
              {historico[0]
                ? `${historico[0].status} · ${new Date(historico[0].criado_em).toLocaleString("pt-BR")}`
                : "—"}
            </div>
            {historico[0]?.mensagem && (
              <div className="text-xs text-muted-foreground truncate" title={historico[0].mensagem}>
                {historico[0].mensagem}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Certificado A1 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificado A1 (sessão atual)</CardTitle>
          <CardDescription>
            Carregue o .pfx para esta sessão; a senha não é gravada no servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="file"
            accept=".pfx,.p12"
            onChange={handlePfx}
            className="text-xs file:mr-2 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <Input
            type="password"
            value={pfxSenha}
            onChange={(e) => setPfxSenha(e.target.value)}
            placeholder="Senha do certificado"
          />
          {pfxBase64 && (
            <Badge variant="success" className="w-fit">
              Certificado em sessão
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Diagnostico */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4" /> Diagnóstico de conexão
          </CardTitle>
          <CardDescription>
            Antes de buscar NFS-e, valide o certificado, DNS, TLS, mTLS e adesão do CNPJ ao SNNFS-e.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={diagnosticar}
            disabled={diagnosticando || !pfxBase64 || !pfxSenha}
            variant="outline"
            className="gap-2"
          >
            <Stethoscope className={`h-4 w-4 ${diagnosticando ? "animate-pulse" : ""}`} />
            {diagnosticando ? "Diagnosticando..." : "Diagnosticar conexão"}
          </Button>
          {diagnostico && (
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <Badge variant={diagnostico.status === "OK" ? "success" : "destructive"}>
                  {diagnostico.status}
                </Badge>
                {diagnostico.host && <Badge variant="outline">host: {diagnostico.host}</Badge>}
                {diagnostico.cert_subject && (
                  <Badge variant="outline" className="truncate" title={diagnostico.cert_subject}>
                    {diagnostico.cert_subject}
                  </Badge>
                )}
              </div>
              <div className="space-y-1.5">
                {(diagnostico.etapas ?? []).map((e: any, i: number) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 p-2 rounded text-xs border ${
                      e.ok
                        ? "border-green-200 bg-green-50"
                        : "border-red-200 bg-red-50"
                    }`}
                  >
                    {e.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="font-semibold">{e.nome}</div>
                      <div className="text-muted-foreground">{e.detalhe}</div>
                    </div>
                    <div className="text-muted-foreground whitespace-nowrap">
                      {e.duracao_ms}ms
                    </div>
                  </div>
                ))}
              </div>
              {diagnostico.sugestao && (
                <div className="p-3 rounded bg-blue-50 border border-blue-200 text-xs">
                  <strong>Sugestão:</strong> {diagnostico.sugestao}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* RFB Portal Nacional */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-4 w-4" /> Portal Nacional RFB (SNNFS-e / ADN)
          </CardTitle>
          <CardDescription>
            <strong>Busca todas as NFS-e recebidas em uma única chamada</strong> — o Portal Nacional consolida todos os municípios aderentes ao SNNFS-e (sem precisar entrar prefeitura por prefeitura). Endpoint:{" "}
            <code className="text-xs">
              {ambiente === "producao"
                ? "https://adn.nfse.gov.br/contribuinte/v1"
                : "https://adnh.producaorestrita.nfse.gov.br/contribuinte/v1"}
            </code>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Data início</label>
            <Input type="date" value={rfbInicio} onChange={(e) => setRfbInicio(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Data fim</label>
            <Input type="date" value={rfbFim} onChange={(e) => setRfbFim(e.target.value)} />
          </div>
          <Button
            onClick={executarRfb}
            disabled={executandoRfb || !pfxBase64 || !pfxSenha}
            className="self-end gap-2"
          >
            <Play className="h-4 w-4" />
            {executandoRfb ? "Buscando..." : "Buscar NFS-e RFB"}
          </Button>
        </CardContent>
      </Card>

      {/* ABRASF Municipal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Captura por Município
          </CardTitle>
          <CardDescription>
            Para municípios com sistema próprio (SP capital, RJ Nota Carioca, ABRASF, Brasília, etc).
            O sistema escolhe automaticamente o conector certo (NFe-SP, Nota Carioca v1, ABRASF v2.02).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 space-y-2">
            <label className="text-xs text-muted-foreground">
              Município ({municipios.length} disponíveis)
            </label>
            <Input
              placeholder="Buscar por nome ou IBGE..."
              value={abrasfFiltro}
              onChange={(e) => setAbrasfFiltro(e.target.value)}
              className="text-sm"
            />
            <select
              value={abrasfIbge}
              onChange={(e) => setAbrasfIbge(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              size={6}
            >
              <option value="">Selecione...</option>
              {[...municipios]
                .filter((m) => {
                  const q = abrasfFiltro.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    m.nome.toLowerCase().includes(q) ||
                    (m.uf ?? "").toLowerCase().includes(q) ||
                    m.ibge.includes(q)
                  );
                })
                .sort((a, b) => a.nome.localeCompare(b.nome))
                .map((m: any) => (
                  <option key={m.ibge} value={m.ibge}>
                    {m.nome}
                    {m.uf && !m.nome.includes(`- ${m.uf}`) ? ` - ${m.uf}` : ""} ({m.ibge})
                    {m.versao?.startsWith?.("PROPRIO_") ? "  ⚙ proprio" : ""}
                  </option>
                ))}
            </select>
            {abrasfIbge === "3550308" && (
              <div className="text-xs bg-yellow-50 border border-yellow-200 p-2 rounded">
                <strong>São Paulo capital</strong> usa schema próprio (NFe-SP). Roteado
                automaticamente para <code>/api/nfse/sp</code>.
              </div>
            )}
            {abrasfIbge === "3304557" && (
              <div className="text-xs bg-yellow-50 border border-yellow-200 p-2 rounded">
                <strong>Rio de Janeiro (Nota Carioca)</strong> usa ABRASF v1.00.
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Início</label>
            <Input
              type="date"
              value={abrasfInicio}
              onChange={(e) => setAbrasfInicio(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Fim</label>
            <Input type="date" value={abrasfFim} onChange={(e) => setAbrasfFim(e.target.value)} />
          </div>
          <Button
            onClick={executarAbrasf}
            disabled={executandoAbrasf || !pfxBase64 || !pfxSenha || !abrasfIbge}
            className="md:col-span-4 gap-2"
          >
            <Play className="h-4 w-4" />
            {executandoAbrasf
              ? "Buscando..."
              : abrasfIbge === "3550308"
              ? "Buscar NFe-SP (Prefeitura SP)"
              : abrasfIbge === "3304557"
              ? "Buscar Nota Carioca"
              : "Buscar NFS-e"}
          </Button>
        </CardContent>
      </Card>

      {/* Historico */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Histórico de execuções ({historico.length})
            <Button
              variant="ghost"
              size="icon"
              onClick={carregar}
              disabled={loading}
              className="ml-auto"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma execução registrada. Execute uma busca acima.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Quando</TH>
                  <TH>Tipo</TH>
                  <TH>Origem</TH>
                  <TH>Status</TH>
                  <TH>Mensagem</TH>
                  <TH className="text-right">Duração</TH>
                </TR>
              </THead>
              <TBody>
                {historico.map((h) => (
                  <TR key={h.id}>
                    <TD className="text-xs">
                      {new Date(h.criado_em).toLocaleString("pt-BR")}
                    </TD>
                    <TD>
                      <Badge variant="outline">{h.tipo}</Badge>
                    </TD>
                    <TD className="text-xs">{h.origem}</TD>
                    <TD>
                      <Badge variant={h.status === "OK" ? "success" : "destructive"}>
                        {h.status}
                      </Badge>
                    </TD>
                    <TD className="text-xs max-w-[300px] truncate" title={h.mensagem}>
                      {h.mensagem}
                    </TD>
                    <TD className="text-right text-xs">{h.duracao_ms ?? "-"}ms</TD>
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
