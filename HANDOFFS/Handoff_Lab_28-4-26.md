# Handoff Lab — 28 abril 2026

## Punto de retoma

Antes de ejecutar el Mega-prompt 1 del Sprint Convergencia v2 (Pro 2.5 + REGLA #0.5 en `summarizeDocument` con caller), decidir si ampliamos el alcance del sprint para absorber dos bugs adyacentes que la sesión BANGE de hoy expuso con evidencia empírica. Mi recomendación: **sí**, porque los tres están en el mismo path crítico (calidad del contexto que ven los agentes) y solucionar uno sin los otros entrega un Lab mejorado pero no diferencial.

La decisión bloqueante de la sesión 27-abr noche (Pro 2.5 vs Flash para `summarizeDocument`) sigue vigente. Hoy 28-abr a la mañana ratifiqué Pro 2.5 con tres argumentos (output leído por agentes → aplica el learning de Inbox; tarea estructurada T2; latencia absorbible). Diego no había confirmado todavía cuando la sesión pivotó al diagnóstico del War Room de BANGE.

---

## Lo que pasó en la sesión (28-abr)

Diego compartió la transcripción completa de 6 iteraciones del War Room de BANGE + las salidas del modo Debate sobre el mismo caso. Pidió diagnóstico crudo. El análisis identificó cuatro capas de problemas, dos confirman bugs ya documentados en memorias, dos son hallazgos nuevos.

### Capa 1 — Pipeline de contexto (deuda ya documentada, manifestación clara)

El Strategist en el turno 2 dijo textualmente "el archivo Pitch no está cargado, solo veo 5 documentos". En el turno 6, después de "vincularlo", admitió: "aunque el archivo está vinculado al proyecto, su texto interno y tus servicios específicos no están en mi memoria activa". Mismo patrón con la Hoja de Ruta 2025-2030: dijo "tengo el documento mapeado en el repositorio" pero "no tengo el texto interno cargado". Diego acabó pegando ambos documentos completos en el chat — exactamente el escenario que Convergencia v2 debe eliminar.

Esto es la memoria #9 (Bug DriveDocSummary summary insuficiente, 27-abr) materializada en un proyecto real. Confirma sin ambigüedad la prioridad del sprint.

### Capa 2 — Contaminación cruzada de FirmInsights (memoria #2, segunda manifestación)

En el turno 4, Revenue propuso a BANGE una "plataforma editorial de nicho" y un "reporte de autoridad ejecutiva". Diego cazó la incongruencia. El Strategist confesó causa raíz en el turno 6: "el agente intentó forzar una estrategia utilizando conocimiento institucional de otro proyecto (el caso Antarctic Talks, que sí era una plataforma de divulgación)".

El matcher en `buildProjectContext` empareja insights por keywords laxas (split + includes >3 chars), sin filtro sectorial ni embedding. BANGE (banca corporativa B2B Madrid-África) y Antarctic Talks (divulgación cultural ESG) compartían palabras como "transcontinental", "expansión", "institucional". Bastó para inyectar el insight de Antarctic como si fuera transferible. No lo es. Sectores ortogonales.

Es el bug del 27-abr (memoria #2) confirmado en su versión más visible. Hasta que el matcher tenga filtro sectorial o embedding similarity, todo proyecto B2B serio está expuesto a este envenenamiento. El bug envenena exactamente el output que más justifica el Lab — el aprendizaje cross-portfolio.

### Capa 3 — Alucinación de cifras de mercado (hallazgo nuevo)

El POV final que Challenger redactó incluye: "El 90% de las expansiones bancarias transfronterizas fallan en la última milla". Esa cifra no existe en ningún documento del proyecto BANGE — ni en el Pitch, ni en el informe de inteligencia, ni en el Drive vinculado. Es invento. El propio Challenger en la pasada de Debate la marcó como "Alucinación de Datos (Fatal)" — pero ya estaba en el POV redactado.

REGLA #0.5 hoy bloquea cifras inventadas sobre el negocio del usuario (revenue, clientes, fechas internas). No bloquea cifras genéricas de mercado que suenan plausibles ("el 90% de X fracasa", "el mercado vale Y"). Hay que extender el guard o explicitar en cada agente: cualquier estadística sin fuente citable debe sustituirse por "múltiples casos documentados" o "patrón observado en proyectos como X, Y".

Esto es prompt engineering, no migración. Costo bajo. Cabe perfectamente en el sprint Convergencia v2 como hotfix paralelo en los prompts de los 5 agentes y del Stage B de ingesta.

### Capa 4 — Debilidad de razonamiento estratégico (hallazgo nuevo, no es bug puro)

Tres cosas que un consultor humano competente habría visto en la primera iteración y los agentes no:

**El verdadero match no es Sprint, es Liderazgo Fraccional.** El Pitch de Vex&Co ofrece tres modalidades: Engagement a medida, Sprint Estratégico (1 semana), Liderazgo Fraccional (3-12 meses, parte del equipo, KPIs). BANGE Credit Madrid acaba de inyectar 11M€ y necesita activar el corredor B2B España-África. Eso no se resuelve con un mapa de 5 días — se resuelve con un Fractional GTM/Expansion Director embebido 6 meses. Ticket 10-20x mayor, riesgo de ejecución asumible (es lo que Diego lleva 25 años haciendo), y el "Caballo de Troya" real sería un Engagement de Diagnóstico de 3-4 semanas con opción de continuar como Fractional. El Sprint de 5 días encierra a Vex&Co en el techo de "consultor de research", justo lo que el Challenger advirtió pero nadie pivotó.

**El match Diego↔BANGE en lo personal no se explotó.** Trilingüe español/inglés/italiano, 25 años en SAP/Oracle (BANGE evalúa Oracle OCI), Chile 0 a €2M ARR en 8 meses (BANGE Madrid en fase 0 del corredor europeo), partner channels que generaron 40% del revenue (justamente lo que BANGE necesita en B2B España). Los agentes mencionaron "Diego con 25 años en SAP/Oracle" tres veces, nunca lo conectaron al dolor específico. Activo más diferenciable y lo trataron como dato curricular.

**El POV es genérico y suena a consultor.** "Auditamos la fricción comercial real" / "neutralizar ese sesgo" — esto lo escribe cualquier agencia. Falta un POV con voz de operador que ha hecho exactamente este movimiento antes.

Diagnóstico: los prompts de Strategist y Revenue están instruidos para razonar sobre **servicios** del Pitch, no sobre **modalidades de contratación**. Cuando entra un caso B2B Enterprise con capital alto (BANGE, 11M€), el sistema converge por defecto a "sprint corto a precio fijo" porque es el formato que más fácilmente cabe en su ventana de generación, no porque sea el óptimo. Hay que enseñarles a evaluar qué modalidad aplica antes de empaquetar el servicio.

### Bonus — El modo Debate no está aportando valor

Comparación War Room normal vs modo Debate sobre el mismo caso BANGE: el modo Debate repite al 90% lo dicho en la conversación previa. No hay confrontación real — hay eco con peor formato (más bullets, menos prosa). Para que el modo Debate aporte, debería forzar a Revenue a defender una tesis específica (ej: "Sprint 5 días es viable para BANGE") contra Challenger atacando con datos nuevos, no resumir consenso.

No urgente. Sí importante registrarlo como deuda de diseño del flujo Debate antes de que se nos olvide.

---

## Reordenamiento propuesto del backlog

El handoff del 27-abr ordenaba: Convergencia v2 → Project Lifecycle/Milestones → Auto-Sprint. Mantengo Convergencia v2 como P0 absoluto. Lo que cambia es **qué cabe dentro de Convergencia v2**.

Propongo absorber dos hotfixes paralelos de bajo coste en el mismo sprint:

**Convergencia v2 — alcance ampliado:**

1. `summarizeDocument` con Pro 2.5 + REGLA #0.5 + caller en el loop de persistencia (decisión 27-abr, ratificada hoy).
2. Caps `take: 15 → 30` y `slice 0, 200 → 600` en `buildProjectContext` y endpoints de chat.
3. Fix `take: 10` en `app/api/projects/[id]/summary/route.ts` (deuda #19).
4. **NUEVO** — Filtro sectorial en el matcher de cross-project insights (bug memoria #2). Opción mínima viable: añadir campo `sector` o `domain` en Project y filtrar antes del matching. Opción ambiciosa: embedding similarity. Empezar por mínima viable, ambiciosa para sprint posterior.
5. **NUEVO** — Extender REGLA #0.5 a estadísticas externas. Adendum al texto canónico de la regla en CLAUDE.md sección 16: "PROHIBIDO inventar estadísticas de mercado, porcentajes de fracaso, tamaños de TAM, o cualquier cifra que no aparezca literalmente en una fuente citada en el contexto. Usar 'múltiples casos documentados' o 'patrón observado en X, Y' en su lugar." Aplicar en los 5 agentes + Stage B de ingesta.

Los puntos 4 y 5 no añaden migración Prisma ni cambios de pipeline. Punto 4 es una columna nueva (default null) y un AND en la query del matcher. Punto 5 es edición de prompts. Coste agregado: bajo. Beneficio: el Lab deja de envenenar outputs con insights no transferibles y deja de inventar cifras que destruyen credibilidad ante clientes.

**Después de Convergencia v2, mantener orden:**

- Sprint Project Lifecycle / Commercial Milestones (memoria #1) — ProjectMilestone tipado, sombra HubSpot.
- Sprint Auto-Sprint (memoria #22) — auto War Room al crear proyecto, plantilla por trackType.

**Backlog separado para sprint dedicado:**

- Modalidades de contratación en prompts de agentes (capa 4 del diagnóstico BANGE). Es trabajo de prompt engineering profundo en los 5 agentes — no cabe en Convergencia v2 sin diluirlo. Sprint corto independiente, posiblemente combinado con la revisión que requiere Auto-Sprint.
- Rediseño del modo Debate como confrontación adversarial real — no urgente.
- UI Density Pass (memoria #13).

---

## Memorias a verificar al abrir próxima sesión

#1 (Project Lifecycle), #2 (matcher cross-project), #9 (DriveDocSummary summary), #13 (UI Density), #19 (deuda multi-flujo), #22 (Auto-Sprint). Si alguna no aparece, re-aplicar antes de avanzar.

---

## Decisión bloqueante para el primer prompt

Una decisión, no varias:

**¿Diego aprueba ampliar Convergencia v2 a 5 puntos (los 3 originales + filtro sectorial básico + extensión REGLA #0.5)?**

Si sí: genero un solo mega-prompt con los 5 puntos para Claude Code.
Si no: Convergencia v2 queda en 3 puntos, los puntos 4 y 5 van a sprint inmediatamente posterior.

Mi voto sigue siendo sí. Tres razones: (a) los 5 son la misma capa lógica (calidad del contexto que ven los agentes); (b) el coste agregado de 4+5 es prompt engineering + 1 columna Prisma + 1 condición SQL; (c) si Convergencia v2 sale sin filtro sectorial, el primer test end-to-end con un proyecto nuevo va a volver a contaminar con insights de proyectos pasados y vamos a tener que volver a tocar el área.

---

## Aprendizajes de la sesión

**Sobre diagnóstico de output del Lab:**
- Una transcripción real de War Room sobre un caso vivo es el mejor benchmark del sistema. Más útil que un test sintético. Vale la pena institucionalizar: tras cada proyecto cliente, revisión rápida de la transcripción para capturar bugs que solo emergen en la práctica.
- Los bugs del Lab manifiestan en capas. El operador percibe "el output es flojo" pero la causa raíz puede estar en pipeline (capa 1), inyección (capa 2), prompt (capa 3) o reasoning del agente (capa 4). Reflejo: antes de tocar prompt, auditar inyección.

**Sobre el aporte cross-portfolio:**
- El matcher por keywords es el mecanismo correcto cuando los proyectos son del mismo sector. Se rompe en cuanto el portfolio cubre sectores ortogonales. Vex&Co tiene exactamente esa heterogeneidad — banca, divulgación cultural, B2B SaaS, retail. Filtro sectorial no es nice-to-have, es supuesto operativo.

**Sobre evaluación honesta del producto:**
- Diego abrió la sesión con "los resultados distan mucho de un agente inteligente". Pushback constructivo > defensa del Lab. La defensa del producto retrasa el fix. Aceptar el frame del usuario y diagnosticar acelera.
