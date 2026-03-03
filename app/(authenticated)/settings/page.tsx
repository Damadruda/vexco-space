"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/header";
import {
  Settings,
  Key,
  Zap,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";

interface SettingsState {
  raindropToken: string;
  jinaApiKey: string;
  aiAnalysisEnabled: boolean;
  autoTagging: boolean;
  timezone: string;
}

interface SettingsStatus {
  hasRaindropToken: boolean;
  hasJinaApiKey: boolean;
  raindropLastSync: string | null;
}

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsState>({
    raindropToken: "",
    jinaApiKey: "",
    aiAnalysisEnabled: true,
    autoTagging: true,
    timezone: "America/Mexico_City",
  });
  const [status, setStatus] = useState<SettingsStatus>({
    hasRaindropToken: false,
    hasJinaApiKey: false,
    raindropLastSync: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saveResult, setSaveResult] = useState<"success" | "error" | null>(null);
  const [showRaindrop, setShowRaindrop] = useState(false);
  const [showJina, setShowJina] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const data = await res.json();
        setStatus({
          hasRaindropToken: data.hasRaindropToken,
          hasJinaApiKey: data.hasJinaApiKey,
          raindropLastSync: data.raindropLastSync,
        });
        setForm((prev) => ({
          ...prev,
          aiAnalysisEnabled: data.aiAnalysisEnabled,
          autoTagging: data.autoTagging,
          timezone: data.timezone,
        }));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const payload: Record<string, unknown> = {
        aiAnalysisEnabled: form.aiAnalysisEnabled,
        autoTagging: form.autoTagging,
        timezone: form.timezone,
      };
      if (form.raindropToken) payload.raindropToken = form.raindropToken;
      if (form.jinaApiKey) payload.jinaApiKey = form.jinaApiKey;

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Save failed");

      setSaveResult("success");
      setForm((prev) => ({ ...prev, raindropToken: "", jinaApiKey: "" }));

      // Re-fetch status
      const statusRes = await fetch("/api/settings");
      const data = await statusRes.json();
      setStatus({
        hasRaindropToken: data.hasRaindropToken,
        hasJinaApiKey: data.hasJinaApiKey,
        raindropLastSync: data.raindropLastSync,
      });

      setTimeout(() => setSaveResult(null), 4000);
    } catch {
      setSaveResult("error");
      setTimeout(() => setSaveResult(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleRaindropSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/automation/raindrop-sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const statusRes = await fetch("/api/settings");
        const updated = await statusRes.json();
        setStatus((prev) => ({
          ...prev,
          raindropLastSync: updated.raindropLastSync,
        }));
      }
    } catch {
      // ignore
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header title="Configuración" subtitle="V4 · Integraciones" />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Configuración" subtitle="V4 · Integraciones" />

      <div className="mx-auto max-w-2xl p-8 space-y-8">

        {/* Save result feedback */}
        {saveResult && (
          <div
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
              saveResult === "success"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {saveResult === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {saveResult === "success"
              ? "Configuración guardada correctamente."
              : "Error al guardar. Inténtalo de nuevo."}
          </div>
        )}

        {/* Section: API Tokens */}
        <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900">
                <Key className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="font-serif text-lg text-gray-900">API Tokens</h2>
                <p className="text-xs text-gray-500">Conecta tus fuentes de datos externas</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-50 px-6 py-2">
            {/* Raindrop */}
            <div className="py-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-900">
                    Raindrop.io Token
                  </label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Para sincronizar tus bookmarks automáticamente
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {status.hasRaindropToken && (
                    <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Conectado
                    </span>
                  )}
                  <a
                    href="https://app.raindrop.io/settings/integrations"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
              <div className="relative">
                <input
                  type={showRaindrop ? "text" : "password"}
                  value={form.raindropToken}
                  onChange={(e) => setForm((p) => ({ ...p, raindropToken: e.target.value }))}
                  placeholder={
                    status.hasRaindropToken ? "••••••••••••  (dejar vacío para mantener)" : "Pega tu token aquí"
                  }
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 pr-10 text-sm font-mono placeholder:font-sans placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowRaindrop((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showRaindrop ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {status.hasRaindropToken && (
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={handleRaindropSync}
                    disabled={syncing}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {syncing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Sincronizar ahora
                  </button>
                  {status.raindropLastSync && (
                    <p className="text-xs text-gray-400">
                      Último sync:{" "}
                      {new Date(status.raindropLastSync).toLocaleString("es-ES", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Jina */}
            <div className="py-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-900">
                    Jina Reader API Key
                  </label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Para extraer contenido de URLs y análisis semántico
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {status.hasJinaApiKey && (
                    <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Conectado
                    </span>
                  )}
                  <a
                    href="https://jina.ai/reader"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
              <div className="relative">
                <input
                  type={showJina ? "text" : "password"}
                  value={form.jinaApiKey}
                  onChange={(e) => setForm((p) => ({ ...p, jinaApiKey: e.target.value }))}
                  placeholder={
                    status.hasJinaApiKey ? "••••••••••••  (dejar vacío para mantener)" : "Pega tu API key aquí"
                  }
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 pr-10 text-sm font-mono placeholder:font-sans placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowJina((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showJina ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Section: AI & Automation */}
        <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                <Zap className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <h2 className="font-serif text-lg text-gray-900">IA & Automatización</h2>
                <p className="text-xs text-gray-500">Control del pipeline de análisis</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-50 px-6 py-2">
            <div className="flex items-center justify-between py-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Análisis IA automático</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Analiza nuevos items del inbox al llegar
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, aiAnalysisEnabled: !p.aiAnalysisEnabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.aiAnalysisEnabled ? "bg-gray-900" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    form.aiAnalysisEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Auto-tagging</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Sugiere tags automáticamente según el contenido
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, autoTagging: !p.autoTagging }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.autoTagging ? "bg-gray-900" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    form.autoTagging ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Section: Preferences */}
        <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                <Settings className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h2 className="font-serif text-lg text-gray-900">Preferencias</h2>
                <p className="text-xs text-gray-500">Ajustes de interfaz y regional</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Zona horaria
            </label>
            <select
              value={form.timezone}
              onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-gray-300 focus:bg-white focus:outline-none transition-colors"
            >
              <option value="America/Mexico_City">Ciudad de México (UTC-6)</option>
              <option value="America/Bogota">Bogotá (UTC-5)</option>
              <option value="America/Lima">Lima (UTC-5)</option>
              <option value="America/Buenos_Aires">Buenos Aires (UTC-3)</option>
              <option value="America/Santiago">Santiago (UTC-4)</option>
              <option value="Europe/Madrid">Madrid (UTC+1)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
