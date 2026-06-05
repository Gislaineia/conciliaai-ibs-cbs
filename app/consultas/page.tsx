"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/app-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { Search, History, Building2, FileSearch } from "lucide-react";

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

interface ConsultaRow {
  id: string;
  tipo: string;
  chave_acesso: string;
  origem: string;
  status: string;
  mensagem: string;
  duracao_ms: number;
  criado_em: string;
}

export default function ConsultasPage() {
  const { empresa } = useApp();
  const { toast } = useToast();
  const [chave, setChave] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [uf, setUf] = useState("SP");
  const [ambiente, setAmbiente] = useState<"homologacao" | "producao">("homologacao");
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [historico, setHistorico] = useState<ConsultaRow[]>([]);

  async function carregarHistorico() {
    if (!empresa) return;
    try {
      const r = await fetch(`/api/consultas?empresa_id=${empresa.id}&limit=50`);
      const d = await r.json();
      setHistorico(d.consultas ?? []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    carregarHistorico();
  }, [empresa?.id]);

  async function consultarChave() {
    if (!empresa) return;
    if (chave.replace(/\D/g, "").length !== 44) {
      toast({ type: "error", title: "Chave deve ter 44 dígitos" });
      return;
    }
    setExecutando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/nfe/consulta-chave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresa.id,
          chave_acesso: chave.replace(/\D/g, ""),
          ambiente,
        }),
      });
      const data = await r.json();
      setResultado(data);
      if (r.ok && data.status === "OK") {
        toast({ type: "success", title: "Consulta concluída", description: data.xMotivo });
      } else {
        toast({ type: "error", title: "Falha", description: data.xMotivo ?? data.mensagem });
      }
      carregarHistorico();
    } catch (e: any) {
      toast({ type: "error", title: "Erro", description: e.message });
    } finally {
      setExecutando(false);
    }
  }

  async function consultarCadastro() {
    if (!empresa) return;
    const c = cnpj.replace(/\D/g, "");
    if (c.length !== 14) {
      toast({ type: "error", title: "CNPJ deve ter 14 dígitos" });
      return;
    }
    setExecutando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/nfe/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresa.id,
          uf,
          cnpj: c,
          ambiente,
        }),
      });
      const data = await r.json();
      setResultado(data);
      if (r.ok && data.status === "OK") {
        toast({ type: "success", title: "Cadastro encontrado", description: data.xMotivo });
      } else {
        toast({ type: "error", title: "Falha", description: data.xMotivo ?? data.mensagem });
      }
      carregarHistorico();
    } catch (e: any) {
      toast({ type: "error", title: "Erro", description: e.message });
    } finally {
      setExecutando(false);
    }
  }

  if (!empresa)
    return <p className="p-8 text-muted-foreground">Selecione uma empresa primeiro.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consultas Fiscais</h1>
        <p className="text-sm text-muted-foreground">
          Consultas síncronas SEFAZ via Certificado A1 — chave de acesso, cadastro CNPJ.
        </p>
      </div>

      <div className="flex gap-2">
        {(["homologacao", "producao"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAmbiente(a)}
            className={`px-3 py-1 text-xs rounded-full font-semibold border transition-colors ${
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="h-4 w-4" /> Consulta NF-e por chave
            </CardTitle>
            <CardDescription>NfeConsultaProtocolo4 (44 dígitos)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="35260612345678000190550010000000011000000010"
              value={chave}
              onChange={(e) => setChave(e.target.value.replace(/\D/g, "").slice(0, 44))}
              className="font-mono text-xs"
            />
            <Button
              onClick={consultarChave}
              disabled={executando || chave.length !== 44}
              className="gap-2"
            >
              <Search className="h-4 w-4" />
              {executando ? "Consultando..." : "Consultar chave"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Consulta cadastro por CNPJ
            </CardTitle>
            <CardDescription>CadConsultaCadastro4 — IE/situação</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Select
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className="w-24"
              >
                {UFS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
              <Input
                placeholder="12.345.678/0001-90"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value.replace(/\D/g, "").slice(0, 14))}
                className="font-mono"
              />
            </div>
            <Button
              onClick={consultarCadastro}
              disabled={executando || cnpj.replace(/\D/g, "").length !== 14}
              className="gap-2"
            >
              <Search className="h-4 w-4" />
              {executando ? "Consultando..." : "Consultar cadastro"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 text-xs mb-3">
              <Badge variant={resultado.status === "OK" ? "success" : "destructive"}>
                {resultado.status}
              </Badge>
              {resultado.cStat && <Badge variant="outline">cStat: {resultado.cStat}</Badge>}
              {resultado.protocolo && (
                <Badge variant="outline">Protocolo: {resultado.protocolo}</Badge>
              )}
              {resultado.duracao_ms && (
                <Badge variant="outline">{resultado.duracao_ms}ms</Badge>
              )}
            </div>
            {resultado.xMotivo && (
              <p className="text-sm mb-3">
                <strong>xMotivo:</strong> {resultado.xMotivo}
              </p>
            )}
            <pre className="text-[10px] font-mono bg-muted p-3 rounded overflow-auto max-h-72">
              {resultado.xml_resposta ?? JSON.stringify(resultado, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Histórico ({historico.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma consulta registrada.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Quando</TH>
                  <TH>Tipo</TH>
                  <TH>Chave / CNPJ</TH>
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
                    <TD className="text-xs font-mono max-w-[260px] truncate">
                      {h.chave_acesso}
                    </TD>
                    <TD>
                      <Badge
                        variant={h.status === "OK" ? "success" : "destructive"}
                      >
                        {h.status}
                      </Badge>
                    </TD>
                    <TD className="text-xs max-w-[280px] truncate" title={h.mensagem}>
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
