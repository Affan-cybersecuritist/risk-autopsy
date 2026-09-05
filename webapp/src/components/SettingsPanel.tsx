import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { X, Settings as SettingsIcon, CheckCircle2, XCircle, Volume2, RefreshCw, Zap, Play, Loader2, RotateCcw, User, LogOut } from 'lucide-react'
import { VOICE_OPTIONS, DEFAULT_SETTINGS, type Settings } from '../lib/settings'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative w-10 h-6 rounded-full flex-none transition-colors"
      style={{ background: checked ? '#2B5D5E' : '#D7D9CD' }}
    >
      <motion.span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow"
        animate={{ left: checked ? 18 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  )
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
      {icon}
      {children}
    </div>
  )
}

export default function SettingsPanel({
  open, onClose, settings, onSave, llmEnabled, apiOnline,
}: {
  open: boolean
  onClose: () => void
  settings: Settings
  onSave: (next: Settings) => void
  llmEnabled: boolean
  apiOnline: boolean
}) {
  const [draft, setDraft] = useState<Settings>(settings)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  // The reviewer identity used for policy approval (Login.tsx / ApprovalModal)
  // persists silently via Supabase's own session storage - there was no UI
  // anywhere that showed you were signed in or let you end that session.
  // This tracks the real current session, not a locally-guessed flag.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  async function signOut() {
    setSigningOut(true)
    try {
      await supabase.auth.signOut()
    } finally {
      setSigningOut(false)
    }
  }

  // Without this, the page behind stays scrollable while the modal is open -
  // a scroll/trackpad gesture aimed at the panel can leak through to the
  // (very tall, 15-section) dashboard behind it instead of staying inside
  // the panel's own scroll area, which is exactly what makes a modal feel
  // broken/unresponsive even though every element on it still works fine.
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])

  // This component never unmounts (only its modal JSX is conditionally
  // rendered via `open`), so `useState(settings)` above only applies on the
  // very first mount - without this, a cancelled edit from a previous open
  // would silently resurface next time, and a save from elsewhere wouldn't
  // be reflected. Re-sync the draft to the real saved settings every time
  // the panel is (re)opened.
  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])

  function save() {
    onSave(draft)
    onClose()
  }

  function resetToDefaults() {
    setDraft({ ...DEFAULT_SETTINGS })
  }

  async function previewVoice() {
    setPreviewBusy(true)
    setPreviewError(false)
    const sampleText = "This is what I'll sound like reading a reply aloud."
    try {
      const res = await fetch(api.ttsUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sampleText, voice: draft.voiceId }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
    } catch {
      setPreviewError(true)
    } finally {
      setPreviewBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(20,17,10,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className="glass-card w-[460px] max-w-[92vw] max-h-[85vh] p-7 relative"
            // .glass-card sets `overflow: hidden` as a plain (unlayered)
            // CSS rule, which silently beats Tailwind's `overflow-y-auto`
            // utility class regardless of source order - Tailwind v4 puts
            // its utilities in a lower-priority @layer. Only an inline
            // style reliably wins that cascade, same fix as the chat
            // panel's `position: fixed` override earlier in this project.
            style={{ background: 'rgba(255,255,255,0.97)', overflowY: 'auto', overscrollBehavior: 'contain' }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700"><X size={18} /></button>

            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-none" style={{ background: 'rgba(43,93,94,0.1)' }}>
                <SettingsIcon size={16} className="text-[#2B5D5E]" />
              </div>
              <h2 className="text-lg font-bold">Settings</h2>
            </div>

            {/* Account */}
            <div className="mb-6">
              <SectionLabel icon={<User size={12} />}>Account</SectionLabel>
              <div className="rounded-xl border border-black/5 px-4 py-3">
                {session ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] text-neutral-400 uppercase tracking-wide">Signed in as</div>
                      <div className="text-sm font-semibold truncate">{session.user.email}</div>
                    </div>
                    <button
                      onClick={signOut}
                      disabled={signingOut}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A6392F] hover:bg-[#A6392F]/8 px-2.5 py-1.5 rounded-lg transition-colors flex-none disabled:opacity-50"
                    >
                      <LogOut size={13} />
                      {signingOut ? 'Signing out…' : 'Sign out'}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-neutral-500">Not signed in</span>
                    <Link
                      to="/account"
                      onClick={onClose}
                      className="text-xs font-semibold text-[#2B5D5E] hover:underline"
                    >
                      Sign in
                    </Link>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-neutral-400 mt-2">
                This is the reviewer identity used to approve a policy (section 5) and to open the dashboard.
              </p>
            </div>

            {/* System status */}
            <div className="mb-6">
              <SectionLabel icon={<Zap size={12} />}>System status</SectionLabel>
              <div className="rounded-xl border border-black/5 divide-y divide-black/5">
                <StatusRow label="Backend" ok={apiOnline} okText="Live" badText="Offline" pulse />
                <StatusRow
                  label="Groq (AI features)"
                  ok={llmEnabled}
                  okText="Configured"
                  badText="Not configured"
                  hint={!llmEnabled ? 'Set GROQ_API_KEY in backend/.env, then restart the backend.' : undefined}
                />
              </div>
              <p className="text-[11px] text-neutral-400 mt-2">
                Status only — real keys stay server-side in <code>backend/.env</code> and are never entered or shown here. Nothing in this panel can see or set a secret.
              </p>
            </div>

            {/* Voice preferences */}
            <div className="mb-6">
              <SectionLabel icon={<Volume2 size={12} />}>Voice</SectionLabel>
              <label className="flex items-center justify-between gap-3 mb-3">
                <span className="text-sm">Read chat replies aloud by default</span>
                <Toggle checked={draft.speakByDefault} onChange={v => setDraft(d => ({ ...d, speakByDefault: v }))} />
              </label>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">Voice</label>
              <div className="flex items-center gap-2">
                <select
                  value={draft.voiceId}
                  onChange={e => setDraft(d => ({ ...d, voiceId: e.target.value }))}
                  className="input flex-1"
                >
                  {VOICE_OPTIONS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
                <button
                  onClick={previewVoice}
                  disabled={previewBusy}
                  title="Preview this voice"
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-none text-white transition-colors disabled:opacity-60"
                  style={{ background: '#2B5D5E' }}
                >
                  {previewBusy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                </button>
              </div>
              {previewError && <p className="text-[11px] text-[#A6392F] mt-1.5">Couldn't reach the voice endpoint — check the backend is running.</p>}
              <p className="text-[11px] text-neutral-400 mt-1.5">Free neural voices (edge-tts, no API key). Falls back to your browser's built-in voice if this ever fails.</p>
            </div>

            {/* Chat commands */}
            <div className="mb-6">
              <SectionLabel icon={<Zap size={12} />}>Chat commands</SectionLabel>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm pr-4">Let chat trigger actions (retrain, run the autonomous engineer, navigate)</span>
                <Toggle checked={draft.commandsEnabled} onChange={v => setDraft(d => ({ ...d, commandsEnabled: v }))} />
              </label>
              <p className="text-[11px] text-neutral-400 mt-1.5">
                {draft.commandsEnabled
                  ? 'Chat can run these already-safe, reversible pipeline stages on request. Approving or deploying a policy is never reachable from chat, on or off — that boundary doesn\'t depend on this switch.'
                  : 'Off — chat only answers questions now, exactly like a read-only assistant. It will not trigger anything, even a retrain.'}
              </p>
            </div>

            {/* Retrain defaults */}
            <div className="mb-6">
              <SectionLabel icon={<RefreshCw size={12} />}>Retrain defaults</SectionLabel>
              <p className="text-[11px] text-neutral-400 mb-2">Pre-fills section 4.9's retrain form — doesn't change any already-registered policy.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">Max depth (1–10)</label>
                  <input
                    type="number" min={1} max={10}
                    value={draft.retrainDefaultDepth}
                    onChange={e => setDraft(d => ({ ...d, retrainDefaultDepth: Math.min(10, Math.max(1, Number(e.target.value) || 1)) }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">Min samples/leaf (2–200)</label>
                  <input
                    type="number" min={2} max={200}
                    value={draft.retrainDefaultLeaf}
                    onChange={e => setDraft(d => ({ ...d, retrainDefaultLeaf: Math.min(200, Math.max(2, Number(e.target.value) || 2)) }))}
                    className="input"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={resetToDefaults} title="Reset to defaults" className="px-3.5 py-2.5 rounded-xl text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors flex-none">
                <RotateCcw size={16} />
              </button>
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-neutral-700 font-semibold bg-neutral-100 hover:bg-neutral-200 transition-colors">
                Cancel
              </button>
              <button onClick={save} className="gold-btn flex-1 py-2.5 rounded-xl">
                Save
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function StatusRow({ label, ok, okText, badText, hint, pulse }: { label: string; ok: boolean; okText: string; badText: string; hint?: string; pulse?: boolean }) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{label}</span>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${ok ? 'text-[#356B3F]' : 'text-neutral-400'}`}>
          {ok
            ? (pulse
                ? <span className="relative flex w-2.5 h-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: '#356B3F' }} />
                    <span className="relative inline-flex rounded-full w-2.5 h-2.5" style={{ background: '#356B3F' }} />
                  </span>
                : <CheckCircle2 size={13} />)
            : <XCircle size={13} />}
          {ok ? okText : badText}
        </span>
      </div>
      {hint && <p className="text-[11px] text-neutral-400 mt-1">{hint}</p>}
    </div>
  )
}
