// =============================================================================
// MIP — Template A: Radar de Oportunidades Comerciales B2B
// Semanal (lunes 05:00 UTC). Escanea movimientos de los últimos 7 días en
// España + UE y los clasifica como oportunidades de contratación de consultoría.
// =============================================================================

import type { MarketBriefType } from "@prisma/client";

export const TEMPLATE_A = {
  name: "Radar de Oportunidades Comerciales B2B",
  briefType: "COMMERCIAL_RADAR" as MarketBriefType,
  schedule: "0 5 * * 1", // lunes 05:00 UTC (= 07:00 CEST verano / 06:00 CET invierno España)
  sectorTags: ["saas-b2b", "consulting-b2b", "enterprise-b2b", "fintech", "healthtech", "edtech"],
  geographyTags: ["ES", "EU"],
  systemPrompt: `Actúas como Radar de Oportunidades Comerciales para Vex&Co, consultora española B2B especializada en servicios profesionales, estrategia, producto y experiencia de cliente para empresas de tecnología y servicios.

Tu misión: detectar movimientos reales de los últimos 7 días en España y Europa que representen oportunidades de contratación de consultoría, servicios profesionales o acompañamiento estratégico.

Incluye:
1. Contratos de consultoría anunciados o licitaciones públicas de servicios profesionales (no implementaciones puras de software).
2. Nombramientos de C-levels (CEO, CRO, CPO, CMO, Chief Strategy, Chief Transformation) en empresas B2B mid-market o enterprise — llegan con agenda de transformación y suelen contratar consultoría en los primeros 6 meses.
3. Rondas de inversión Serie A+ en empresas B2B. El capital fresco activa contratación de consultoría estratégica, GTM, producto.
4. Carve-outs, spin-offs, post-adquisiciones que requieren integración o redefinición estratégica.
5. Empresas anunciando apertura de nuevos mercados o verticales — demanda consultoría de entrada a mercado.

Criterios estrictos:
- Movimiento ANUNCIADO o CONFIRMADO, no rumor.
- Empresa identificable con nombre.
- Al menos una fuente verificable (nota de prensa, comunicado oficial, cobertura en medios establecidos).

Si en los últimos 7 días no hay movimientos reales contrastables, devuelve opportunities: [] y summary: "Sin oportunidades comerciales relevantes en los últimos 7 días". No inventes relleno.

NO incluyas: anuncios de productos SaaS, partnerships puramente tecnológicos, implementaciones de software que no impliquen consultoría.`,
  userPromptTemplate: `Escanea noticias del periodo desde {{FROM}} hasta {{TO}} en España y Europa. Devuelve todas las oportunidades que cumplan los criterios. Emite en JSON según el schema proporcionado. El campo scanPeriod.from debe ser exactamente {{FROM}} y scanPeriod.to exactamente {{TO}}.`,
  responseSchema: {
    type: "object",
    required: ["summary", "opportunities", "scanPeriod"],
    properties: {
      summary: { type: "string" },
      scanPeriod: {
        type: "object",
        required: ["from", "to"],
        properties: {
          from: { type: "string", format: "date-time" },
          to: { type: "string", format: "date-time" },
        },
      },
      opportunities: {
        type: "array",
        items: {
          type: "object",
          required: ["opportunityType", "company", "trigger", "consultingAngle", "sources"],
          properties: {
            opportunityType: {
              type: "string",
              enum: [
                "CONTRACT_ANNOUNCED",
                "TENDER_OPEN",
                "CLEVEL_APPOINTMENT",
                "FUNDING_ROUND",
                "CARVE_OUT_MA",
                "MARKET_EXPANSION",
              ],
            },
            company: { type: "string" },
            sector: { type: "string" },
            geography: { type: "string" },
            trigger: { type: "string" },
            consultingAngle: { type: "string" },
            amount: {
              type: "object",
              properties: {
                value: { type: "number" },
                currency: { type: "string" },
              },
            },
            sources: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["url", "title"],
                properties: {
                  url: { type: "string", format: "uri" },
                  title: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
