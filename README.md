# IBS/CBS Fiscal — Reforma Tributária

Sistema completo para apuração de **IBS** e **CBS** (Lei Complementar 214/2025) com geração de
**SPED EFD ICMS/IPI** incluindo o novo **Bloco N**, controle de obrigações acessórias, motor de
classificação por regras e regime tributário, parser de NF-e/CT-e/NFS-e e cálculo paralelo
PIS/COFINS durante a transição.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** + componentes próprios estilo shadcn/ui
- **Supabase** (PostgreSQL) — opcional, com fallback automático para `localStorage`
- **fast-xml-parser** — parsing client-side de XMLs
- **Recharts** — gráficos
- **Lucide-react** — ícones
- Deploy nativo no **Vercel**

## Modos de execução

O sistema funciona em dois modos:

1. **Com Supabase configurado** — persistência em PostgreSQL (recomendado para produção).
2. **Sem Supabase** — fallback automático em `localStorage` do navegador (modo demonstração).
   Útil para testar imediatamente sem configurar backend.

## Estrutura

```
/app                       # rotas Next.js (App Router)
  page.tsx                 # Dashboard
  /empresa                 # Cadastro
  /captura                 # Upload e parser XML
  /documentos              # Lista + detalhe
  /classificacao           # Painel de classificação IBS/CBS
  /apuracao                # Apurações mensais (lista + detalhe)
  /sped                    # Arquivos SPED gerados
  /obrigacoes              # Calendário fiscal
  /regras                  # Motor de regras
  /relatorios              # Livros e demonstrativos
  /api/health              # Endpoint de saúde
/lib
  supabase.ts              # Cliente Supabase
  storage.ts               # Camada com fallback localStorage
  xml-parser.ts            # NF-e / CT-e / NFS-e
  classificador.ts         # Motor de classificação por regras
  apuracao-engine.ts       # Cálculo da apuração mensal
  sped-generator.ts        # Gerador SPED com Bloco N
  transicao.ts             # Tabela de transição 2026–2033
  aliquotas.ts             # Alíquotas por UF + CSTs + naturezas
  utils.ts                 # Formatadores BRL, MD5, helpers
/components
  /ui                      # Botão, Card, Input, Select, Tabs, Dialog, Table, Toast, Badge, Label
  Sidebar.tsx              # Navegação lateral
/types/index.ts            # Tipos globais
/supabase/schema.sql       # Schema completo PostgreSQL com RLS e seed
```

## Instalação local

```bash
# 1) Dependências
npm install

# 2) Variáveis de ambiente (opcional — sem isso usa localStorage)
cp .env.example .env.local
# edite NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY

# 3) Schema no Supabase (apenas se for usar Supabase)
# acesse o SQL Editor do Supabase e execute /supabase/schema.sql

# 4) Dev server
npm run dev
# http://localhost:3000
```

## Deploy no Vercel

1. Push do código para um repositório GitHub.
2. **Vercel → Import Project** e selecione o repositório.
3. Em *Environment Variables*, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy.

## Fluxo de uso

1. **Cadastrar empresa** (`/empresa`) — CNPJ, regime, UF, alíquotas.
2. **Importar XMLs** (`/captura`) — parsing 100% client-side. Ao importar, o sistema
   já aplica classificação automática e calcula CBS/IBS por item conforme a fase de transição.
3. **Classificar pendentes** (`/classificacao`) — itens não decididos automaticamente.
   Crie regras a partir das decisões para automatizar futuros itens.
4. **Gerar/atualizar apuração** (`/apuracao`) — escolha o período e clique em *Gerar*.
5. **Detalhe da apuração** (`/apuracao/[mes]`) — revise débitos, créditos, IBS por ente,
   PIS/COFINS paralelo. Feche o período e gere o SPED.
6. **Baixar SPED** (`/sped/[id]`) — preview com syntax highlighting por bloco e download `.txt`.
7. **Obrigações** (`/obrigacoes`) — calendário fiscal por regime tributário.
8. **Relatórios** (`/relatorios`) — livros entrada/saída, demonstrativo de créditos,
   PIS/COFINS paralelo. Exportação CSV e impressão PDF.

## Regras de negócio implementadas

- **Regime tributário**: LR / LP / SN / MEI — afeta crédito, CST e SPED.
- **CRT do fornecedor**: SN sem destaque → crédito presumido (~3% CBS, ~1,2% IBS).
- **Lucro Presumido novo direito a crédito integral** (alerta visual).
- **Tabela de transição 2026–2033**: percentuais efetivos aplicados sobre alíquotas plenas.
- **CSTs IBS/CBS**: 01/02/03/04/05/06/07/40/41/42/43/44/70/71/72/99.
- **Bloco N completo**: N001/N100/N110/N120/N130/N140/N150/N160/N170/N190.
- **Classificação automática 4 passos**: regime → CRT → regras cadastradas → CFOP fallback.

## Limitações da v1.0

- 1 empresa cadastrada (escalável via futuras alterações de schema).
- Volume sugerido: até 100 NFs/mês (free tier Supabase).
- Upload manual de XMLs (sem integração SEFAZ).
- Alíquotas IBS por município com tabela base — a tabela oficial será publicada pelo Comitê Gestor.
- Crédito presumido SN: percentuais provisórios (~3% / 1,2%) sujeitos a regulamentação.
- SPED com Bloco N: layout final sujeito a publicação oficial RFB.

## Módulo Fiscal (captura, consulta, conciliação)

Implementado em paralelo ao parser manual, o módulo fiscal cobre:

### Captura automática
- **`POST /api/sefaz/poll`** e **`GET /api/sefaz/cron`** — DF-e (NFeDistribuicaoDFe) por NSU, retorna XMLs gzipados.
- **`POST /api/nfse/poll`** e **`GET /api/nfse/cron`** — Portal Nacional NFS-e (RFB) + ABRASF municipal em paralelo.
- **`POST /api/nfse/abrasf`** — Conector ABRASF v2.02/2.04 (28+ capitais mapeadas em `lib/abrasf-municipios.ts`).
- **`POST /api/sefaz/webhook`** — recebe push assíncrono (XML cru ou JSON) de integradores.

### Consultas síncronas (Certificado A1 obrigatório)
- **`POST /api/nfe/consulta-chave`** — `NfeConsultaProtocolo4`: consulta status/protocolo de NF-e/CT-e por chave (44 dígitos).
- **`POST /api/nfe/cadastro`** — `CadConsultaCadastro4`: consulta cadastro ICMS (CNPJ/CPF/IE) por UF.
- **`POST /api/nfe/status-servico`** — `NfeStatusServico4`: diagnóstico de disponibilidade SEFAZ.
- **`GET  /api/consultas`** — histórico de todas as consultas realizadas (`documento_consultas`).

### Bridge e conciliação
- **`POST /api/documentos/parse`** — converte XMLs brutos (`documentos_fiscais`) em `documentos` + `itens_documento`
  para classificação/apuração. Roda como cron diário (`30 0 * * *`).
- **`POST /api/conciliacao`** — confronta capturados × escriturados × apuração de um período (`YYYY-MM`)
  e gera divergências quando há diferença significativa de CBS/IBS.
- **View `v_documentos_consolidado`** — visão SQL que cruza captura/escrita por chave de acesso.

### UI
- `/captura-sefaz` — configurar Certificado A1, polling DF-e, NFS-e e webhook.
- `/consultas` — consulta manual por chave / CNPJ + histórico das consultas.
- `/conciliacao` — dashboard de conciliação fiscal mensal.

### Tabelas adicionadas
- `documentos_fiscais` — XMLs brutos capturados (chave única).
- `documento_consultas` — histórico (NFE_CHAVE, CADASTRO_CNPJ, STATUS_SERVICO, WEBHOOK, etc.).
- `conciliacao_periodo` — resultado mensal da conciliação (1 linha por empresa+período).
- `nfse_abrasf_config` — municípios ABRASF habilitados por empresa.
- `captura_sefaz_config` — config de captura por empresa (cert, NSU, intervalos).

### Variáveis de ambiente (Vercel)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | Chave pública (front) |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Service role (server-only) |
| `CRON_SECRET` | sim | Auth dos crons (`Authorization: Bearer ...`) |
| `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `SUPABASE_ANON_KEY_SETUP` | não | Usadas apenas por `/api/setup` |
| `SEFAZ_AMBIENTE_DEFAULT` | não | `homologacao` (default) ou `producao` |

### Requisitos legais e técnicos para uso real

- **Certificado Digital A1** (PFX/P12) emitido por AC ICP-Brasil em nome da empresa
  ou com **procuração eletrônica e-CAC** vinculando o CNPJ do contador ao da empresa.
  Carregue via `/captura-sefaz` (gravado em `empresa.pfx_base64` + `empresa.pfx_senha`).
- **Certificado A3** (token/cartão) **não é suportado** server-side — exigiria PKCS#11 e hardware
  acessível ao runtime; em ambiente serverless/Vercel só A1.
- **Procuração eletrônica** registrada no e-CAC (Procurações para a Receita Federal) com poderes:
  - "Consulta a Notas Fiscais Eletrônicas Destinadas" (DF-e)
  - "Consulta de Notas Fiscais de Serviço Eletrônicas (NFS-e)"
- **Limite de uso DF-e**: 1 consulta por empresa a cada 60 minutos (NT 2014.002).
  Por isso o cron está em `0 0 * * *` (diário) no plano Hobby.
- **NFS-e Portal Nacional** (RFB) só atende municípios aderentes; demais usam ABRASF municipal
  (cada prefeitura tem WebService próprio, mapa em `lib/abrasf-municipios.ts`).

### Como configurar e validar

1. Aplique migrations no Supabase (em ordem):
   - `supabase/schema.sql`
   - `supabase/migrations/20260604_add_sefaz_columns.sql`
   - `supabase/migrations/20260604b_abrasf_nfse_config.sql`
   - `supabase/migrations/20260605_fiscal_module.sql`
2. Defina as env vars listadas acima no Vercel ou em `.env.local`.
3. Faça login em `/captura-sefaz`, carregue o `.pfx`, informe a senha e o CNPJ.
4. Execute `POST /api/nfe/status-servico` (em homologação) para validar handshake mTLS.
5. Em homologação: `POST /api/nfe/consulta-chave` com uma chave de teste.
6. Em produção: ative o polling em `/captura-sefaz`. Após captura, rode `/conciliacao` mensal.

### Deploy

```bash
# Linux/macOS
bash scripts/install.sh
bash scripts/deploy.sh           # preview
VERCEL_PROD=1 bash scripts/deploy.sh   # produção

# Windows PowerShell
./scripts/install.ps1
./scripts/deploy.ps1                       # preview
$env:VERCEL_PROD=1; ./scripts/deploy.ps1   # produção
```

## Base legal

- **LC 214/2025** — Reforma Tributária (IBS, CBS, IS).
- **EC 132/2023** — Emenda Constitucional.
- **Guia Prático EFD ICMS/IPI** versão 3.1.8 (Receita Federal).

## Comandos úteis

```bash
npm run dev          # dev server
npm run build        # build produção
npm run start        # serve build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
```


<!-- Deploy trigger: 2026-06-05 - fix node-forge serverExternalPackages -->
