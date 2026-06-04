"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useApp } from "@/lib/app-context";
import { getCapturaSefaz, saveCapturaSefaz } from "@/lib/storage";
import type { CapturaSefazConfig } from "@/types";
import { Radio, Save, Upload, AlertCircle, Activity, Power, RefreshCw } from "lucide-react";

export default function CapturaSefazPage() {
  const { toast } = useToast();
  const { empresa } = useApp();
  const [cfg, setCfg] = useState<CapturaSefazConfig>({
    id: "",
    empresa_id: "",
    certificado_a1_carregado: false,
    webhook_ativo: false,
    pooling_ativo: false,
    pooling_intervalo_min: 60,
    total_capturados: 0,
    modo: "POOLING",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [certNome, setCertNome] = useState("");

  useEffect(() => {
    if (!empresa) return;
    (async () => {
      const c = await getCapturaSefaz(empresa.id);
      if (c) {
        setCfg(c);
        setCertNome(c.certificado_a1_nome ?? "");
      } else {
        setCfg({ ...cfg, empresa_id: empresa.id });
      }
      setLoading(false);
    })();
  }, [empresa?.id]);

  async function salvar() {
    if (!empresa) return;
    setSaving(true);
    try {
      const saved = await saveCapturaSefaz({ ...cfg, empresa_id: empresa.id });
      setCfg(saved);
      toast({ type: "success", title: "Configuração salva" });
    } catch (e) {
      toast({ type: "error", title: "Erro", description: String((e as Error).message) });
    } finally {
      setSaving(false);
    }
  }

  function uploadCert(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pfx")) {
      toast({ type: "error", title: "Arquivo inválido", description: "Selecione um .pfx (Certificado A1)" });
      return;
    }
    setCertNome(file.name);
    setCfg({
      ...cfg,
      certificado_a1_nome: file.name,
      certificado_a1_carregado: true,
      // validade real exigiria parsing do .pfx no servidor
      certificado_a1_validade: cfg.certificado_a1_validade ?? null,
    });
    toast({ type: "info", title: "Certificado carregado", description: "Salve para persistir a configuração." });
  }

  function executarPooling() {
    if (!cfg.pooling_ativo && !cfg.webhook_ativo) {
      toast({ type: "warning", title: "Ative o pooling ou webhook primeiro" });
      return;
    }
    // Simulação: marca ultima_execucao
    saveCapturaSefaz({
      ...cfg,
      ultima_execucao: new Date().toISOString(),
      ultimo_status: "ok",
      ultimo_erro: null,
    }).then((s) => {
      setCfg(s);
      toast({ type: "success", title: "Captura simulada", description: "Em produção, executaria a chamada real à SEFAZ." });
    });
  }

  if (!empresa) return <div>Selecione uma empresa primeiro.</div>;
  if (loading) return <div>Carregando...</div>;

  const certVencida = cfg.certificado_a1_validade && new Date(cfg.certificado_a1_validade) < new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Radio className="h-6 w-6" /> Captura SEFAZ
        </h1>
        <p className="text-sm text-muted-foreground">
          Captura automática de NF-e/NFS-e/CT-e via Web Hook (escuta) + Pooling (fallback). Certificado A1 da empresa.
        </p>
      </div>

      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3 text-sm">
            <AlertCircle className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-900">Modo simulado:</strong> a integração real com a API SEFAZ requer back-end dedicado
              (Node.js com agente A1 + assinatura SOAP) e parametrização por estado. Esta tela já registra a configuração e
              hooks de execução. Os endpoints `/api/sefaz/webhook` e `/api/sefaz/poll` recebem as chamadas externas.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Certificado Digital A1</CardTitle>
          <CardDescription>Arquivo .pfx + senha cadastrada com segurança no back-end.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <Label>Arquivo .pfx</Label>
              <Input type="file" accept=".pfx" onChange={uploadCert} />
              {certNome && <p className="text-xs text-muted-foreground mt-1">Carregado: {certNome}</p>}
            </div>
            <div>
              <Label>Validade</Label>
              <Input
                type="date"
                value={cfg.certificado_a1_validade ?? ""}
                onChange={(e) => setCfg({ ...cfg, certificado_a1_validade: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant={cfg.certificado_a1_carregado ? "success" : "outline"}>
              {cfg.certificado_a1_carregado ? "Carregado" : "Não carregado"}
            </Badge>
            {certVencida && <Badge variant="destructive">VENCIDO</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modo de captura</CardTitle>
          <CardDescription>
            Web Hook = baixa latência (notificação push). Pooling = fallback periódico.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Modo</Label>
              <Select value={cfg.modo} onChange={(e) => setCfg({ ...cfg, modo: e.target.value as CapturaSefazConfig["modo"] })}>
                <option value="WEBHOOK">Apenas WebHook</option>
                <option value="POOLING">Apenas Pooling</option>
                <option value="AMBOS">Ambos (recomendado)</option>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <input id="wh" type="checkbox" checked={cfg.webhook_ativo} onChange={(e) => setCfg({ ...cfg, webhook_ativo: e.target.checked })} />
              <Label htmlFor="wh" className="mb-0 cursor-pointer">WebHook ativo</Label>
            </div>
            <div className="flex items-end gap-2">
              <input id="po" type="checkbox" checked={cfg.pooling_ativo} onChange={(e) => setCfg({ ...cfg, pooling_ativo: e.target.checked })} />
              <Label htmlFor="po" className="mb-0 cursor-pointer">Pooling ativo</Label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>URL do WebHook (recebe push da SEFAZ)</Label>
              <Input
                value={cfg.webhook_url ?? ""}
                onChange={(e) => setCfg({ ...cfg, webhook_url: e.target.value })}
                placeholder="https://seu-dominio.com/api/sefaz/webhook"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Endpoint público que aceita POST com XML. Sugestão: <code>/api/sefaz/webhook</code>
              </p>
            </div>
            <div>
              <Label>Intervalo do Pooling (minutos)</Label>
              <Input
                type="number"
                min={5}
                value={cfg.pooling_intervalo_min}
                onChange={(e) => setCfg({ ...cfg, pooling_intervalo_min: Number(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Status & execução</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total capturado" value={String(cfg.total_capturados)} />
            <Stat label="Última execução" value={cfg.ultima_execucao ? new Date(cfg.ultima_execucao).toLocaleString("pt-BR") : "—"} />
            <Stat label="Último status" value={cfg.ultimo_status ?? "—"} />
            <Stat label="WebHook" value={cfg.webhook_ativo ? "Ativo" : "Inativo"} />
          </div>
          {cfg.ultimo_erro && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm">
              <strong>Último erro:</strong> {cfg.ultimo_erro}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={executarPooling}>
              <RefreshCw className="h-4 w-4" /> Executar pooling agora
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar configuração"}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-mono mt-1">{value}</div>
    </div>
  );
}
