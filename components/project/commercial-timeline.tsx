"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Circle,
  Plus,
  Trash2,
  CircleDollarSign,
} from "lucide-react";

type CommercialStage =
  | "PROPOSAL_SENT"
  | "ACCEPTED"
  | "KICKOFF"
  | "DELIVERY"
  | "INVOICE_SENT"
  | "PAID";

interface CommercialMilestone {
  id: string;
  projectId: string;
  stage: CommercialStage;
  title: string | null;
  amount: number | null;
  currency: string;
  dueDate: string | null;
  completedAt: string | null;
  order: number;
  notes: string | null;
}

const STAGE_ORDER: CommercialStage[] = [
  "PROPOSAL_SENT",
  "ACCEPTED",
  "KICKOFF",
  "DELIVERY",
  "INVOICE_SENT",
  "PAID",
];

const STAGE_LABELS: Record<CommercialStage, string> = {
  PROPOSAL_SENT: "Propuesta enviada",
  ACCEPTED: "Aceptada",
  KICKOFF: "Kickoff",
  DELIVERY: "Entrega",
  INVOICE_SENT: "Factura enviada",
  PAID: "Cobrado",
};

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
};

const GOLD = "#B8860B";
const INK = "#1A1A1A";
const BORDER = "#E8E4DE";
const MUTED = "#5E5E5E";

function symbolFor(currency: string): string {
  return CURRENCY_SYMBOL[currency] ?? currency + " ";
}

function formatAmount(amount: number, currency: string): string {
  const n = amount.toLocaleString("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${symbolFor(currency)}${n}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function CommercialTimeline({ projectId }: { projectId: string }) {
  const [milestones, setMilestones] = useState<CommercialMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // Form state
  const [formStage, setFormStage] = useState<CommercialStage>("PROPOSAL_SENT");
  const [formTitle, setFormTitle] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCurrency, setFormCurrency] = useState("EUR");
  const [formDueDate, setFormDueDate] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/commercial-milestones`);
      if (!res.ok) return;
      const data = await res.json();
      setMilestones(data.milestones ?? []);
    } catch (e) {
      console.error("Error loading commercial milestones", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setFormStage("PROPOSAL_SENT");
    setFormTitle("");
    setFormAmount("");
    setFormCurrency("EUR");
    setFormDueDate("");
  };

  const addMilestone = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/commercial-milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage: formStage,
            title: formTitle.trim() || null,
            amount: formAmount ? parseFloat(formAmount) : null,
            currency: formCurrency || "EUR",
            dueDate: formDueDate || null,
          }),
        }
      );
      if (res.ok) {
        resetForm();
        setShowAdd(false);
        await load();
      }
    } catch (e) {
      console.error("Error adding commercial milestone", e);
    } finally {
      setBusy(false);
    }
  };

  const toggleComplete = async (m: CommercialMilestone) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/commercial-milestones/${m.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completedAt: m.completedAt ? null : new Date().toISOString(),
          }),
        }
      );
      if (res.ok) await load();
    } catch (e) {
      console.error("Error toggling commercial milestone", e);
    } finally {
      setBusy(false);
    }
  };

  const removeMilestone = async (m: CommercialMilestone) => {
    if (busy) return;
    if (
      !confirm(
        `¿Eliminar el evento "${m.title || STAGE_LABELS[m.stage]}"? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/commercial-milestones/${m.id}`,
        { method: "DELETE" }
      );
      if (res.ok) await load();
    } catch (e) {
      console.error("Error deleting commercial milestone", e);
    } finally {
      setBusy(false);
    }
  };

  // Derived totals (cliente). Moneda dominante = la del primer milestone con amount.
  const dominantCurrency =
    milestones.find((m) => m.amount != null)?.currency ?? "EUR";

  const invoiced = milestones
    .filter((m) => m.stage === "INVOICE_SENT" && m.completedAt && m.amount != null)
    .reduce((sum, m) => sum + (m.amount ?? 0), 0);
  const collected = milestones
    .filter((m) => m.stage === "PAID" && m.completedAt && m.amount != null)
    .reduce((sum, m) => sum + (m.amount ?? 0), 0);
  const quoted = milestones
    .filter((m) => m.stage === "PROPOSAL_SENT" && m.amount != null)
    .reduce((sum, m) => sum + (m.amount ?? 0), 0);

  const byStage = (stage: CommercialStage) =>
    milestones.filter((m) => m.stage === stage);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3
          className="text-lg font-semibold"
          style={{ color: INK, fontFamily: "'Cormorant Garamond', Georgia, serif" }}
        >
          <CircleDollarSign
            className="inline h-4 w-4 mr-2"
            style={{ color: GOLD }}
          />
          Ciclo comercial
        </h3>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border transition-colors"
          style={{ borderColor: BORDER, color: INK }}
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar evento
        </button>
      </div>

      {/* Strip de totales */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Cotizado", value: quoted },
          { label: "Facturado", value: invoiced },
          { label: "Cobrado", value: collected },
        ].map((t) => (
          <div
            key={t.label}
            className="rounded-lg border bg-white px-4 py-3"
            style={{ borderColor: BORDER }}
          >
            <p
              className="text-[10px] uppercase tracking-wider mb-1"
              style={{ color: MUTED }}
            >
              {t.label}
            </p>
            <p
              className="text-base font-semibold"
              style={{
                color: t.label === "Cobrado" && t.value > 0 ? GOLD : INK,
              }}
            >
              {formatAmount(t.value, dominantCurrency)}
            </p>
          </div>
        ))}
      </div>

      {/* Form inline */}
      {showAdd && (
        <div
          className="rounded-lg border bg-white p-4 mb-6"
          style={{ borderColor: BORDER }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span
                className="text-[10px] uppercase tracking-wider block mb-1"
                style={{ color: MUTED }}
              >
                Stage
              </span>
              <select
                value={formStage}
                onChange={(e) =>
                  setFormStage(e.target.value as CommercialStage)
                }
                className="w-full text-sm bg-transparent border-b outline-none py-1"
                style={{ borderColor: BORDER, color: INK }}
              >
                {STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span
                className="text-[10px] uppercase tracking-wider block mb-1"
                style={{ color: MUTED }}
              >
                Título (opcional)
              </span>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ej: Anticipo 40%"
                className="w-full text-sm bg-transparent border-b outline-none py-1"
                style={{ borderColor: BORDER, color: INK }}
              />
            </label>
            <label className="block">
              <span
                className="text-[10px] uppercase tracking-wider block mb-1"
                style={{ color: MUTED }}
              >
                Monto
              </span>
              <input
                type="number"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0"
                className="w-full text-sm bg-transparent border-b outline-none py-1"
                style={{ borderColor: BORDER, color: INK }}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span
                  className="text-[10px] uppercase tracking-wider block mb-1"
                  style={{ color: MUTED }}
                >
                  Moneda
                </span>
                <input
                  type="text"
                  value={formCurrency}
                  onChange={(e) =>
                    setFormCurrency(e.target.value.toUpperCase())
                  }
                  className="w-full text-sm bg-transparent border-b outline-none py-1"
                  style={{ borderColor: BORDER, color: INK }}
                />
              </label>
              <label className="block">
                <span
                  className="text-[10px] uppercase tracking-wider block mb-1"
                  style={{ color: MUTED }}
                >
                  Fecha
                </span>
                <input
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="w-full text-sm bg-transparent border-b outline-none py-1"
                  style={{ borderColor: BORDER, color: INK }}
                />
              </label>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              onClick={() => {
                resetForm();
                setShowAdd(false);
              }}
              className="text-xs px-3 py-1.5 rounded-md"
              style={{ color: MUTED }}
            >
              Cancelar
            </button>
            <button
              onClick={addMilestone}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-md text-white disabled:opacity-50"
              style={{ backgroundColor: INK }}
            >
              Guardar evento
            </button>
          </div>
        </div>
      )}

      {/* Timeline vertical */}
      {loading ? (
        <p className="text-sm" style={{ color: MUTED }}>
          Cargando ciclo comercial…
        </p>
      ) : (
        <div className="relative">
          {STAGE_ORDER.map((stage, idx) => {
            const rows = byStage(stage);
            const isLast = idx === STAGE_ORDER.length - 1;
            return (
              <div key={stage} className="relative flex gap-4 pb-6">
                {/* Línea vertical + nodo */}
                <div className="flex flex-col items-center">
                  <div
                    className="h-3 w-3 rounded-full border-2"
                    style={{
                      borderColor: rows.some((m) => m.completedAt)
                        ? GOLD
                        : BORDER,
                      backgroundColor: rows.some((m) => m.completedAt)
                        ? GOLD
                        : "transparent",
                    }}
                  />
                  {!isLast && (
                    <div
                      className="w-px flex-1 mt-1"
                      style={{ backgroundColor: BORDER }}
                    />
                  )}
                </div>

                <div className="flex-1 -mt-1">
                  <p
                    className="text-[11px] uppercase tracking-wider mb-2"
                    style={{ color: MUTED }}
                  >
                    {STAGE_LABELS[stage]}
                  </p>

                  {rows.length === 0 ? (
                    <p
                      className="text-xs italic"
                      style={{ color: BORDER }}
                    >
                      Sin eventos
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {rows.map((m) => {
                        const done = !!m.completedAt;
                        return (
                          <div
                            key={m.id}
                            className="flex items-start justify-between gap-3 rounded-lg border bg-white px-4 py-3"
                            style={{
                              borderColor: BORDER,
                              opacity: done ? 1 : 0.7,
                            }}
                          >
                            <div className="flex items-start gap-3 flex-1">
                              <button
                                onClick={() => toggleComplete(m)}
                                disabled={busy}
                                title={
                                  done
                                    ? "Marcar como pendiente"
                                    : "Marcar como completado"
                                }
                                className="mt-0.5 disabled:opacity-50"
                              >
                                {done ? (
                                  <Check
                                    className="h-4 w-4"
                                    style={{ color: GOLD }}
                                  />
                                ) : (
                                  <Circle
                                    className="h-4 w-4"
                                    style={{ color: MUTED }}
                                  />
                                )}
                              </button>
                              <div className="flex-1">
                                <p
                                  className="text-sm font-medium"
                                  style={{ color: INK }}
                                >
                                  {m.title || STAGE_LABELS[m.stage]}
                                </p>
                                <div
                                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs"
                                  style={{ color: MUTED }}
                                >
                                  {m.amount != null && (
                                    <span
                                      style={{
                                        color: done ? GOLD : MUTED,
                                        fontWeight: done ? 600 : 400,
                                      }}
                                    >
                                      {formatAmount(m.amount, m.currency)}
                                    </span>
                                  )}
                                  {m.dueDate && (
                                    <span>Plan: {formatDate(m.dueDate)}</span>
                                  )}
                                  {m.completedAt && (
                                    <span style={{ color: GOLD }}>
                                      Hecho: {formatDate(m.completedAt)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => removeMilestone(m)}
                              disabled={busy}
                              title="Eliminar"
                              className="mt-0.5 disabled:opacity-50"
                              style={{ color: MUTED }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
