"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/header";
import { Loader2, Save, Check, Eye, EyeOff } from "lucide-react";

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
}: {
  label: string;
  description: string;
  fieldKey: string;
  currentValue: string | null;
  onSave: (key: string, value: string) => void;
  saving: boolean;
  saved: boolean;
}) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);

  const isConfigured = !!currentValue;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <p className="text-xs text-slate-400">{description}</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isConfigured ? `Configurado (${currentValue})` : "Pega tu token aquí"}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-sm outline-none focus:border-slate-400"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <button
          onClick={() => { if (value.trim()) onSave(fieldKey, value.trim()); }}
          disabled={saving || !value.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saved ? "Guardado" : "Guardar"}
        </button>
      </div>
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
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
          checked ? "bg-slate-900" : "bg-slate-200"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header title="Preferencias" />

      <div className="p-6 max-w-2xl space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Preferencias</h2>
          <p className="text-slate-500">Configura integraciones y ajustes del sistema.</p>
        </div>

        {/* ── Integraciones ── */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
          <h3 className="font-semibold text-slate-800">Integraciones</h3>

          <TokenField
            label="Raindrop.io Token"
            description="Tu token de acceso personal de Raindrop.io para sincronizar bookmarks."
            fieldKey="raindropToken"
            currentValue={prefs.raindropToken}
            onSave={saveToken}
            saving={savingField === "raindropToken"}
            saved={savedField === "raindropToken"}
          />

          <TokenField
            label="Jina AI API Key"
            description="Clave de Jina Reader para extraer contenido limpio de URLs."
            fieldKey="jinaApiKey"
            currentValue={prefs.jinaApiKey}
            onSave={saveToken}
            saving={savingField === "jinaApiKey"}
            saved={savedField === "jinaApiKey"}
          />
        </section>

        {/* ── Preferencias ── */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
          <h3 className="font-semibold text-slate-800">Preferencias del sistema</h3>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Vista del Inbox</label>
            <select
              value={prefs.defaultInboxView}
              onChange={(e) =>
                setPrefs({ ...prefs, defaultInboxView: e.target.value })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            >
              <option value="list">Lista</option>
              <option value="grid">Grid</option>
              <option value="kanban">Kanban</option>
            </select>
          </div>

          <Toggle
            label="Análisis IA automático"
            description="Analiza automáticamente los nuevos items del Inbox con Gemini Flash."
            checked={prefs.aiAnalysisEnabled}
            onChange={(v) => setPrefs({ ...prefs, aiAnalysisEnabled: v })}
          />

          <Toggle
            label="Auto-tagging"
            description="Genera tags automáticos al añadir contenido al Inbox."
            checked={prefs.autoTagging}
            onChange={(v) => setPrefs({ ...prefs, autoTagging: v })}
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Tema</label>
            <select
              value={prefs.theme}
              onChange={(e) => setPrefs({ ...prefs, theme: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            >
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
              <option value="system">Sistema</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Zona horaria</label>
            <select
              value={prefs.timezone}
              onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
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
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {savingPrefs ? (
                <Loader2 className="h-4 w-4 animate-spin" />
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
