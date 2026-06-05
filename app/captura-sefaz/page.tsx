"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useApp } from "@/lib/app-context";
import { salvarCapturaSefaz, getCapturaSefaz } from "@/lib/storage";
import { Activity, Radio, Save, RefreshCw, Power, AlertCircle } from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────
interface LogEntry { ts: string; tipo: "info"|"ok"|"erro"|"aviso"; msg: string; }

// ─── Helper: adiciona log ─────────────────────────────────────────────────
function novoLog(set: React.Dispatch<React.SetStateAction<LogEntry[]>>, tipo: LogEntry["tipo"], msg: string) {
    set(p => [{ ts: new Date().toLocaleTimeString("pt-BR"), tipo, msg }, ...p].slice(0, 150));
}

export default function CapturaSefazPage() {
    const { empresa } = useApp();

  // ── Config certificado ──
  const [pfxBase64, setPfxBase64] = useState<string|null>(null);
    const [pfxSenha,  setPfxSenha]  = useState("");
    const [pfxNome,   setPfxNome]   = useState("Nenhum ficheiro selecionado");
    const [pfxVal,    setPfxVal]    = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

  // ── Config captura NF-e/CT-e ──
  const [cnpj,         setCnpj]         = useState("");
    const [modo,         setModo]         = useState<"WEBHOOK"|"POOLING"|"AMBOS">("AMBOS");
    const [webhookAtivo, setWebhookAtivo] = useState(false);
    const [pollingAtivo, setPollingAtivo] = useState(false);
    const [intervalo,    setIntervalo]    = useState(60);
    const [ambiente,     setAmbiente]     = useState<"homologacao"|"producao">("homologacao");

  // ── Config NFS-e ──
  const [nfseAtivo,  setNfseAtivo]  = useState(false);
    const [nfseInicio, setNfseInicio] = useState("");
    const [nfseFim,    setNfseFim]    = useState("");

  // ── Estado runtime ──
  const [ultNSU,       setUltNSU]       = useState("000000000000000");
    const [totalCap,     setTotalCap]     = useState(0);
    const [ultimaExec,   setUltimaExec]   = useState<string|null>(null);
    const [ultimoStatus, setUltimoStatus] = useState<string|null>(null);
    const [rodando,      setRodando]      = useState(false);
    const [nfseRodando,  setNfseRodando]  = useState(false);
    const [salvando,     setSalvando]     = useState(false);
    const [logs,         setLogs]         = useState<LogEntry[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
    const execRef  = useRef(false);

  // ── Carrega configuração salva ──
  useEffect(() => {
        if (!empresa) return;
        (async () => {
                const c = await getCapturaSefaz(empresa.id);
                if (!c) return;
                setCnpj(c.cnpj ?? empresa.cnpj ?? "");
                setModo(c.modo ?? "AMBOS");
                setWebhookAtivo(c.webhook_ativo ?? false);
                setPollingAtivo(c.pooling_ativo ?? false);
                setIntervalo(c.intervalo_pooling_min ?? 60);
                setAmbiente(c.ambiente ?? "homologacao");
                setNfseAtivo(c.nfse_ativo ?? false);
                setUltNSU(c.ult_nsu ?? "000000000000000");
                setTotalCap(c.total_capturados ?? 0);
                setPfxVal(c._a1_validade ?? "");
                setPfxNome(c._a1_nome ? `${c._a1_nome} (carregado)` : "Nenhum ficheiro selecionado");
        })();
  }, [empresa?.id]);

  // ── Lê arquivo .pfx ──
  function handlePfx(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        if (!f) return;
        setPfxNome(f.name);
        const r = new FileReader();
        r.onload = () => setPfxBase64((r.result as string).split(",")[1]);
        r.readAsDataURL(f);
  }

  // ── Salva configuração ──
  async function salvar() {
        if (!empresa) return;
        setSalvando(true);
        try {
                await salvarCapturaSefaz({
                          id: empresa.id,
                          empresa_id: empresa.id,
                          cnpj,
                          modo,
                          webhook_ativo:       webhookAtivo,
                          pooling_ativo:       pollingAtivo,
                          intervalo_pooling_min: intervalo,
                          ambiente,
                          nfse_ativo:          nfseAtivo,
                          ult_nsu:             ultNSU,
                          total_capturados:    totalCap,
                          _a1_carregado:       !!pfxBase64,
                          _a1_nome:            pfxNome,
                          _a1_validade:        pfxVal,
                });
                novoLog(setLogs, "ok", "Configuracao salva com sucesso.");
        } catch (e: any) {
                novoLog(setLogs, "erro", `Erro ao salvar: ${e.message}`);
        } finally {
                setSalvando(false);
        }
  }

  // ── Executa poll manual ──
  const executarPoll = useCallback(async () => {
        if (execRef.current || !empresa) return;
        if (!pfxBase64 || !pfxSenha) {
                novoLog(setLogs, "erro", "Carregue o certificado .pfx e informe a senha antes de executar.");
                return;
        }
        execRef.current = true;
        setRodando(true);
        const agora = new Date().toLocaleString("pt-BR");
        setUltimaExec(agora);
        setUltimoStatus("executando");
        novoLog(setLogs, "info", `Iniciando polling SEFAZ | NSU atual: ${ultNSU} | Ambiente: ${ambiente}`);

                                       try {
                                               const res = await fetch("/api/sefaz/poll", {
                                                         method: "POST",
                                                         headers: { "Content-Type": "application/json" },
                                                         body: JSON.stringify({
                                                                     empresa_id: empresa.id,
                                                                     cnpj:       cnpj || empresa.cnpj,
                                                                     pfx_base64: pfxBase64,
                                                                     pfx_senha:  pfxSenha,
                                                                     ult_nsu:    ultNSU,
                                                                     ambiente,
                                                         }),
                                               });

          const data = await res.json();
                                               if (!res.ok) throw new Error(data.mensagem ?? `HTTP ${res.status}`);

          const novos = data.total_capturados ?? 0;
                                               setUltNSU(data.ult_nsu ?? ultNSU);
                                               setTotalCap(p => p + novos);
                                               setUltimoStatus(novos > 0 ? `${novos} novo(s)` : "sem novidades");
                                               novoLog(setLogs, novos > 0 ? "ok" : "info",
                                                               novos > 0
                                                                 ? `${novos} documento(s) capturado(s). Novo NSU: ${data.ult_nsu}`
                                                                 : `Nenhum documento novo. NSU: ${data.ult_nsu}`
                                                             );
                                               if (data.tem_mais) novoLog(setLogs, "aviso", "Ha mais documentos. Proximo ciclo continuara a partir do NSU atual.");
                                       } catch (e: any) {
                                               setUltimoStatus("erro");
                                               novoLog(setLogs, "erro", `Falha no polling: ${e.message}`);
                                       } finally {
                                               setRodando(false);
                                               execRef.current = false;
                                       }
  }, [empresa, pfxBase64, pfxSenha, cnpj, ultNSU, ambiente]);

  // ── Timer automatico ──
  useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (pollingAtivo && (modo === "POOLING" || modo === "AMBOS")) {
                novoLog(setLogs, "info", `Polling automatico ativado — intervalo: ${intervalo} min`);
                timerRef.current = setInterval(executarPoll, intervalo * 60 * 1000);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [pollingAtivo, modo, intervalo, executarPoll]);

  // ── Executa NFS-e ──
  async function executarNfse() {
        if (!empresa || !pfxBase64 || !pfxSenha) {
                novoLog(setLogs, "erro", "Certificado ou senha nao informados.");
                return;
        }
        setNfseRodando(true);
        novoLog(setLogs, "info", `Buscando NFS-e de ${nfseInicio} a ${nfseFim}...`);
        try {
                const res = await fetch("/api/nfse/poll", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                                      empresa_id:  empresa.id,
                                      cnpj:        cnpj || empresa.cnpj,
                                      pfx_base64:  pfxBase64,
                                      pfx_senha:   pfxSenha,
                                      data_inicio: nfseInicio,
                                      data_fim:    nfseFim,
                                      ambiente,
                          }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.mensagem ?? `HTTP ${res.status}`);
                novoLog(setLogs, "ok", `NFS-e: ${data.total} documento(s) capturado(s).`);
        } catch (e: any) {
                novoLog(setLogs, "erro", `Falha NFS-e: ${e.message}`);
        } finally {
                setNfseRodando(false);
        }
  }

  const dominio = typeof window !== "undefined" ? window.location.origin : "https://seu-dominio.com";
    const webhookUrl = `${dominio}/api/sefaz/webhook`;

  if (!empresa) return <p className="p-8 text-gray-500">Selecione uma empresa primeiro.</p>;
  
    const corStatus: Record<string,string> = {
          executando: "bg-blue-100 text-blue-700",
          erro:       "bg-red-100 text-red-700",
    };
    const corLog: Record<LogEntry["tipo"],string> = {
          info: "text-blue-600", ok: "text-green-600", erro: "text-red-500", aviso: "text-yellow-600",
    };
  
    return (
          <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
          
            {/* Cabecalho */}
                <div className="flex items-start justify-between">
                        <div>
                                  <h1 className="text-2xl font-bold flex items-center gap-2">
                                              <Radio className="w-6 h-6 text-blue-600" /> Captura SEFAZ
                                  </h1>h1>
                                  <p className="text-sm text-gray-500 mt-1">
                                              NF-e/CT-e via DF-e (SOAP + Certificado A1) e NFS-e via Portal Nacional RFB.
                                  </p>p>
                        </div>div>
                        <div className="flex gap-2">
                          {(["homologacao","producao"] as const).map(a => (
                        <button key={a} onClick={() => setAmbiente(a)}
                                        className={`px-3 py-1 text-xs rounded-full font-semibold border transition-colors ${
                                                          ambiente === a
                                                            ? a === "producao" ? "bg-green-600 text-white border-green-600" : "bg-yellow-500 text-white border-yellow-500"
                                                            : "bg-white text-gray-500 border-gray-300"}`}>
                          {a === "producao" ? "Producao" : "Homologacao"}
                        </button>button>
                      ))}
                        </div>div>
                </div>div>
          
            {/* Certificado A1 */}
                <section className="rounded-xl border border-gray-200 p-5 space-y-3">
                        <h2 className="font-semibold text-gray-800">Certificado Digital A1</h2>h2>
                        <div className="flex items-center gap-3">
                                  <button onClick={() => fileRef.current?.click()}
                                                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                                              Escolher ficheiro
                                  </button>button>
                                  <span className="text-sm text-gray-500">{pfxNome}</span>span>
                          {pfxBase64 && <span className="text-xs text-green-600 font-medium">Carregado</span>span>}
                                  <input ref={fileRef} type="file" accept=".pfx,.p12" className="hidden" onChange={handlePfx} />
                        </div>div>
                        <input type="password" value={pfxSenha} onChange={e => setPfxSenha(e.target.value)}
                                    placeholder="Senha do certificado .pfx"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <div className="flex gap-3 items-center">
                                  <label className="text-sm text-gray-600">Validade:</label>label>
                                  <input type="date" value={pfxVal} onChange={e => setPfxVal(e.target.value)}
                                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        </div>div>
                        <input type="text" value={cnpj} onChange={e => setCnpj(e.target.value.replace(/\D/g,"").slice(0,14))}
                                    placeholder="CNPJ da empresa (14 digitos sem pontuacao)"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </section>section>
          
            {/* Modo de captura NF-e / CT-e */}
                <section className="rounded-xl border border-gray-200 p-5 space-y-3">
                        <h2 className="font-semibold text-gray-800">Captura NF-e / CT-e</h2>h2>
                        <select value={modo} onChange={e => setModo(e.target.value as typeof modo)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                  <option value="WEBHOOK">Apenas WebHook</option>option>
                                  <option value="POOLING">Apenas Polling</option>option>
                                  <option value="AMBOS">Ambos (recomendado)</option>option>
                        </select>select>
                        <div className="flex gap-6">
                                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                                              <input type="checkbox" checked={webhookAtivo} onChange={e => setWebhookAtivo(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                                              WebHook ativo
                                  </label>label>
                                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                                              <input type="checkbox" checked={pollingAtivo} onChange={e => setPollingAtivo(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                                              Polling ativo
                                  </label>label>
                        </div>div>
                  {(modo === "WEBHOOK" || modo === "AMBOS") && (
                      <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">URL do WebHook (configure na SEFAZ)</label>label>
                                  <div className="flex gap-2">
                                                <input readOnly value={webhookUrl}
                                                                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50" />
                                                <button onClick={() => navigator.clipboard.writeText(webhookUrl)}
                                                                  className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Copiar</button>button>
                                  </div>div>
                      </div>div>
                        )}
                  {(modo === "POOLING" || modo === "AMBOS") && (
                      <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Intervalo do Polling (minutos)</label>label>
                                  <input type="number" min={5} max={1440} value={intervalo} onChange={e => setIntervalo(Number(e.target.value))}
                                                  className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                      </div>div>
                        )}
                </section>section>
          
            {/* NFS-e Nacional */}
                <section className="rounded-xl border border-gray-200 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                                  <h2 className="font-semibold text-gray-800">Portal Nacional NFS-e (RFB)</h2>h2>
                                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                                              <input type="checkbox" checked={nfseAtivo} onChange={e => setNfseAtivo(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                                              Ativo
                                  </label>label>
                        </div>div>
                  {nfseAtivo && (
                      <div className="space-y-3">
                                  <div className="flex gap-3">
                                                <div className="flex-1">
                                                                <label className="block text-xs text-gray-500 mb-1">Data inicio</label>label>
                                                                <input type="date" value={nfseInicio} onChange={e => setNfseInicio(e.target.value)}
                                                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                                                </div>div>
                                                <div className="flex-1">
                                                                <label className="block text-xs text-gray-500 mb-1">Data fim</label>label>
                                                                <input type="date" value={nfseFim} onChange={e => setNfseFim(e.target.value)}
                                                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                                                </div>div>
                                  </div>div>
                                  <button onClick={executarNfse} disabled={nfseRodando}
                                                  className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                                    {nfseRodando ? "Buscando..." : "Buscar NFS-e agora"}
                                  </button>button>
                      </div>div>
                        )}
                </section>section>
          
            {/* Status & Execucao */}
                <section className="rounded-xl border border-gray-200 p-5 space-y-3">
                        <div className="flex items-center gap-2">
                                  <Activity className="w-5 h-5 text-gray-500" />
                                  <h2 className="font-semibold text-gray-800">Status & Execucao</h2>h2>
                          {rodando && <span className="ml-auto text-xs text-blue-600 animate-pulse flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"/> Executando...</span>span>}
                        </div>div>
                        <div className="grid grid-cols-2 gap-3">
                                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                                              <p className="text-xs text-gray-500 mb-1">Total capturado</p>p>
                                              <p className="text-2xl font-bold">{totalCap}</p>p>
                                  </div>div>
                                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                                              <p className="text-xs text-gray-500 mb-1">Ultima execucao</p>p>
                                              <p className="text-sm font-medium">{ultimaExec ?? "—"}</p>p>
                                  </div>div>
                                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                                              <p className="text-xs text-gray-500 mb-1">Ultimo status</p>p>
                                    {ultimoStatus
                                                    ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${corStatus[ultimoStatus] ?? "bg-green-100 text-green-700"}`}>{ultimoStatus}</span>span>
                                                : <p className="text-sm text-gray-400">—</p>p>}
                                  </div>div>
                                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                                              <p className="text-xs text-gray-500 mb-1">Ultimo NSU</p>p>
                                              <p className="text-xs font-mono">{ultNSU === "000000000000000" ? "inicio" : ultNSU}</p>p>
                                  </div>div>
                        </div>div>
                        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                                  <p className="text-xs text-blue-600 font-medium mb-1">URL WebHook (configure na SEFAZ)</p>p>
                                  <p className="text-xs font-mono text-blue-800 break-all">{webhookUrl}</p>p>
                        </div>div>
                        <button onClick={() => { setUltNSU("000000000000000"); setTotalCap(0); novoLog(setLogs,"aviso","NSU e contador resetados."); }}
                                    className="text-xs text-gray-400 hover:text-orange-500 underline">
                                  Resetar NSU (reconsultar todos)
                        </button>button>
                </section>section>
          
            {/* Botao polling */}
                <button onClick={executarPoll} disabled={rodando || !pfxBase64}
                          className="flex items-center gap-2 px-5 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm">
                        <RefreshCw className={`w-4 h-4 ${rodando ? "animate-spin" : ""}`} />
                  {rodando ? "Executando..." : "Executar polling agora"}
                </button>button>
          
            {/* Log */}
            {logs.length > 0 && (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                                          <span className="text-xs font-semibold text-gray-500 uppercase">Log ({logs.length})</span>span>
                                          <button onClick={() => setLogs([])} className="text-xs text-gray-400 hover:text-red-500">Limpar</button>button>
                              </div>div>
                              <div className="max-h-52 overflow-y-auto p-2 space-y-1 font-mono text-xs">
                                {logs.map((l, i) => (
                                    <div key={i} className="flex gap-2">
                                                    <span className="text-gray-400 shrink-0 w-16">{l.ts}</span>span>
                                                    <span className={corLog[l.tipo]}>{l.msg}</span>span>
                                    </div>div>
                                  ))}
                              </div>div>
                    </div>div>
                )}
          
            {/* Salvar */}
                <div className="sticky bottom-4 flex justify-end">
                        <button onClick={salvar} disabled={salvando}
                                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 shadow-lg disabled:opacity-50">
                                  <Save className="w-4 h-4" />
                          {salvando ? "Salvando..." : "Salvar configuracao"}
                        </button>button>
                </div>div>
          </div>div>
        );
}</p>
