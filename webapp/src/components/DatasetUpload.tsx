import { useEffect, useRef, useState } from 'react'
import { Upload, Loader2, Building2, Trash2, X } from 'lucide-react'
import { api, type DatasetUploadResult, type TenantSummary } from '../lib/api'

export default function DatasetUpload({ llmEnabled }: { llmEnabled: boolean }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DatasetUploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tenants, setTenants] = useState<TenantSummary[]>([])
  const [tenantsLoading, setTenantsLoading] = useState(true)
  const [viewingTenant, setViewingTenant] = useState<DatasetUploadResult & { name: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function refreshTenants() {
    setTenantsLoading(true)
    api.tenants().then(r => setTenants(r.tenants)).catch(() => {}).finally(() => setTenantsLoading(false))
  }

  useEffect(refreshTenants, [])

  // DatasetUpload itself doesn't unmount when the tenant-viewer modal closes
  // (viewingTenant just goes back to null), so this has to key off that
  // rather than assume a fresh mount - same body-scroll-lock reasoning as
  // the other modals in this app.
  useEffect(() => {
    if (!viewingTenant) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [viewingTenant])

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const r = await api.uploadDataset(file)
      setResult(r)
      refreshTenants()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function openTenant(id: string) {
    const t = await api.tenant(id)
    setViewingTenant({ ...t.analysis, name: t.name })
  }

  async function removeTenant(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await api.deleteTenant(id).catch(() => {})
    refreshTenants()
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-black/10 rounded-2xl p-6 text-center cursor-pointer hover:border-[#2B5D5E]/40 hover:bg-[#2B5D5E]/[0.03] transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {busy ? (
          <div className="flex items-center justify-center gap-2 text-sm text-neutral-500">
            <Loader2 size={16} className="animate-spin" /> Mapping columns and analyzing…
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-neutral-500">
            <Upload size={16} /> Drop any transactions CSV here — column names don't need to match
          </div>
        )}
      </div>

      {error && (
        <div className="text-[13px] text-[#A6392F] bg-[#A6392F]/8 rounded-lg px-3 py-2 mt-3">
          {llmEnabled ? error : 'Groq API key not configured on the backend yet — set GROQ_API_KEY in backend/.env to enable column mapping.'}
        </div>
      )}

      {result && <AnalysisPanel result={result} title="Just uploaded" />}

      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Building2 size={14} className="text-neutral-400" />
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Merchant workspaces</div>
        </div>
        {tenantsLoading ? (
          <div className="text-[13px] text-neutral-400">Loading…</div>
        ) : tenants.length === 0 ? (
          <div className="text-[13px] text-neutral-400">No saved workspaces yet — upload a CSV above to create one.</div>
        ) : (
          <div className="space-y-2">
            {tenants.map(t => (
              <button
                key={t.id}
                onClick={() => openTenant(t.id)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-black/5 px-4 py-3 text-left hover:border-[#2B5D5E]/30 hover:bg-[#2B5D5E]/[0.03] transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{t.name}</div>
                  <div className="text-[12px] text-neutral-400">
                    {t.total_customers} customers · ₹{Math.round(t.total_chargeback_loss).toLocaleString()} loss · {t.flagged_customer_count} flagged
                  </div>
                </div>
                <span onClick={(e) => removeTenant(t.id, e)} className="flex-none p-1.5 rounded-lg text-neutral-300 hover:text-[#A6392F] hover:bg-[#A6392F]/8">
                  <Trash2 size={14} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {viewingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(20,17,10,0.45)' }} onClick={() => setViewingTenant(null)}>
          {/* .glass-card's plain-CSS `overflow: hidden` beats the Tailwind
              `overflow-y-auto` utility regardless of class order (Tailwind
              v4's utilities sit in a lower-priority @layer) - only an
              inline style reliably wins that cascade. */}
          <div className="glass-card w-[560px] max-w-[92vw] max-h-[80vh] p-7 relative" style={{ background: 'rgba(255,255,255,0.97)', overflowY: 'auto', overscrollBehavior: 'contain' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewingTenant(null)} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700"><X size={18} /></button>
            <div className="font-bold text-lg mb-4">{viewingTenant.name}</div>
            <AnalysisPanel result={viewingTenant} title="" />
          </div>
        </div>
      )}
    </div>
  )
}

function AnalysisPanel({ result, title }: { result: DatasetUploadResult; title: string }) {
  return (
    <div className="mt-4 space-y-3">
      {title && <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">{title}</div>}
      <div className="text-[12px] text-neutral-400">
        Mapped columns: {Object.entries(result.column_mapping).map(([k, v]) => `${k}→${v ?? '—'}`).join(', ')}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="metric-tile">
          <div className="text-xs text-neutral-400 mb-1">Customers</div>
          <div className="text-xl font-bold">{result.total_customers.toLocaleString()}</div>
        </div>
        <div className="metric-tile">
          <div className="text-xs text-neutral-400 mb-1">Chargeback loss</div>
          <div className="text-xl font-bold">₹{Math.round(result.total_chargeback_loss).toLocaleString()}</div>
        </div>
        <div className="metric-tile">
          <div className="text-xs text-neutral-400 mb-1">Shared-device clusters</div>
          <div className="text-xl font-bold">{result.shared_device_clusters}</div>
        </div>
        <div className="metric-tile">
          <div className="text-xs text-neutral-400 mb-1">Flagged customers</div>
          <div className="text-xl font-bold">{result.flagged_customer_count}</div>
        </div>
      </div>
      <p className="text-[12px] text-neutral-400">
        Unsupervised signal only — this dataset has no ground-truth labels, so these are shared-device/shared-address
        clusters worth reviewing, not a validated precision/recall claim like the demo pipeline's.
      </p>
    </div>
  )
}
