"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/header";
import { Save, Check, Eye, EyeOff } from "lucide-react";

interface Preferences {
  raindropToken: string | null;
  jinaApiKey: string | null;
  defaultInboxView: string;
  aiAnalysisEnabled: boolean;
  autoTagging: boolean;
  theme: string;
  timezone: string;
}

// ─── Token Field ──────────────────────────────────────────────────────────────

function TokenField({
  label,
  description,
  fieldKey,
  currentValue,
  onSave,
  saving,
  saved,
  helpText,
}: {
  label: string;
  description: string;
  fieldKey: string;
  currentValue: string | null;
  onSave: (key: string, value: string) => void;
  saving: boolean;
  saved: boolean;
  helpText?: string;
}) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);

  const isConfigured = !!currentValue;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="ql-label block">{label}</label>
        {isConfigured ? (
          <span className="bg-green-50 text-green-700 border border-green-200 text-[10px] px-2 py-0.5 rounded">
            Conectado ({currentValue})
          </span>
        ) : (
          <span className="bg-gray-50 text-[#999] border border-[#E8E4DE] text-[10px] px-2 py-0.5 rounded">
            No configurado
          </span>
        )}
      </div>
      <p className="ql-caption">{description}</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isConfigured ? "Pegar nuevo token para reemplazar" : "Pega tu token aquí"}
            className="ql-input pr-10"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ql-muted hover:text-ql-slate transition-colors"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <button
          onClick={() => { if (value.trim()) { onSave(fieldKey, value.trim()); setValue(""); } }}
          disabled={saving || !value.trim()}
          className="ql-btn-primary disabled:opacity-50"
        >
          {saving ? (
            <span className="ql-status-thinking" />
          ) : saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saved ? "Guardado" : "Guardar"}
        </button>
      </div>
      {helpText && (
        <p className="text-xs text-[#999] mt-1">{helpText}</p>
      )}
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-ql-charcoal">{label}</p>
        <p className="ql-caption mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
          checked ? "bg-ql-charcoal" : "bg-ql-sand"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [savedField, setSavedField] = useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState(false);

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((data) => setPrefs(data.preferences))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const saveToken = async (key: string, value: string) => {
    setSavingField(key);
    try {
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await res.json();
      setPrefs(data.preferences);
      setSavedField(key);
      setTimeout(() => setSavedField(null), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingField(null);
    }
  };

  const savePreferences = async (updates: Partial<Preferences>) => {
    setSavingPrefs(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      setPrefs(data.preferences);
      setSavedPrefs(true);
      setTimeout(() => setSavedPrefs(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPrefs(false);
    }
  };

  if (loading || !prefs) {
    return (
      <div className="ql-page flex items-center gap-2 justify-center">
        <span className="ql-status-thinking" />
        <span className="ql-loading">Cargando preferencias...</span>
      </div>
    );
  }

  return (
    <div className="ql-page">
      <Header title="Preferencias" />

      <div className="p-6 max-w-2xl space-y-8">
        <div>
          <h1 className="ql-h1">Preferencias</h1>
          <p className="ql-body mt-1">Configura integraciones y ajustes del sistema.</p>
        </div>

        {/* ── Integraciones ── */}
        <section className="ql-card space-y-6">
          <h3 className="ql-h3">Integraciones</h3>
          <div className="ql-divider-subtle" />

          <TokenField
            label="Raindrop.io Token"
            description="Token de acceso personal para sincronizar bookmarks."
            fieldKey="raindropToken"
            currentValue={prefs.raindropToken}
            onSave={saveToken}
            saving={savingField === "raindropToken"}
            saved={savedField === "raindropToken"}
            helpText="Obtén tu token en raindrop.io → Settings → Integrations → Create test token"
          />

          <div className="ql-divider-subtle" />

          <TokenField
            label="Jina AI API Key"
            description="Clave de Jina Reader para extraer contenido de URLs."
            fieldKey="jinaApiKey"
            currentValue={prefs.jinaApiKey}
            onSave={saveToken}
            saving={savingField === "jinaApiKey"}
            saved={savedField === "jinaApiKey"}
            helpText="Opcional — funciona sin key en tier free. Consigue una en jina.ai"
          />
        </section>

        {/* ── Preferencias ── */}
        <section className="ql-card space-y-6">
          <h3 className="ql-h3">Sistema</h3>
          <div className="ql-divider-subtle" />

          <div className="space-y-2">
            <label className="ql-label block">Vista del Inbox</label>
            <select
              value={prefs.defaultInboxView}
              onChange={(e) =>
                setPrefs({ ...prefs, defaultInboxView: e.target.value })
              }
              className="ql-input w-auto"
            >
              <option value="list">Lista</option>
              <option value="grid">Grid</option>
              <option value="kanban">Kanban</option>
            </select>
          </div>

          <div className="ql-divider-subtle" />

          <Toggle
            label="Análisis IA automático"
            description="Analiza nuevos items del Inbox con Gemini Flash."
            checked={prefs.aiAnalysisEnabled}
            onChange={(v) => setPrefs({ ...prefs, aiAnalysisEnabled: v })}
          />

          <Toggle
            label="Auto-tagging"
            description="Tags automáticos al añadir contenido al Inbox."
            checked={prefs.autoTagging}
            onChange={(v) => setPrefs({ ...prefs, autoTagging: v })}
          />

          <div className="ql-divider-subtle" />

          <div className="space-y-2">
            <label className="ql-label block">Tema</label>
            <select
              value={prefs.theme}
              onChange={(e) => setPrefs({ ...prefs, theme: e.target.value })}
              className="ql-input w-auto"
            >
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
              <option value="system">Sistema</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="ql-label block">Zona horaria</label>
            <select
              value={prefs.timezone}
              onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
              className="ql-input w-auto"
            >
              {[
                "UTC", "Europe/Madrid", "America/Mexico_City",
                "America/Bogota", "America/Buenos_Aires",
                "America/New_York", "America/Los_Angeles",
              ].map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div className="pt-2">
            <button
              onClick={() => savePreferences({
                defaultInboxView: prefs.defaultInboxView,
                aiAnalysisEnabled: prefs.aiAnalysisEnabled,
                autoTagging: prefs.autoTagging,
                theme: prefs.theme,
                timezone: prefs.timezone,
              })}
              disabled={savingPrefs}
              className="ql-btn-primary disabled:opacity-50"
            >
              {savingPrefs ? (
                <span className="ql-status-thinking" />
              ) : savedPrefs ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {savedPrefs ? "Guardado" : "Guardar preferencias"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
