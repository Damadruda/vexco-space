# Vex&Co Lab — Master System Protocol

> **Propósito.** Este archivo es la guía operativa para cualquier Claude (claude.ai, Claude Code, agentes internos) que trabaje sobre este repo. Define arquitectura, convenciones, trampas conocidas y el protocolo obligatorio antes de diseñar o modificar código. Se actualiza al cerrar cada sprint relevante.
>
> **Última reescritura completa:** 23 abril 2026. Alineado con schema y código reales del repo, no con intenciones de roadmap.

---

## 0. Protocolo de diagnóstico antes de diseñar

Antes de proponer crear cualquier endpoint, modelo, servicio, componente o feature nuevo, Claude DEBE confirmar explícitamente que no existe.

**Secuencia obligatoria (ejecutable en batch, una sola ronda):**

```bash
# 1. Endpoints del dominio
find app/api -type f -name "route.ts" | grep -i "<keyword>"

# 2. Modelos Prisma
grep -E "^model " prisma/schema.prisma | grep -i "<keyword>"

# 3. Servicios y lógica de negocio
find lib -type f \( -name "*.ts" -o -name "*.tsx" \) | xargs grep -l "<keyword>"

# 4. Páginas autenticadas
find "app/(authenticated)" -name "page.tsx" -exec grep -l "<keyword>" {} \;

# 5. Migraciones recientes (pista de sprints aplicados)
ls prisma/migrations/ | sort | tail -10
```

**Reglas:**

- Nunca asumir que algo "no existe" sin confirmación explícita del repo.
- Los `userMemories` y checkpoints reflejan intenciones y decisiones, no estado de código. Si userMemory contradice el repo, el repo gana y se reporta la discrepancia.
- Si una búsqueda devuelve resultados, leer los archivos completos antes de proponer arquitectura. No proponer cambios estructurales sobre headers o nombres de archivo.
- Ante ambigüedad sobre si algo está implementado, preguntarle al usuario en vez de asumir.

Este protocolo existe porque el proyecto ha acumulado múltiples casos donde se propuso "crear X" y X ya estaba implementado. Se pierde tiempo y confianza.

---

## 1. Misión y rol

Actúas como Staff Software Engineer (10x) y Arquitecto de IA. Construyes un ecosistema multi-agente robusto, asíncrono, de alta estética. Escribes código modular, DRY, estrictamente tipado en TypeScript. Piensas en sistemas completos, no en parches aislados.

Diego es founder/operador, no desarrollador. Toma decisiones de negocio y funcional. Tú tomas decisiones técnicas y de arquitectura. Los mega-prompts que generas se pegan en Claude Code sin edición — por eso deben ser auto-contenidos, precisos y probados mentalmente antes de entregarse.

---

## 2. Tech Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 (App Router) |
| Lenguaje | TypeScript (strict) |
| UI/Styling | Tailwind CSS + shadcn/ui + Radix UI |
| DB/ORM | Neon PostgreSQL + Prisma 6.x |
| Auth | NextAuth.js 4 (Google OAuth @vexandco.com + Credentials) |
| Storage | AWS S3 (`vexco-lab-files-prod`, eu-west-1, global namespace) |
| LLM T1 (mecánico) | Gemini Flash o Claude Haiku |
| LLM T2 (analítico) | Gemini 2.5 Pro stable + responseSchema |
| LLM T3 (estratégico) | Claude Sonnet / Opus (4.6) |
| Market Intelligence | Perplexity `sonar-pro` con JSON schema |
| Embeddings/reading | Jina AI (tier free OK) |
| Estado cliente | Zustand (ProjectMemory), SWR (fetch cache) |
| Package Manager | **Yarn** (nunca npm) |
| Hosting | Vercel Pro (Fluid Compute, maxDuration 300s) |
| CI/CD | Auto-deploy on push to `main` |

**Producción:** https://vexco-space.vercel.app
**GitHub:** https://github.com/Damadruda/vexco-space (privado)
**Vercel Project:** `prj_8yUzvhXTXwWrTMlxJQ12Hu8Rm25d` · Team: `team_Wu8QNJtiVSG7s4KtfRFjdUmq`

---

## 3. Quiet Luxury Design System

### Paleta estricta

- Fondo: `#FAFAF8` (off-white)
- Texto principal: `#1A1A1A` (charcoal)
- Acento dorado: `#B8860B`
- Sand warm: `#E8E4DE`
- Gold suave: `#C5A572`
- Micro-etiquetas / muted: `#5E5E5E`

### Tipografía

- Headings: `Cormorant Garamond` (serif)
- Body: `Inter` (sans-serif)

### Reglas Zero-UI

- Prohibidos: `border` grises innecesarios, `shadow-md`, fondos de input con color.
- Ghost Inputs: `bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none`
- Estados async: Toasts (Sonner) o punto pulsante `bg-green-500 animate-pulse`. Nunca spinners bloqueantes.
- Clases utilitarias con prefijo `ql-*` para el design system (ej. `ql-charcoal`, `ql-accent`, `ql-cream`, `ql-sand`, `ql-slate`).

---

## 4. Tono Anti-IA (Método Ruben Hassid)

Todo output de agentes pasa por este filtro antes de renderizarse.

- **Regla de 29 palabras:** oraciones cortas. Voz activa. Tono C-Level.
- **Palabras prohibidas:** sumérgete, tapiz, crucial, descubre, imperativo, revolucionario, sinergias.
- **Prohibido renderizar markdown crudo** (`**`, `##`) en la UI final. Mapear a componentes React (Structured Outputs) o al parser correspondiente.

---

## 5. Arquitectura Multi-Agente

### 5.1 Modos de War Room

| Modo | Descripción | Endpoint |
|---|---|---|
| Consulta | Un agente, checkpoint único | `POST /api/projects/[id]/session` + `/session/respond` |
| Estrategia | Supervisor elige agente, 2 checkpoints | `/session` + `/session/respond` |
| Full Debate | 3 fases async (análisis → confrontación → síntesis) | `/debate` + `/debate/respond` |

Componentes UI en `components/expert-panel/`: `ExpertAvatar`, `ExpertList`, `ConsultantsThread`.

### 5.2 Los 5 agentes actuales

| ID | Nombre UI | Rol | Tier |
|---|---|---|---|
| `strategist` | Strategist | Director de orquesta · PM cross | T3 default (Sonnet 4.6) |
| `revenue` | Revenue & Growth | Monetización · crecimiento · contenido | T3 default (Sonnet 4.6) |
| `redteam` | Challenger | Stress-test · contrarian · Variables analógicas | T3 escalated (Opus 4.7) |
| `infrastructure` | Product & Tech | Arquitectura · stack · operaciones | T3 default (Sonnet 4.6) |
| `design` | Design & Experience | UX/UI · brand · entregables visuales | T3 default (Sonnet 4.6) |

> Campo `preferredLLM` en `lib/engine/agents.ts` queda deprecated (compat legacy). El routing real lo decide `tier` + `escalated` vía `resolveTierModel()`. Ver sección 12.

**Aliases de mención:** `@strategist`, `@revenue`, `@challenger` (= redteam), `@product` (= infrastructure), `@design`, `@growth` (= revenue), `@tech` (= infrastructure), `@redteam`.

**Nota histórica:** el proyecto tuvo 8 agentes originalmente (se añadían `navigator`, `innovation`, `workflow`, `narrative`). Se consolidaron a 5 en un sprint de simplificación. Está en backlog considerar restauración con vistas más especializadas ("Sprint restauración agentes").

### 5.3 Flujo Supervisor

```
POST /api/projects/[id]/session
  → supervisorAnalyze() [Gemini Pro — lee ProjectMemory]
  → Checkpoint (Human-in-the-Loop)
  → POST /api/projects/[id]/session/respond {action: "approve"}
  → routeToAgent() [agente especializado]
  → StructuredOutput → UI
```

### 5.4 Fallbacks

- Claude Sonnet sin `ANTHROPIC_API_KEY` → Gemini Flash (warn, no crash).
- Perplexity Sonar sin `PERPLEXITY_API_KEY` → Gemini Flash (warn, no crash).
- Gemini sin `GOOGLE_GENERATIVE_AI_API_KEY` → Error fatal.

---

## 6. Engine modules (`lib/engine/`)

| Archivo | Responsabilidad |
|---|---|
| `agents.ts` | Registro de los 5 agentes: ID, LLM preferido, consultingDNA, skills, outputType. |
| `router.ts` | Enruta plan a agente. Ejecuta skills. Retry con Gemini Flash si falla LLM primario. |
| `supervisor.ts` | Genera SupervisorPlan leyendo ProjectMemory. `FALLBACK_PLAN` si proyecto vacío. |
| `state-machine.ts` | Máquina de estados War Room. Dual-store: Map (hot) + DB (persist, fire-and-forget). |
| `skills.ts` | Skills transversales: research (Perplexity), inspiration (Raindrop), cross-validation. |
| `prompts.ts` | Prompts centralizados para Supervisor y agentes. **`buildAgentPrompt()` es el punto de inyección de M.2b (corpus).** |
| `debate.ts` | Full Debate 3 fases async. `Promise.allSettled` en fases 1 y 2 — un agente fallando no mata el debate. |
| `cross-portfolio.ts` | Análisis cross-portfolio (Strategist). Afinidad entre proyectos, proposición de metaproyectos. |
| `inspiration.ts` | Inyección de inspiración desde Raindrop y FirmInsight cross-project. |
| `types.ts` | Tipos compartidos del engine. |

---

## 7. Firm Corpus — Arquitectura M.2a-PLUS

### 7.1 Filosofía

El Firm Corpus es el **nivel 4 del Knowledge Layer** (los otros tres: Raindrop inspiration, Drive vertical por proyecto, FirmInsight cross-project). Documentos en el corpus son autónomos: sobreviven aunque el proyecto origen se borre.

**Principio fundacional:** si un documento se promueve al corpus es porque afecta a todos los proyectos. Si no aplicara a futuros proyectos, nunca debió haberse promovido.

### 7.2 Pipeline de ingesta (promoción)

```
DriveDocSummary (asociado a proyecto, cascade delete)
   ↓ click "Promover al Corpus" en UI
POST /api/firm-corpus/promote-from-project {driveFileId, projectId}
   ↓
fetchDriveFileMetadata() [metadata fresca vía Drive API]
   ↓
promoteSingleFile() [en lib/services/corpus-importer.ts]
   ├─ routeFile() [decide si va a corpus o a OperationalSource]
   ├─ Stage A: runStageA() [Flash: classification, provenance, industry]
   ├─ Stage B: runStageB() [Pro + responseSchema + REGLA #0.5: entities, summary, frameworks detectados]
   └─ persistDocument() [crea CorpusDocument autónomo, embeddingStatus = PENDING]
```

### 7.3 Endpoints del dominio corpus

| Endpoint | Propósito |
|---|---|
| `GET /api/firm-corpus` | Estado del corpus singleton |
| `GET /api/firm-corpus/status` | Stats (total, byType, byOutcome, failedCount, archivedCount) |
| `GET /api/firm-corpus/documents` | Listado con filtros (type, industry, outcome, provenance, archived, reviewed, search) |
| `POST /api/firm-corpus/documents/batch-action` | Acciones en lote (archivar, marcar reviewed, etc.) |
| `POST /api/firm-corpus/promote-from-project` | Promover DriveDocSummary al corpus |
| `GET /api/firm-corpus/promotion-status?projectId=X` | Estados de promoción de los DriveDocs del proyecto |
| `POST /api/firm-corpus/[id]/move-to-operational` | Mover corpus doc a fuentes operacionales |
| `POST /api/firm-corpus/[id]/reprocess` | Reprocesar un doc individual |
| `POST /api/firm-corpus/reprocess-batch` | Reprocesar en lote |
| `POST /api/firm-corpus/reprocess-job/start` · `/tick` · `/cancel` · `/status` | Job de reprocesamiento con tick por cron |
| `POST /api/firm-corpus/reclassify-failed` | Reintentar docs con `EmbeddingStatus = FAILED` |
| `POST /api/firm-corpus/rollback-frameworks` | Rollback de frameworks derivados del corpus |
| `GET /api/firm-corpus/framework-stats` | Stats de frameworks |
| `POST /api/firm-corpus/import` | Import masivo desde carpeta Drive |
| `DELETE /api/firm-corpus/wipe` | Wipe total (operación destructiva) |

### 7.4 Servicios

- `lib/services/firm-corpus.ts` — singleton helper (`getFirmCorpus()`), queries (`getCorpusDocuments()`), stats (`getCorpusStats()`).
- `lib/services/corpus-importer.ts` — orchestrador del pipeline (`promoteSingleFile()`, manejo de batches, fallbacks).
- `lib/firm-corpus/stage-a-classifier.ts` — Stage A (Flash).
- `lib/firm-corpus/stage-b-comprehension.ts` — Stage B (Pro + REGLA #0.5).
- `lib/firm-corpus/file-router.ts` — decide corpus vs operational vs skip.
- `lib/firm-corpus/persist.ts` — persistencia con `sanitizeForPostgres()`.

---

## 8. Market Intelligence Pipeline (MIP)

### 8.1 Función

Briefings semanales autónomos sobre sectores donde **Vex&Co vende** (no sobre sectores donde los clientes operan). Genera oportunidades comerciales, señales de mercado, señales competitivas.

### 8.2 Componentes

- `lib/market-intelligence/executor.ts` — ejecuta un template individual, llama Perplexity con JSON schema, valida con Zod, persiste brief.
- `lib/market-intelligence/scheduler.ts` — elige qué templates corren cuándo.
- `lib/market-intelligence/schemas.ts` — `SCHEMA_REGISTRY` (Zod schemas por tipo de brief).
- `lib/market-intelligence/templates/template-a.ts` — "Radar de Oportunidades Comerciales B2B" (la única activa).

### 8.3 Endpoints

- `GET /api/market-intelligence/list` — listar briefs generados.
- `POST /api/market-intelligence/tick` — endpoint del cron (dual-auth: session o `CRON_SECRET`).

### 8.4 Cron

Disparado por Vercel cron los lunes 05:00 UTC (ver `vercel.json`). Template A está activa. Templates B y C están como sub-entregas pendientes (sprint MIP-1B, MIP-1C).

---

## 8.5 Inbox Pipeline (M.2a-PLUS aplicado)

### 8.5.1 Función

Capturar contenido curado (Raindrop, manual), analizarlo, clasificarlo, y inyectarlo a los agentes del War Room vía tres canales (items vinculados, cross-project trend/discovery, inspiration skill). El Inbox es infraestructura — si falla o alucina, contamina los prompts de todos los agentes.

### 8.5.2 Pipeline en dos etapas

```
Item capturado (Raindrop sync o manual)
   ↓
POST /api/inbox/[id]/analyze
   ├─ Jina extraction si sourceUrl + rawContent < 500 chars
   ├─ Stage A: runInboxStageA() [Flash + enums + few-shot de correcciones usuario]
   │   → { category, relevanceScore, sentiment, language }
   ├─ Stage B: runInboxStageB() [Pro + responseSchema + REGLA #0.5]
   │   → { summary, keyInsights, suggestedTags }
   └─ persistir en AnalysisResult, status = "processed"
```

Módulos:

- `lib/inbox/stage-a-classifier.ts` — Flash 2.5, temperature 0.1, responseSchema estricto. Criterios duros para category (default agresivo a `noise`). Recibe few-shot de últimas 25 correcciones del usuario.
- `lib/inbox/stage-b-analyzer.ts` — Pro 2.5, temperature 0.2, REGLA #0.5 explícita. Genera summary (2-3 oraciones C-Level), keyInsights (3-5 concretos), suggestedTags.
- `lib/inbox/corrections.ts` — `getRecentCorrections()` para few-shot, `recordCorrection()` al recategorizar.

### 8.5.3 Bucle de aprendizaje

Cuando el usuario cambia manualmente la categoría de un item (`PATCH /api/inbox/[id]/recategorize`), se guarda un registro en el modelo `InboxCorrection` con título, summary y tags denormalizados + `oldCategory` + `newCategory`. Los próximos Stage A classifications inyectan las últimas 25 correcciones como few-shot examples, calibrando la clasificación sin fine-tuning ni costo adicional.

### 8.5.4 Batch reprocessing

`POST /api/inbox/reprocess-batch { limit: 20, onlyProcessed: true }` re-corre el pipeline completo sobre items ya procesados (típicamente para limpiar análisis viejos de Flash single-shot). Procesa en chunks de 5 en paralelo con `Promise.allSettled`. `maxDuration 300s` permite hasta 50 items por call.

### 8.5.5 Cómo se consume en el War Room

Ver sección 6 (`buildAgentPrompt`) — el Inbox alimenta los prompts por tres vías:

1. Items con `category=project` vinculados al proyecto actual.
2. Items con `category in [trend, discovery]` y `relevanceScore >= 0.5` sin `projectId` — visibles cross-portfolio.
3. Inspiration skill — dispara búsqueda por keywords cuando el Supervisor lo decide (solo agentes con `usesRaindrop=true`).

### 8.5.6 Deuda técnica conocida

- `lib/background/raindrop-sync.ts` todavía usa el prompt single-shot viejo con Flash. No pasa por el nuevo pipeline. Pendiente sprint "Raindrop Sync Alignment" para alinearlo.
- `/api/inbox/re-evaluate-noise` (re-evaluación de noise cuando se crea proyecto nuevo) sigue usando `callLLM` con gemini-flash. No crítico pero convendría alinearlo también en un sprint posterior.

---

## 9. Upload de archivos (Upload-A)

### 9.1 Arquitectura

Upload local a S3 vía presigned URLs. Dos endpoints:

- `POST /api/projects/[id]/files/presigned` — valida ownership, valida MIME, valida tamaño (`PROJECT_FILE_MAX_SIZE = 26214400` bytes = 25 MiB), genera `fileKey` server-side (`${folderPrefix}project-files/${projectId}/${uuid}-${sanitizedFileName}`), devuelve URL firmada (expiración 5 min).
- `POST /api/projects/[id]/files` — tras PUT exitoso, cliente registra. Valida que `fileKey` empieza con el prefix del proyecto. `HeadObjectCommand` confirma que el PUT ocurrió. Crea `ProjectFile`.
- `GET /api/projects/[id]/files` — listado con URLs de descarga firmadas (1h de expiración).
- `DELETE /api/projects/[id]/files/[fileId]` — borra de S3 y DB.

### 9.2 Defensas validadas

- MIME no permitido → 400.
- Tamaño > 25 MiB → 400.
- Proyecto inexistente o de otro usuario → 404.
- `fileKey` cross-project (tampering) → 400 con mensaje `"fileKey does not belong to this project"`.

### 9.3 Bucket y credenciales

- Bucket: `vexco-lab-files-prod` (global namespace, nombre limpio).
- Región: `eu-west-1`.
- Versioning ON, Block Public Access ON, SSE-S3 default.
- CORS: `AllowedOrigins: ["https://vexco-space.vercel.app", "https://*.vercel.app", "http://localhost:3000"]`, `AllowedHeaders: ["*"]`, `AllowedMethods: [GET, PUT, POST, DELETE, HEAD]`.
- IAM user: `vexco-lab-vercel`, policy inline `VexcoLabBucketAccess`.
- `AWS_FOLDER_PREFIX` no debe existir como env var. El código tiene fallback `?? ""` y es lo esperado.

### 9.4 Endpoint legacy

`POST /api/upload/presigned` + `lib/s3.ts` — endpoint legacy de imágenes. Funciona con las credenciales nuevas, pero `lib/s3.ts` contiene nombres legacy (`getDefaultUserId`) de la era AbacusAI. No prioridad refactorizar.

---

## 10. Modelos Prisma (46 totales)

Resumen por dominio. Para schema completo ver `prisma/schema.prisma`.

**Auth y usuario (5):** `User`, `Account`, `Session`, `VerificationToken`, `UserPreferences`.

**Proyectos y estructura (9):** `Project`, `ProjectFile`, `Milestone`, `AgileTask`, `ChatMessage`, `Note`, `Link`, `Image`, `Idea`.

**Meta-proyectos y portfolio (5):** `MetaProject`, `MetaProjectComponent`, `MetaProjectMilestone`, `CrossPortfolioAnalysis`, `RevenuePriorityEntry`.

**Knowledge Layer (6):** `DriveDocSummary` (con FK a proyecto, cascade delete), `FirmCorpus` (singleton), `CorpusDocument` (autónomo sin FK a proyecto), `FirmInsight`, `OperationalSource`, `KnowledgeBase`.

**Frameworks (4):** `Framework`, `FrameworkSourceDocument`, `FrameworkProject`, `FrameworkUpdate`.

**Prospects y Channels (4):** `Prospect`, `ProspectFit`, `Channel`, `ChannelProject`.

**Market Intelligence (2):** `MarketIntelligenceTemplate`, `MarketIntelligenceBrief`.

**Inbox y análisis (4):** `InboxItem`, `AnalysisResult`, `ConceptInsight`, `PatternCard`.

**Reprocesamiento (1):** `CorpusReprocessJob`.

**Automatización y docs (4):** `AutomationLog`, `StyleVariant`, `DocumentGeneration`, `DecisionLog`.

**War Room (1):** `WarRoomSession`.

**Roadmap (1):** `RoadmapTimeline`.

**Enums relevantes:** `ProjectStatus` (RED/YELLOW/GREEN), `ProjectType`, `TrackType` (GO_TO_MARKET / ONE_TIME_SERVICE), `CorpusDocumentType` (CASE_STUDY, PROPOSAL_WON, PROPOSAL_LOST, PROPOSAL_DORMANT, INDUSTRY_RESEARCH, METHODOLOGY, UNCLASSIFIED), `CorpusOutcome` (WON, LOST, DORMANT, IN_PROGRESS, NA), `Provenance` (OWN, EXTERNAL, MIXED, UNKNOWN), `EmbeddingStatus` (PENDING, PROCESSING, DONE, FAILED), `DecisionOutcome`.

---

## 11. API Endpoints (101 totales)

Resumen de rutas por dominio (secuencias completas en `app/api/`). Para detalle de cada endpoint ver el código; para mapa navegable consultar `ARCHITECTURE.md`.

**Auth:** `/api/auth/[...nextauth]`, `/api/preferences`.

**Proyectos (18):** `/api/projects/*` incluyendo `[id]/drive-docs`, `[id]/files/*` (Upload-A), `[id]/memory`, `[id]/messages`, `[id]/milestones`, `[id]/revenue-priority`, `[id]/session/*`, `[id]/debate/*`, `[id]/summary`, `/revenue-ranking`.

**Firm Corpus (13):** ver sección 7.3.

**Meta-Projects (5):** `/api/meta-projects/*` con `milestones` anidados.

**Intelligence / Cross-Portfolio (7):** `/api/intelligence/cross-portfolio/*` incluyendo `/latest`, `/history`, `/[id]/apply-channel-routing`, `/apply-prospect-routing`, `/instantiate-metaproject`.

**Inbox (8):** `/api/inbox/*` incluyendo `[id]/analyze`, `[id]/recategorize`, `[id]/link-project`, `/sync-raindrop`, `/sync-full`, `/re-evaluate-noise/*`, `/repair-raindrop-ids`.

**Agile (3):** `/api/agile/*` con `/batch`.

**Frameworks (2):** CRUD de `/api/frameworks`.

**Documents (3):** `/api/documents/generate`, `/feedback`, `/styles`.

**Drive (4):** `/api/drive/*` incluyendo `analyze-folder`.

**Prospects y Channels (5):** CRUDs con `/api/prospect-fits`.

**Market Intelligence (2):** ver sección 8.3.

**Operational Sources (3):** CRUD + `/[id]/move-to-corpus`.

**Otros (14):** firm-insights, knowledge, notes, links, images, search, stats, decisions, milestones globales, concept/validate, pm/consult, pm/validate-field, ai/documents, upload/presigned legacy, agents/chat.

**Variables de entorno usadas en código:**

```
DATABASE_URL                          # Neon PostgreSQL pooled — REQUERIDA
NEXTAUTH_SECRET                       # REQUERIDA
NEXTAUTH_URL                          # https://vexco-space.vercel.app
GOOGLE_CLIENT_ID                      # Google OAuth
GOOGLE_CLIENT_SECRET                  # Google OAuth
GOOGLE_GENERATIVE_AI_API_KEY          # Gemini Pro/Flash (principal — es la que usa lib/clients/llm.ts)
GOOGLE_AI_API_KEY                     # Gemini legacy (pm/consult, concept/validate) — misma key o la misma cuenta
ANTHROPIC_API_KEY                     # Claude Sonnet — opcional, fallback a Gemini
PERPLEXITY_API_KEY                    # Perplexity Sonar — opcional, fallback a Gemini
JINA_API_KEY                          # Jina Reader — opcional
AWS_ACCESS_KEY_ID                     # S3 credentials
AWS_SECRET_ACCESS_KEY                 # S3 credentials
AWS_BUCKET_NAME                       # vexco-lab-files-prod
AWS_REGION                            # eu-west-1
AWS_FOLDER_PREFIX                     # NO DEBE EXISTIR como env var (código tiene fallback '?? ""')
CRON_SECRET                           # Para dual-auth de /api/market-intelligence/tick
```

`RAINDROP_TOKEN` NO es env var global — se guarda en `UserPreferences` DB por usuario.

**⚠️ Observación:** `GEMINI_API_KEY` y `ABACUSAI_API_KEY` eran env vars históricas no usadas por el código. `ABACUSAI_API_KEY` ya no aparece en Vercel (eliminada en fecha desconocida anterior al 29-may-2026, confirmado en auditoría). `GEMINI_API_KEY` sigue presente en Vercel (3 instancias: Production, Preview, Development), pendiente de borrado en Sprint 3.

---

## 12. LLM Routing Policy (validada mayo 2026, lineup Claude 4.7 + Gemini 3)

**Implementación:** `lib/clients/llm.ts` exporta `callLLM({ tier, escalated?, tierEngine? })`. Los model IDs viven en `MODEL_IDS` (single source of truth). El enum legacy `model: "gemini-flash" | "gemini-pro" | "gemini-pro-stable" | "gemini-flash-stable" | "claude-sonnet" | "perplexity-sonar"` sigue funcionando mapeado a tier internamente para callers no migrados (`gemini-pro*`→T2, `gemini-flash*`→T1, `claude-sonnet`→T3 default).

### 12.1 Tiers

**T1 — Mecánico:**
- Default: Gemini 3.5 Flash (`gemini-3.5-flash`) — clasificación estructural, enums, tags, triage, smart filter, routing del Supervisor, agent selection del debate.
- Engine alternativo Anthropic: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — pasar `tierEngine: "anthropic"`.
- NUNCA para generar texto que vaya a ser leído por agentes.

**T2 — Analítico:**
- Gemini 3 Pro (`gemini-3.1-pro-preview`) con `responseSchema` — diagnósticos, FirmInsight, Revenue Priority, comprensión profunda (Stage B), MIP executor.
- SIEMPRE con REGLA #0.5 anti-hallucination en el prompt.

**T3 — Estratégico:**
- Default: Claude Sonnet 4.6 (`claude-sonnet-4-6`) — War Room chat (Strategist, Revenue, Product, Design).
- Escalado: Claude Opus 4.7 (`claude-opus-4-7`) — Challenger en debate, fase 3 síntesis del Full Debate, narrativas MetaProject, docs client-facing.

### 12.2 MODEL_IDS (single source of truth en `lib/clients/llm.ts`)

| Referencia | Model ID |
|---|---|
| `geminiT1` (T1 default) | `gemini-3.5-flash` |
| `geminiT2` (T2) | `gemini-3.1-pro-preview` |
| `anthropicT1` (T1 anthropic) | `claude-haiku-4-5-20251001` |
| `anthropicT3Default` (T3 default) | `claude-sonnet-4-6` |
| `anthropicT3Escalated` (T3 escalado) | `claude-opus-4-7` |
| `perplexity` (MIP research) | `sonar-pro` |

Si un provider devuelve `404 model not found`, actualizar el ID en `MODEL_IDS` — es el único punto de cambio.

### 12.3 Prompt caching

- Activado en agentes T3 cuando `systemPrompt.length >= 4000` chars.
- Vía `enablePromptCache: true` en `callLLM` (callers no-streaming) y manualmente en el streaming de `app/api/agents/chat/route.ts` (`cache_control: { type: "ephemeral" }`).
- `LLMResponse.cachedTokens` expone `cache_read_input_tokens` del SDK Anthropic.

### 12.4 Validación

Endpoint `/api/debug/llm-routing` (autenticado): sin params retorna el mapping dry; `?live=1` hace un ping real por cada tier (consume tokens).

### 12.5 Principio M.2a-PLUS

Cualquier pipeline que genere **texto leído por agentes** debe usar T2 con REGLA #0.5, nunca T1. Flash/Haiku solo para clasificación estructural. Flash tiene ~40% de alucinación en tareas narrativas, inaceptable.

---

## 13. REGLA #0.5 — Anti-Hallucination

Aplicada en todos los prompts de Stage B del pipeline de ingesta del Firm Corpus y en los 5 agentes del War Room. Texto canónico:

> PROHIBIDO inventar nombres de empresas, marcas, productos, personas, lugares, cifras o frameworks
> que NO aparezcan literalmente en el texto fuente. Si una informacion no aparece, devuelve null,
> array vacio, o UNKNOWN. Es preferible un output corto y literal que uno completo e inventado.
> La omision es siempre mejor que la invencion.
>
> EXTENSION (Convergencia v2): PROHIBIDO inventar estadisticas de mercado, porcentajes de fracaso,
> tamaños de TAM/SAM/SOM, valoraciones, precios, ratios o cualquier cifra cuantitativa que no
> aparezca literalmente en una fuente citada en el contexto. Si necesitas referirte a un patron
> sin tener la cifra, usa formulaciones cualitativas: "multiples casos documentados", "patron
> observado en proyectos como X, Y", "tendencia identificada en el sector". NUNCA inventes el
> numero, ni siquiera para hacer un argumento mas convincente. Una cifra inventada destruye la
> credibilidad de todo el analisis.

**Aplicación numérica específica (para War Room):**

NUNCA inventes ni estimes cifras cuantitativas que no estén explícitamente en el contexto. Esto incluye: cantidad de archivos/documentos/items, número de contactos/leads/clientes, métricas de mercado (TAM/SAM/SOM), costos/precios/ingresos/valoraciones, fechas concretas/plazos, porcentajes/conversión/CAC/LTV.

Si necesitas referirte a una cantidad y no está en el contexto: di "varios", "múltiples" o "no tengo el dato exacto". Si el contexto sí tiene el dato, úsalo exactamente. Si el usuario pide una cifra que no tienes, dile que no podés saberlo desde el contexto actual y sugerí cómo conseguir ese dato.

---

## 14. Reglas inviolables de configuración

1. **NUNCA** modificar `next.config.js` — rompe el build en Vercel.
2. **NUNCA** añadir `output` ni `binaryTargets` a `prisma/schema.prisma`.
3. `package.json` `postinstall` debe ser SOLO `"prisma generate"` (sin `db push`).
4. **NUNCA** usar npm — solo `yarn add`.
5. **SIEMPRE** leer un archivo antes de modificarlo.
6. **NUNCA** hardcodear valores de `.env` en código — solo `process.env.VARIABLE`.
7. `ignoreBuildErrors: true` en `next.config.js` es legado — no modificar.
8. App Router GET handlers que lean DB deben tener `export const dynamic = 'force-dynamic'`. Sin eso, Next.js 14 pre-renderiza en build time y los endpoints devuelven datos stale.
9. Migraciones en Neon: usar `prisma migrate diff → db execute → migrate resolve --applied`. El shadow DB de Neon no soporta `migrate dev` legacy.
10. Database Safety Lock — INVIOLABLE. Antes de ejecutar prisma migrate dev, prisma migrate reset, prisma db push, prisma db push --accept-data-loss o cualquier comando que modifique schema/datos, validar EXPLICITAMENTE que DATABASE_URL no apunta al host de produccion. El host de produccion de Vex&Co Lab es ep-steep-unit-agd4kb5l-pooler.c-2.eu-central-1.aws.neon.tech. La branch dev del proyecto Neon (host ep-sweet-mode-agjuvpdm-pooler...) es la unica target valida para comandos destructivos locales. Comando de validacion obligatorio antes de cualquier prisma migrate dev|reset|push: grep "^DATABASE_URL" .env.local | sed 's|.*@||; s|/.*||'. Si el output devuelve ep-steep-unit-agd4kb5l-pooler.c-2.eu-central-1.aws.neon.tech, DETENER. NO ejecutar el comando. Reportar a Diego. Ver INCIDENT.md 2026-05-03 para contexto.

---

## 15. Trampas conocidas

### 15.1 Next.js 14 App Router

- **Pre-render por defecto.** GET handlers que acceden a DB se cachean agresivamente. Siempre añadir `export const dynamic = 'force-dynamic';` al inicio.
- **Tipos de params en rutas dinámicas.** Next 14 los declara como `{ params: { id: string } }` síncronos. En Next 15 se vuelven `Promise<>`. El código actual asume Next 14.

### 15.2 Vercel

- **Env vars nunca deben contener expresiones.** Si accidentalmente copias `"folderPrefix ?? """` desde el editor de código al campo de env var, Vercel lo guarda como literal y rompe el sistema silenciosamente. Al crear/editar env vars, siempre verificar que el valor es un literal plano.
- **Variables marcadas "Sensitive" solo se pueden aplicar al crear.** No se puede convertir una existente. Para aplicar Sensitive a una variable existente: eliminar y recrear. Coste alto para beneficio cosmético.
- **`maxDuration = 300s`** está disponible por Fluid Compute. Necesario para `/api/firm-corpus/*` con pipelines de Stage A + B.

### 15.3 Serverless

- **Maps son efímeros.** `new Map()` en top-level de un módulo se reinicia entre invocations. Usar DB para estado persistente.
- **Fire-and-forget es poco fiable.** `promesa.catch(...)` sin `await` puede cortarse cuando el response envía. Usar `await` o colas de trabajo.
- **Output de LLM es no determinista.** Usar regex flexibles, never parse asumiendo formato exacto.

### 15.4 S3 y Upload

- **Bucket naming namespace.** Al crear bucket, AWS ofrece "regional de la cuenta" (fuerza sufijo `{account-id}-{region}-{random}`) vs "global" (nombre limpio, requiere unicidad global). Para single-tenant privado, preferir "global" — higiene de URLs, no expone account ID.
- **CORS con SDK v3.** El SDK añade `x-amz-checksum-crc32` y `x-amz-sdk-checksum-algorithm` automáticamente al PUT. El CORS del bucket debe incluirlos (lo más simple: `AllowedHeaders: ["*"]` para single-tenant privado).
- **Debug de CORS 403.** Si el browser reporta CORS genérico sin detalle, ir a `curl OPTIONS` directo al bucket. S3 devuelve XML diagnóstico (`"CORSResponse: Bucket not found"` es señal clara).

### 15.5 Debug de múltiples bugs superpuestos

Si un sistema falla repetidamente tras un fix aparentemente correcto, la hipótesis por defecto no debe ser "el fix no funcionó". Debe ser "hay un siguiente bug detrás que el fix recién desbloqueó la visibilidad de". Upload-A tuvo 4 bugs independientes en 4 capas distintas; cada fix revelaba el siguiente.

### 15.6 DATABASE_URL local apuntando a produccion

Trampa. Por simplicidad historica, .env.local puede haber quedado apuntando al mismo host de Neon que usa Vercel para produccion (ep-steep-unit-agd4kb5l). Eso convierte cualquier comando destructivo de Prisma corrido localmente (migrate dev, migrate reset, db push) en un wipe de produccion. Paso el 03/05/2026 — ver INCIDENT.md.

Mitigacion permanente. Branch dev dedicada en Neon (host ep-sweet-mode-agjuvpdm), Schema-only, sin datos. .env.local apunta aca. Antes de cualquier sesion local que vaya a tocar Prisma, validar el host con el grep de la regla 14.10.

### 15.7 Carpetas con prefijo _ en App Router

Trampa. Next.js 14 App Router trata cualquier carpeta que empiece con _ (underscore) como private folder y NO la rutea. Convencion que choca con la practica habitual de prefijar _debug, _internal, _admin para senalizar privacidad. En App Router eso resulta en 404. Para endpoints internos que necesitan ser ruteables, usar nombres planos sin underscore (ej: app/api/debug/, app/api/internal/).

---

## 16. Estrategia de branches

- `main` — producción, auto-deploy en Vercel. **NO** pushear directamente desde tareas en curso; crear branch feature y merge tras testing.
- Branches feature — nombre descriptivo (`sprint-corpus-3`, `fix-upload-cors`, etc.). Merge a `main` solo tras validación.

Comando de merge estándar:
```bash
git checkout main && git merge <branch> --no-ff -m "Merge: <descripción>" && git push origin main
```

---

## 17. Owner y contacto

- **Nombre:** Diego Amadruda
- **Email:** diego@vexandco.com
- **GitHub:** Damadruda
- **Dominio permitido para auth:** `@vexandco.com`

---

## 18. Estado de sprints al 02 junio 2026

| Sprint / Área | Estado |
|---|---|
| Upload-A (S3 files) | ✅ Completo (happy path + 4 defensivos validados) |
| CORPUS-1 (wipe) | ✅ Completo |
| CORPUS-2 (UI curación) | ✅ Completo |
| CORPUS-3 (promoción autónoma) | ✅ Completo (migración aplicada 20 abril) |
| MIP 1A (Template A) | ✅ Completo, cron activo lunes 05:00 UTC |
| Sprint Inbox Intelligence Upgrade | ✅ Completo 23 abril (Stage A + B, corrections few-shot, batch reprocess) |
| Siembra del corpus | 🔜 Siguiente paso (4-6 docs manual) |
| M.2b (inyección corpus en prompts) | ⏸️ Bloqueado por corpus vacío |
| Items 22-24 (client-ready export) | ⏸️ Mega-prompt diseñado no aplicado |
| MIP 1B + 1C (Templates B, C) | ⏸️ Pendiente |
| Sprint LLM-Realignment | ✅ Completo (19 mayo) — tier routing T1/T2/T3 en `lib/clients/llm.ts` (`callLLM({tier})`, `MODEL_IDS`, `resolveTierModel`), lineup 4.7/3-pro/3-flash, prompt caching en T3, endpoint `/api/debug/llm-routing`. Enum legacy mantenido por compat |
| Sprint Raindrop Sync Alignment | ⏸️ Backlog (alinear `lib/background/raindrop-sync.ts` al nuevo pipeline del Inbox) |
| Mecanismo de revisión periódica de modelos LLM | ⏸️ Backlog (definir frecuencia + criterio de evaluación + benchmark reutilizable para decidir upgrades) |
| Sprint L (A2A workflows) | ⏸️ Backlog (prereq Sprint N) |
| Sprint N (Raindrop auto-improvement) | ⏸️ Backlog |
| SmartDriveImport rethink | ⏸️ Backlog (pipeline actual pierde ~70%) |
| Stack integration HubSpot + Apollo | ⏸️ Backlog |
| Restauración 8 agentes | ⏸️ Backlog (volver a vistas especializadas) |
| Higiene acumulada | ⏸️ Backlog continuo (OAuth client antiguo, Safari multi-account) |
| Incident 03/05/2026 (DB wipe + recovery PITR) | ✅ Cerrado 03/05 (branch dev + lock 14.10 + INCIDENT.md). Cleanup production_old: branch ausente en consola Neon, verificada el 02-jun-2026 (Sprint 8). Solo quedan `production` + `dev` |
| Sprint 1 — Observability LLM inline (29 may, `ebf3dc1`) | ✅ Completo — `/api/debug/llm-routing` expone `fallbackTriggered` + `fallbackFromModel` + `fallbackErrors[]`. Backward compatible |
| Sprint 2 — Probe live de tiers (29 may) | ✅ Completo — los 5 tiers `allOk: true`; Pro respondió. Fallback Pro→Flash confirmado intermitente, no estructural |
| Sprint 2.5 — Persistencia de fallbacks (29 may, `b7bac51`) | ✅ Completo — modelo `LLMFallbackLog` + migración SQL manual `20260529000000_add_llm_fallback_log`; insert con await en el bloque de fallback de `callGemini`; contado en `/api/debug/db-state` |
| Sprint 6 — Higiene docs (02 jun, merge `c393a36`) | ✅ Completo — borrados `DEPLOY_CHECKLIST.md` + `GEMINI_FIX_README.md`; CLAUDE.md §12.1/§12.2 sincronizado con `MODEL_IDS` real (`gemini-3.5-flash` / `gemini-3.1-pro-preview`); nota ABACUSAI actualizada al estado real de Vercel |
| Sprint 7 — Higiene code zombie (02 jun, merge `f2f28d8`) | ✅ Completo — eliminado `lib/documents/generate-pdf.ts` (jsPDF, 0 importers) + dep `jspdf`; vigente `generate-pdf-html.ts` (Puppeteer). Errores TS 42→31, sin regresión. yarn.lock regenerado |
| Sprint 8 — Higiene Neon (02 jun) | ✅ Completo — branch zombie `production_old_2026-05-03T...` ausente en consola, verificada eliminada. Sin acción de código |
| Sprint 3 — Higiene env vars Vercel (02 jun) | ✅ Completo con salvedad — `GEMINI_API_KEY` zombie y `ABACUSAI_API_KEY` ausentes del panel (eliminadas antes del 29-may); `GOOGLE_AI_API_KEY` también ausente (impacta alcance de Sprint 4). Las 4 vars "Needs Attention" (`GOOGLE_CLIENT_SECRET`, `PERPLEXITY_API_KEY`, `DATABASE_URL`, `NEXTAUTH_SECRET`) quedan visibles: scope All Environments impide marcarlas Sensitive sin recrearlas; warning es cosmético. ⚠️ PENDIENTE: rotación de `NEXTAUTH_SECRET` + `DATABASE_URL` como mini-sprint con ventana propia (rotar NextAuth desloguea sesiones; rotar DB toca Neon) |
| Sprint procedencia≠veracidad (30 jun, merge `8e2abfb`) | ✅ Completo — etiquetado epistémico de 3 registros (`HECHO VERIFICADO` / `AFIRMADO POR [fuente]` / `ESTIMACIÓN`) vía constante única `EPISTEMIC_REGISTERS` en `lib/engine/agents.ts`, interpolada en `cognitiveContract` (`app/api/agents/chat/route.ts`). Tres formatters etiquetan claims externos como CLAIM EXTERNO sin verificar: `formatInboxResourceBlock` (`inbox-resource-search.ts`), `getInspirationContext` (`inspiration.ts` — cierra agujero HYPE), prefijo research en `skills.ts`. Cero LLM calls nuevas, cero cambios de schema. Validado empíricamente en War Room: no-regresión interno + fix TOOL/REFERENCE (Browser Use 89.1% → afirmado-sin-verificar) + fix HYPE (inspiración etiquetada, validado con HYPE real tras reprocesar Inbox) |
| Sprint Fase 1 — Routing afín recurso→agente (30 jun, merge `c5bf966`) | ✅ Completo — campo `capabilityDomain` por agente en `lib/engine/agents.ts` (los 5 agentes con `usesRaindrop: true`; Strategist y Challenger activados). `searchInboxResources` (`inbox-resource-search.ts`) rankea por doble vector ponderado 60% dominio-agente / 40% query-proyecto (combinación convexa de 2 distancias coseno pgvector en una sola query SQL; rama sin `domainQuery` = SQL original, no-regresión). `route.ts` pasa `capabilityDomain` como `domainQuery` y retira la ruta keyword `inspirationSkill` (código de `inspiration.ts` intacto para reuso). Encuadre aditivo en `formatInboxResourceBlock`: recursos SE SUMAN al conocimiento del LLM, no lo reemplazan; su ausencia no degrada al agente. Cero schema. Validado en War Room (Comparador): diferenciación por dominio Product&Tech vs Design confirmada; Strategist/Challenger discriminan a su dominio y declaran ausencia de recursos sin inventar; FirmInsight cross-project y registros epistémicos intactos |

---

## 19. Mantenimiento de este archivo

Este `CLAUDE.md` es la fuente de verdad operativa del sistema. Se actualiza al cerrar cada sprint relevante. La sección 18 (estado de sprints) se actualiza siempre. Las secciones 10 y 11 (modelos y endpoints) se actualizan cuando se añaden/eliminan modelos o endpoints estructurales. La sección 15 (trampas conocidas) se actualiza cada vez que se descubra una.

Si al leer este archivo detectas que contradice el estado real del repo, el repo gana. Corrige el archivo en el mismo PR donde se introduzca el cambio que lo desactualiza.
