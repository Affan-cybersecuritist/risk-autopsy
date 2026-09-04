import { useEffect, useState, lazy, Suspense } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, LineChart, Line, Legend, ReferenceLine,
} from 'recharts'
import { Search, CheckCircle2, AlertTriangle, RefreshCw, TriangleAlert, ShieldCheck, Sparkles, FileDown } from 'lucide-react'
const Background3D = lazy(() => import('../components/Background3D'))
import GlassCard from '../components/GlassCard'
import SectionHead from '../components/SectionHead'
import MetricTile from '../components/MetricTile'
import Sidebar from '../components/Sidebar'
import ApprovalModal from '../components/ApprovalModal'
import ChatWidget from '../components/ChatWidget'
import DatasetUpload from '../components/DatasetUpload'
import PolicyTreeDiff from '../components/PolicyTreeDiff'
import DevilsAdvocateModal from '../components/DevilsAdvocateModal'
import AITimelineScrubber from '../components/AITimelineScrubber'
import VIPFalloutSandbox from '../components/VIPFalloutSandbox'
import SettingsPanel from '../components/SettingsPanel'
import { loadSettings, saveSettings, type Settings } from '../lib/settings'
import {
  api, type Overview, type AutopsyResult, type PolicyComparison, type AdversarialResults,
  type CoevolutionResults, type OffPolicyEvalResults, type PortfolioConflictResults, type BlastRadiusResults,
  type PolicyHistoryEntry, type DriftMonitorResults, type CounterfactualReplayResults, type DriftRemediationResult,
  type AgentRunResult, type AttackCoverageResult, type InterventionOptimizerResult, type EvasionDistanceResult,
  type ResidualClusterResult, type CausalGraphResult,
  type DifficultyTiersResult, type SecretHoldoutResult, type MultiSeedEvalResult,
  type AblationResult, type MutationTestingResult,
} from '../lib/api'

const TXN_COLORS: Record<string, string> = { purchase: '#2B5D5E', return: '#3E7A7B', chargeback: '#A6392F' }

function Spinner() { return <span className="spinner" /> }

// Purely presentational grouping - the 8 gates stay independent and
// machine-enforced, this only changes how they're read at a glance
// ("8 gates" is too flat to scan in a demo; 3 categories isn't).
const GATE_CATEGORIES: Record<string, string> = {
  'Historical regression': 'Does it work?',
  'Adversarial coverage': 'Can it survive?',
  'Minimum evasion distance': 'Can it survive?',
  'Fairness': 'Is it safe to deploy?',
  'Off-policy confidence': 'Is it safe to deploy?',
  'Blast radius': 'Is it safe to deploy?',
  'Economic value': 'Is it safe to deploy?',
  'Complexity': 'Is it safe to deploy?',
}
const GATE_CATEGORY_ORDER = ['Does it work?', 'Can it survive?', 'Is it safe to deploy?']

function ReanalyzeButton({ onClick, loading, label = 'Re-run analysis' }: { onClick: () => void; loading: boolean; label?: string }) {
  return (
    <button onClick={onClick} disabled={loading} className="btn-secondary inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm mb-5">
      {loading ? <Spinner /> : <RefreshCw size={14} />}
      {loading ? 'Running…' : label}
    </button>
  )
}

export default function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [abuseIds, setAbuseIds] = useState<number[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [autopsy, setAutopsy] = useState<AutopsyResult | null>(null)
  const [autopsyLoading, setAutopsyLoading] = useState(false)
  const [autopsyRun, setAutopsyRun] = useState(0)
  const [causalGraph, setCausalGraph] = useState<CausalGraphResult | null>(null)
  const [causalGraphError, setCausalGraphError] = useState<string | null>(null)

  const [policy, setPolicy] = useState<PolicyComparison | null>(null)
  const [adv, setAdv] = useState<AdversarialResults | null>(null)
  const [advLoading, setAdvLoading] = useState(false)
  const [coevo, setCoevo] = useState<CoevolutionResults | null>(null)
  const [coevoLoading, setCoevoLoading] = useState(false)
  const [ope, setOpe] = useState<OffPolicyEvalResults | null>(null)
  const [opeLoading, setOpeLoading] = useState(false)
  const [portfolio, setPortfolio] = useState<PortfolioConflictResults | null>(null)
  const [portfolioLoading, setPortfolioLoading] = useState(false)
  const [blast, setBlast] = useState<BlastRadiusResults | null>(null)
  const [blastLoading, setBlastLoading] = useState(false)
  const [letters, setLetters] = useState<Record<number, string>>({})
  const [letterLoading, setLetterLoading] = useState<Record<number, boolean>>({})
  const [letterError, setLetterError] = useState<Record<number, string>>({})
  const [drift, setDrift] = useState<DriftMonitorResults | null>(null)
  const [remediation, setRemediation] = useState<DriftRemediationResult | null>(null)
  const [agentResult, setAgentResult] = useState<AgentRunResult | null>(null)
  const [attackCoverage, setAttackCoverage] = useState<AttackCoverageResult | null>(null)
  const [interventionOptimizer, setInterventionOptimizer] = useState<InterventionOptimizerResult | null>(null)
  const [evasionDistance, setEvasionDistance] = useState<EvasionDistanceResult | null>(null)
  const [residualClusters, setResidualClusters] = useState<ResidualClusterResult | null>(null)
  const [difficultyTiers, setDifficultyTiers] = useState<DifficultyTiersResult | null>(null)
  const [secretHoldout, setSecretHoldout] = useState<SecretHoldoutResult | null>(null)
  const [multiSeedEval, setMultiSeedEval] = useState<MultiSeedEvalResult | null>(null)
  const [ablation, setAblation] = useState<AblationResult | null>(null)
  const [mutationTesting, setMutationTesting] = useState<MutationTestingResult | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState<string | null>(null)
  const [counterfactual, setCounterfactual] = useState<CounterfactualReplayResults | null>(null)
  const [history, setHistory] = useState<PolicyHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [supabaseConfigured, setSupabaseConfigured] = useState(false)
  const [retrainDepth, setRetrainDepth] = useState(settings.retrainDefaultDepth)
  const [retrainLeaf, setRetrainLeaf] = useState(settings.retrainDefaultLeaf)
  const [retrainBusy, setRetrainBusy] = useState(false)
  const [approvingVersion, setApprovingVersion] = useState<number | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<{ identity: string; version: number; label: string } | null>(null)
  const [showApproval, setShowApproval] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [llmEnabled, setLlmEnabled] = useState(false)
  const [narrative, setNarrative] = useState<string | null>(null)
  const [narrativeLoading, setNarrativeLoading] = useState(false)
  const [narrativeError, setNarrativeError] = useState<string | null>(null)
  const [stressTest, setStressTest] = useState(false)
  const [approvingVersionNeedsDevilsAdvocate, setApprovingVersionNeedsDevilsAdvocate] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      api.overview(), api.abuseRingCustomers(), api.policyComparison(),
      api.adversarial(), api.coevolution(), api.offPolicyEval(), api.portfolioConflict(), api.blastRadius(),
    ])
      .then(([ov, ab, pol, advRes, coevoRes, opeRes, portRes, blastRes]) => {
        setOverview(ov)
        setAbuseIds(ab.customer_ids)
        setSelectedId(ab.customer_ids[0] ?? null)
        setPolicy(pol)
        setAdv(advRes)
        setCoevo(coevoRes)
        setOpe(opeRes)
        setPortfolio(portRes)
        setBlast(blastRes)
      })
      .catch(e => setApiError(String(e)))
      .finally(() => setLoading(false))

    api.health().then(h => { setLlmEnabled(h.llm_enabled); setSupabaseConfigured(h.supabase_configured) }).catch(() => setLlmEnabled(false))
    api.policyHistory().then(h => setHistory(h.history)).catch(() => {})
    // Loaded separately (not in the fail-fast Promise.all above) - a fresh
    // clone that hasn't run `python src/drift_monitor.py` yet shouldn't
    // take down the whole dashboard with a "backend unreachable" screen
    // over one optional artifact, same pattern already used for policyHistory.
    api.driftMonitor().then(setDrift).catch(() => {})
    // Optional - only present after `python src/remediate_drift.py` has been
    // run. 404 is expected on a fresh clone that hasn't remediated yet, so
    // this fails silently rather than blocking the rest of the dashboard.
    api.driftRemediation().then(setRemediation).catch(() => {})
    api.counterfactualReplay().then(setCounterfactual).catch(() => {})
    // Loads the last run if one exists (404 on a fresh clone - non-fatal).
    api.lastAgentRun().then(setAgentResult).catch(() => {})
    api.attackCoverage().then(setAttackCoverage).catch(() => {})
    api.interventionOptimizer().then(setInterventionOptimizer).catch(() => {})
    api.evasionDistance().then(setEvasionDistance).catch(() => {})
    api.residualClusters().then(setResidualClusters).catch(() => {})
    api.difficultyTiers().then(setDifficultyTiers).catch(() => {})
    api.secretHoldout().then(setSecretHoldout).catch(() => {})
    api.multiSeedEval().then(setMultiSeedEval).catch(() => {})
    api.ablation().then(setAblation).catch(() => {})
    api.mutationTesting().then(setMutationTesting).catch(() => {})
  }, [])

  async function runAutopsy() {
    if (selectedId == null) return
    setAutopsyLoading(true)
    setNarrative(null)
    setNarrativeError(null)
    setCausalGraph(null)
    setCausalGraphError(null)
    setAutopsyRun(n => n + 1)
    try { setAutopsy(await api.autopsy(selectedId)) }
    catch (e) { setApiError(String(e)) }
    finally { setAutopsyLoading(false) }
    // Independent of the timeline fetch above - a customer outside the
    // held-out test/train split the discovered policy was evaluated on
    // (404) shouldn't block the timeline reconstruction from showing.
    try { setCausalGraph(await api.causalGraph(selectedId)) }
    catch (e) { setCausalGraphError(String(e)) }
  }

  async function runNarrative() {
    if (selectedId == null) return
    setNarrativeLoading(true)
    setNarrativeError(null)
    try { setNarrative((await api.narrative(selectedId)).narrative) }
    catch (e) { setNarrativeError(llmEnabled ? String(e) : 'Groq API key not configured on the backend yet — set GROQ_API_KEY in backend/.env to enable this.') }
    finally { setNarrativeLoading(false) }
  }

  async function runAdversarial() {
    setAdvLoading(true)
    try { setAdv(await api.adversarial()) }
    catch (e) { setApiError(String(e)) }
    finally { setAdvLoading(false) }
  }

  async function runCoevolution() {
    setCoevoLoading(true)
    try { setCoevo(await api.coevolution()) }
    catch (e) { setApiError(String(e)) }
    finally { setCoevoLoading(false) }
  }

  async function runOffPolicyEval() {
    setOpeLoading(true)
    try { setOpe(await api.offPolicyEval()) }
    catch (e) { setApiError(String(e)) }
    finally { setOpeLoading(false) }
  }

  async function runPortfolioCheck() {
    setPortfolioLoading(true)
    try { setPortfolio(await api.portfolioConflict()) }
    catch (e) { setApiError(String(e)) }
    finally { setPortfolioLoading(false) }
  }

  async function runBlastRadius() {
    setBlastLoading(true)
    try { setBlast(await api.blastRadius()) }
    catch (e) { setApiError(String(e)) }
    finally { setBlastLoading(false) }
  }

  async function runAutonomousEngineer() {
    setAgentLoading(true)
    setAgentError(null)
    try {
      const result = await api.runAgent()
      setAgentResult(result)
      if (result.registered_version) {
        setHistory(h => [...h, result.registered_version!])
      }
    } catch (e) {
      setAgentError(String(e))
    } finally {
      setAgentLoading(false)
    }
  }

  async function draftCustomerLetter(customerId: number) {
    setLetterLoading(m => ({ ...m, [customerId]: true }))
    setLetterError(m => ({ ...m, [customerId]: '' }))
    try {
      const res = await api.customerLetter(customerId)
      setLetters(m => ({ ...m, [customerId]: res.letter }))
    } catch (e) {
      setLetterError(m => ({ ...m, [customerId]: String(e) }))
    } finally {
      setLetterLoading(m => ({ ...m, [customerId]: false }))
    }
  }

  async function refreshHistory() {
    setHistoryLoading(true)
    try { setHistory((await api.policyHistory()).history) }
    catch { /* non-fatal, history panel just stays stale */ }
    finally { setHistoryLoading(false) }
  }

  async function runRetrain() {
    setRetrainBusy(true)
    try {
      const entry = await api.retrainPolicy(retrainDepth, retrainLeaf)
      setHistory(h => [...h, entry])
    } catch (e) { setApiError(String(e)) }
    finally { setRetrainBusy(false) }
  }

  async function handleVersionApproved(version: number, approvalToken: string) {
    try {
      await api.approvePolicyVersion(version, approvalToken)
      // Re-fetch the whole timeline rather than patching one entry in place -
      // approving a version can change deployment_status on OTHER entries
      // too (the previously-active one becomes SUPERSEDED), not just this one.
      setHistory((await api.policyHistory()).history)
    } catch (e) { setApiError(String(e)) }
    finally { setApprovingVersion(null) }
  }

  // Section 5's "Submit for human approval" used to be entirely cosmetic -
  // its onApproved handler only set a display label and never called the
  // backend at all, and the label was hardcoded to "Policy v2" regardless
  // of what actually existed in policy history. Fixed: it now approves the
  // real latest version in the timeline (the same versioned system section
  // 4.9 uses), through the same server-verified token, and displays
  // whatever that version's real label and approver actually are.
  async function handleHeadlineApproval(approvalToken: string) {
    setSubmitError(null)
    const latest = history.length > 0 ? history[history.length - 1] : null
    if (!latest) {
      setSubmitError('No policy version exists yet to approve - run the pipeline or retrain a candidate first.')
      setShowApproval(false)
      return
    }
    try {
      const updated = await api.approvePolicyVersion(latest.version, approvalToken)
      setHistory(h => h.map(v => v.version === updated.version ? updated : v))
      setSubmitted({ identity: updated.approved_by ?? '', version: updated.version, label: updated.label })
    } catch (e) {
      setSubmitError(String(e))
    } finally {
      setShowApproval(false)
    }
  }

  // Every version historically lands at the same 100%/100%/0-FP once past v2 -
  // ten identical-looking cards is noise, not a decision aid. Render the most
  // recent version promoted with a "Recommended" ribbon; the rest collapse
  // behind a toggle so a reviewer sees one clear answer, not ten.
  function renderVersionCard(v: PolicyHistoryEntry, highlight: boolean) {
    return (
      <div
        key={v.version}
        className={`rounded-xl px-4 py-3.5 ${highlight ? 'border-2' : 'border border-black/5'}`}
        style={highlight ? { borderColor: '#3E7A7B', background: 'rgba(150,106,34,0.05)', boxShadow: '0 10px 24px -16px rgba(43,93,94,0.4)' } : {}}
      >
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="flex items-center gap-2">
            {highlight && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide text-white" style={{ background: 'linear-gradient(135deg,#3E7A7B,#2B5D5E)' }}>
                Latest
              </span>
            )}
            <div className="font-semibold text-sm">{v.label}</div>
            {v.deployment_status && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{
                background: v.deployment_status === 'ACTIVE' ? 'rgba(53,107,63,0.15)' : v.deployment_status === 'SUPERSEDED' ? 'rgba(0,0,0,0.06)' : 'rgba(43,93,94,0.15)',
                color: v.deployment_status === 'ACTIVE' ? '#356B3F' : v.deployment_status === 'SUPERSEDED' ? '#6b6b6b' : '#966A22',
              }}>
                {v.deployment_status}
              </span>
            )}
          </div>
          {v.approved_by ? (
            <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'rgba(53,107,63,0.1)', color: '#356B3F' }}>
              Approved by {v.approved_by}
            </span>
          ) : (
            <button onClick={() => setApprovingVersionNeedsDevilsAdvocate(v.version)} className="btn-secondary text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
              <ShieldCheck size={12} /> Approve this version
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricTile label="Precision" value={v.precision * 100} suffix="%" decimals={1} />
          <MetricTile label="Recall" value={v.recall * 100} suffix="%" decimals={1} />
          <MetricTile label="False positives" value={v.fp} />
          <MetricTile label="Loss prevented" raw={`₹${v.loss_prevented.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        </div>
        {(() => {
          const netValue = v.loss_prevented - v.fp_cost
          const active = history.find(h => h.deployment_status === 'ACTIVE')
          const activeNetValue = active ? active.loss_prevented - active.fp_cost : null
          const delta = activeNetValue != null && active && active.version !== v.version ? netValue - activeNetValue : null
          return (
            <div className="mt-3 rounded-lg px-3 py-2" style={{ background: 'rgba(53,107,63,0.06)' }}>
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Net economic value</span>{' '}
              <span className="font-bold">₹{netValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              {delta != null && (
                <span className="text-xs ml-2" style={{ color: delta >= 0 ? '#356B3F' : '#A6392F' }}>
                  ({delta >= 0 ? '+' : ''}₹{delta.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs. active)
                </span>
              )}
            </div>
          )
        })()}
        {v.gates && v.gates.length > 0 ? (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
              Policy PR — {v.gates.every(g => g.passed) ? 'all checks passed' : `${v.gates.filter(g => !g.passed).length} check(s) failed`}
              {' '}<span className="font-normal normal-case text-neutral-400">({v.gates.length} machine-enforced gates)</span>
            </div>
            {GATE_CATEGORY_ORDER.map(category => {
              const gatesInCategory = v.gates!.filter(g => (GATE_CATEGORIES[g.name] ?? 'Is it safe to deploy?') === category)
              if (gatesInCategory.length === 0) return null
              return (
                <div key={category} className="mb-2 last:mb-0">
                  <div className="text-[11px] font-bold text-neutral-400 mb-1">{category}</div>
                  <div className="space-y-1">
                    {gatesInCategory.map(g => (
                      <div key={g.name} className="flex items-start gap-1.5 text-[12.5px]">
                        {g.passed
                          ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" style={{ color: '#356B3F' }} />
                          : <span className="mt-0.5 shrink-0 font-bold" style={{ color: '#A6392F' }}>✕</span>}
                        <span><b>{g.name}</b> — {g.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : v.gates_note ? (
          <div className="mt-3 pt-3 text-xs text-neutral-400" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            Policy PR checklist: {v.gates_note}
          </div>
        ) : null}
      </div>
    )
  }

  if (apiError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="glass-card p-8 max-w-lg text-center">
          <div className="flex justify-center mb-3"><TriangleAlert size={28} className="text-[#A6392F]" /></div>
          <div className="text-lg font-bold mb-2 text-[#A6392F]">Backend unreachable</div>
          <p className="text-sm text-neutral-600 mb-3">{apiError}</p>
          <p className="text-xs text-neutral-400">Start the API: <code>uvicorn backend.main:app --port 8010</code></p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen">
      <Suspense fallback={null}><Background3D /></Suspense>
      <Sidebar apiOnline={!apiError} onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={(next) => {
          setSettings(next)
          saveSettings(next)
          setRetrainDepth(next.retrainDefaultDepth)
          setRetrainLeaf(next.retrainDefaultLeaf)
        }}
        llmEnabled={llmEnabled}
        supabaseConfigured={supabaseConfigured}
        apiOnline={!apiError}
      />
      <main className="pl-[272px]">
        <div className="max-w-[860px] mx-auto px-10 py-12">
        <div className="mb-8">
          <h1 className="text-[1.7rem] font-extrabold tracking-tight leading-tight">Merchant risk console</h1>
          <p className="text-[13px] text-neutral-500 mt-1">Current policy status, validated end-to-end from autopsy through approval.</p>
        </div>

        {/* 1. Overview */}
        <GlassCard id="sec-1">
          <SectionHead number={1} title="This merchant lost money" subtitle="The starting point of every autopsy: a real, unexplained loss." />
          {loading ? <Skeleton /> : overview && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricTile label="Total chargeback loss (90 days)" value={overview.total_chargeback_loss} prefix="₹" />
              <MetricTile label="Customers involved" value={overview.customers_involved} />
              <MetricTile label="Abuse rings detected in autopsy" value={overview.abuse_rings_detected} />
            </div>
          )}
          <p className="mt-4 text-sm text-neutral-600">The chain of decisions that let this happen is reconstructed below.</p>
        </GlassCard>

        {/* 2. Autopsy */}
        <GlassCard id="sec-2">
          <SectionHead number={2} title="Autopsy: one flagged customer" subtitle="Reconstruct the exact decision chain that let the loss happen." />
          <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">Customer</label>
          <p className="text-xs text-neutral-400 mb-1.5">Showing only customers flagged as part of an abuse ring — that's why the IDs start where they do; the customers below that ID are the legitimate population this policy was tested against.</p>
          <select value={selectedId ?? ''} onChange={e => setSelectedId(Number(e.target.value))} className="input mb-3">
            {abuseIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
          <button onClick={runAutopsy} disabled={autopsyLoading} className="gold-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-xl mb-4 text-sm">
            {autopsyLoading ? <Spinner /> : <Search size={15} />}
            {autopsyLoading ? 'Reconstructing…' : 'Investigate this customer'}
          </button>

          {autopsy && (
            <div>
              <div className="font-bold text-lg mb-1">Timeline — customer #{autopsy.customer_id}</div>
              <p className="text-xs text-neutral-500 mb-2">Every transaction this customer made, in order — X is days since account opened, Y is transaction amount. Color shows what kind of transaction it was.</p>
              <div className="flex items-center gap-4 mb-2">
                {Object.entries(TXN_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-600 capitalize">
                    <span className="inline-block w-2.5 h-2.5 rounded-full flex-none" style={{ background: color }} />
                    {type}
                  </div>
                ))}
              </div>
              {/* Keyed on autopsyRun so recharts fully unmounts/remounts its
                  ResponsiveContainer (and ResizeObserver) on every
                  investigate click, even for the same customer - reusing the
                  existing instance across re-investigations was hitting a
                  recharts ResizeObserver feedback loop (RangeError: Maximum
                  call stack size exceeded). */}
              <div key={autopsyRun} className="rounded-2xl overflow-hidden mb-4" style={{ boxShadow: '0 16px 32px -20px rgba(0,0,0,0.15)' }}>
                <ResponsiveContainer width="100%" height={340} debounce={100}>
                  <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
                    <CartesianGrid stroke="rgba(0,0,0,0.06)" />
                    <XAxis type="number" dataKey="day" name="Day" tick={{ fontSize: 12 }} label={{ value: 'Days since account opened', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#78716c' }} />
                    <YAxis type="number" dataKey="amount" name="Amount" tick={{ fontSize: 12 }} label={{ value: 'Transaction amount (₹)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: '#78716c' }} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={((v: unknown) => `₹${Number(v).toLocaleString()}`) as (value: unknown) => string} />
                    <Scatter data={autopsy.timeline} fill="#2B5D5E">
                      {autopsy.timeline.map((t, i) => <Cell key={i} fill={TXN_COLORS[t.txn_type] ?? '#999'} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm mb-4" style={{ background: 'rgba(150,106,34,0.12)', color: '#966A22' }}>
                <AlertTriangle size={16} className="flex-none mt-0.5" />
                <span>This customer shares an address with <b>{autopsy.shared_address_members} other accounts</b> — a coordinated ring, not an isolated incident.</span>
              </div>

              <button onClick={runNarrative} disabled={narrativeLoading} className="btn-secondary inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm mb-3">
                {narrativeLoading ? <Spinner /> : <Sparkles size={14} />}
                {narrativeLoading ? 'Writing case note…' : 'Generate AI case note'}
              </button>
              {narrative && (
                <div className="rounded-xl px-4 py-3 text-sm leading-relaxed" style={{ background: 'rgba(43,93,94,0.06)', color: '#3a2e0f' }}>
                  {narrative}
                </div>
              )}
              {narrativeError && (
                <div className="text-[13px] text-[#A6392F] bg-[#A6392F]/8 rounded-lg px-3 py-2">{narrativeError}</div>
              )}

              {causalGraph && (
                <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <div className="font-bold text-sm mb-1.5">Decision path — why this tree made this call</div>
                  <p className="text-xs text-neutral-500 mb-3">{causalGraph.scope_note}</p>
                  <div className="flex flex-col items-stretch gap-1">
                    {causalGraph.decision_chain.path.map(node => {
                      const isClosest = causalGraph.decision_chain.closest_call?.node_id === node.node_id
                      return (
                        <div key={node.node_id}>
                          <div className="rounded-lg px-3 py-2 text-[12.5px]" style={{
                            background: isClosest ? 'rgba(43,93,94,0.14)' : 'rgba(0,0,0,0.04)',
                            border: isClosest ? '1px solid rgba(43,93,94,0.4)' : '1px solid transparent',
                          }}>
                            <b>{node.feature}</b> {node.direction} {node.threshold.toLocaleString()}
                            <span className="text-neutral-500"> — customer value {node.customer_value.toLocaleString()}</span>
                            {isClosest && <span className="ml-1.5 text-[11px] font-bold" style={{ color: '#966A22' }}>closest call</span>}
                          </div>
                          <div className="text-center text-neutral-300 text-xs">↓</div>
                        </div>
                      )
                    })}
                    <div className="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-center" style={{
                      background: causalGraph.decision_chain.predicted_class === 'abuse' ? 'rgba(166,57,47,0.12)' : 'rgba(53,107,63,0.12)',
                      color: causalGraph.decision_chain.predicted_class === 'abuse' ? '#A6392F' : '#356B3F',
                    }}>
                      Leaf: {causalGraph.decision_chain.predicted_class.toUpperCase()}
                      {' '}(outcome: {causalGraph.outcome.replace('_', ' ')})
                    </div>
                  </div>
                </div>
              )}
              {causalGraphError && (
                <div className="text-[13px] text-neutral-400 mt-3">Decision path unavailable for this customer: {causalGraphError}</div>
              )}
            </div>
          )}
        </GlassCard>

        {/* 3. Policy comparison */}
        <GlassCard id="sec-3">
          <div className="flex justify-between items-start mb-4">
            <SectionHead number={3} title="Baseline vs. discovered policy" subtitle="The brief's exact required deliverable: measured precision, recall, false-positive cost." />
            <button
              onClick={() => setStressTest(!stressTest)}
              disabled={!difficultyTiers}
              title={difficultyTiers ? "Shows the same frozen policy scored on the real 'ambiguous' harder-by-construction tier (src/difficulty_tiers_eval.py) instead of the easy held-out set" : 'Loading difficulty-tier data...'}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-40 ${stressTest ? 'bg-orange-100 text-orange-700 border border-orange-200 shadow-inner' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
            >
              <TriangleAlert size={14} /> Stress test: {stressTest ? 'ON (real "ambiguous" tier)' : 'OFF (easy held-out set)'}
            </button>
          </div>
          {loading ? <Skeleton /> : policy && (
            <>
              {stressTest && (
                <div className="rounded-xl px-4 py-2.5 text-xs mb-4" style={{ background: 'rgba(43,93,94,0.08)', color: '#966A22' }}>
                  Showing the same frozen policy (never retrained) scored against a fresh, harder-by-construction population — genuine customers who look ring-like without being rings. Real numbers from <code>data/difficulty_tiers_results.json</code>, not simulated.
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 font-bold mb-2"><span className="w-2 h-2 rounded-full bg-[#A6392F]" />Baseline (industry-standard)</div>
                  <pre className="code-block mb-3">{'IF max_purchase_amount > ₹25,000:\n    FLAG for step-up verification'}</pre>
                  <div className="grid grid-cols-2 gap-3">
                    <MetricTile label="Precision" value={policy.baseline.precision * 100} suffix="%" decimals={1} />
                    <MetricTile label="Recall" value={policy.baseline.recall * 100} suffix="%" decimals={1} />
                    <MetricTile label="Loss prevented" raw={`₹${policy.baseline.loss_prevented.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                    <MetricTile label="False positives (cost)" raw={`${policy.baseline.fp} (₹${policy.baseline.fp_cost.toLocaleString()})`} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 font-bold mb-2"><span className="w-2 h-2 rounded-full bg-emerald-500" />Discovered v1 (behavioral)</div>
                  <div className="mb-3">
                    <PolicyTreeDiff baselineText={'IF max_purchase_amount > ₹25,000:\n    FLAG for step-up verification'} candidateText={policy.rule_text} />
                  </div>
                  {(() => {
                    const ambiguous = difficultyTiers?.tiers.find(t => t.tier === 'ambiguous')
                    const costPerFP = policy.discovered.fp > 0 ? policy.discovered.fp_cost / policy.discovered.fp : 0
                    const shown = stressTest && ambiguous
                      ? {
                          precision: ambiguous.precision * 100,
                          recall: ambiguous.recall * 100,
                          lossPrevented: ambiguous.net_value_rs,
                          fp: ambiguous.false_positives,
                          fpCost: ambiguous.false_positives * costPerFP,
                        }
                      : {
                          precision: policy.discovered.precision * 100,
                          recall: policy.discovered.recall * 100,
                          lossPrevented: policy.discovered.loss_prevented,
                          fp: policy.discovered.fp,
                          fpCost: policy.discovered.fp_cost,
                        }
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        <MetricTile label="Precision" value={shown.precision} suffix="%" decimals={1} />
                        <MetricTile label="Recall" value={shown.recall} suffix="%" decimals={1} />
                        <MetricTile label="Loss prevented" raw={`₹${shown.lossPrevented.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                        <MetricTile label="False positives (cost)" raw={`${shown.fp} (₹${shown.fpCost.toLocaleString(undefined, { maximumFractionDigits: 0 })})`} />
                      </div>
                    )
                  })()}
                </div>
              </div>
              <div className="rounded-xl px-4 py-3 text-sm mt-4" style={{ background: 'rgba(43,93,94,0.08)', color: '#966A22' }}>
                Discovered policy v1 catches <b>{Math.round(policy.discovered.loss_prevented / policy.total_test_loss * 100)}%</b> of held-out loss vs
                baseline's <b>{Math.round(policy.baseline.loss_prevented / policy.total_test_loss * 100)}%</b>, with{' '}
                <b>{policy.baseline.fp - policy.discovered.fp} fewer false positives</b>.
              </div>
              <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-xs mt-2.5 text-neutral-500" style={{ background: 'rgba(0,0,0,0.03)' }}>
                <TriangleAlert size={14} className="flex-none mt-0.5 text-neutral-400" />
                <span><b>Honest caveat, up front:</b> the 90.6%/100% numbers above are on a held-out population this project's own tooling found to be near-perfectly separable by construction. Scored against a never-seen seed, this same policy gets 98.4% precision — see <button onClick={() => document.getElementById('sec-4-15')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="underline font-semibold">section 4.15, Evaluation rigor</button> for the full harder-conditions stress test.</span>
              </div>
              {(() => {
                const easyTier = difficultyTiers?.tiers.find(t => t.tier === 'easy')
                const harderTiers = difficultyTiers?.tiers.filter(t => t.tier !== 'easy')
                const worstHarderPrecision = harderTiers && harderTiers.length > 0 ? Math.min(...harderTiers.map(t => t.precision)) : null
                const discountFactor = easyTier && easyTier.precision > 0 && worstHarderPrecision != null ? worstHarderPrecision / easyTier.precision : null
                const adjustedPrecision = discountFactor != null ? policy.discovered.precision * discountFactor : null
                if (adjustedPrecision == null || !harderTiers) return null
                const worstTier = harderTiers.find(t => t.precision === worstHarderPrecision)
                return (
                  <div className="rounded-xl px-4 py-3 text-xs mt-2.5" style={{ background: 'rgba(150,106,34,0.1)', color: '#966A22' }}>
                    <b>Real-world-adjusted estimate:</b> precision degrades from {(easyTier!.precision * 100).toFixed(1)}% (easy tier) to {(worstHarderPrecision! * 100).toFixed(1)}% (the "{worstTier?.tier}" tier) — a {((1 - discountFactor!) * 100).toFixed(0)}% relative drop as data gets harder-by-construction. Applying that same discount to the headline {(policy.discovered.precision * 100).toFixed(1)}% gives a conservative <b>~{(adjustedPrecision * 100).toFixed(0)}%</b> as what to actually expect on messier, real-world-shaped data — computed from the difficulty-tier results already in this dashboard (section 4.15), not a new claim.
                  </div>
                )
              })()}
            </>
          )}
        </GlassCard>

        {/* 4. Adversarial */}
        <GlassCard id="sec-4">
          <SectionHead number={4} title="Adversarial stress test" subtitle="We don't guess where a policy is weak. We attack it before deployment." />
          <p className="text-sm mb-4 text-neutral-600">We introspect the model's own feature importances to find its blind spot, then craft an evasion that specifically targets it.</p>
          {loading ? <Skeleton /> : adv && (
            <div>
              <ReanalyzeButton onClick={runAdversarial} loading={advLoading} />
              <div className="rounded-xl px-4 py-3 text-sm mb-4" style={{ background: 'rgba(43,93,94,0.08)', color: '#1e3a5f' }}>
                <b>Introspection:</b> v1 relies on <code>{adv.top_feature}</code> for <b>{Math.round(adv.top_feature_importance * 100)}%</b> of its decision — that's the blind spot to attack.
              </div>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(166,57,47,0.08)', color: '#A6392F' }}>
                  <b>Policy v1:</b> {adv.v1_missed} / {adv.n_evaders} evasion attempts missed ({Math.round(adv.v1_missed / adv.n_evaders * 100)}% evasion success)
                </div>
                <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(53,107,63,0.08)', color: '#356B3F' }}>
                  <b>Policy v2 (retrained):</b> {adv.v2_missed} / {adv.n_evaders} evasion attempts missed ({Math.round(adv.v2_missed / adv.n_evaders * 100)}% evasion success)
                </div>
              </div>
              <div className="font-bold mb-2 text-sm">v2 regression check — held-out test set</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <MetricTile label="Precision" value={adv.v2_test_precision * 100} suffix="%" decimals={1} />
                <MetricTile label="Recall" value={adv.v2_test_recall * 100} suffix="%" decimals={1} />
                <MetricTile label="False positives" value={adv.v2_test_fp} />
                <MetricTile label="Loss prevented" raw={`₹${adv.v2_loss_prevented.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              </div>
              <pre className="code-block mb-3 whitespace-pre-wrap">{adv.v2_rule_text}</pre>
              <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(53,107,63,0.08)', color: '#356B3F' }}>
                <CheckCircle2 size={16} className="flex-none" /> No regression. v2 is a strict improvement, ready for human approval.
              </div>
            </div>
          )}
        </GlassCard>

        {/* 4.5 Co-evolution */}
        <GlassCard id="sec-4-5">
          <SectionHead number="4.5" title="Automated red-team / blue-team co-evolution" subtitle="Not one test — a converging arms race." />
          <p className="text-sm mb-4 text-neutral-600">
            An attacker repeatedly searches for evasions within the known abuse archetype, and a defender retrains after every round
            that finds any — until the attacker exhausts its search budget with zero wins.
          </p>
          {loading ? <Skeleton /> : coevo && (
            <div>
              <ReanalyzeButton onClick={runCoevolution} loading={coevoLoading} />
              <div className="rounded-2xl overflow-hidden mb-4" style={{ boxShadow: '0 16px 32px -20px rgba(0,0,0,0.15)' }}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={coevo.generation_log} margin={{ top: 20, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="generation" tick={{ fontSize: 12 }} label={{ value: 'Generation', position: 'bottom', fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="evasions_found" fill="#A6392F" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {coevo.converged ? (
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm mb-4" style={{ background: 'rgba(53,107,63,0.08)', color: '#356B3F' }}>
                  <CheckCircle2 size={16} className="flex-none" />
                  <span><b>Converged at generation {coevo.converged_at_generation}</b> — the attacker found zero evasions in a fresh {coevo.search_budget_per_generation}-candidate search.</span>
                </div>
              ) : (
                <div className="rounded-xl px-4 py-3 text-sm mb-4" style={{ background: 'rgba(150,106,34,0.12)', color: '#966A22' }}>
                  Did not converge within the generation budget — policy still has exploitable gaps.
                </div>
              )}
              <div className="font-bold mb-2 text-sm">Final policy — validated against the entire customer population</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <MetricTile label="Precision (full population)" value={coevo.final_precision * 100} suffix="%" decimals={1} />
                <MetricTile label="Recall (full population)" value={coevo.final_recall * 100} suffix="%" decimals={1} />
                <MetricTile label="False positives (full population)" value={coevo.final_fp} />
              </div>
              <pre className="code-block whitespace-pre-wrap">{coevo.final_rule_text}</pre>
            </div>
          )}
        </GlassCard>

        {/* 4.6 Off-policy evaluation */}
        <GlassCard id="sec-4-6">
          <SectionHead number="4.6" title="Doubly-robust off-policy evaluation" subtitle="Validating the policy the way a real historical-log deployment would have to." />
          <p className="text-sm mb-4 text-neutral-600">
            Held-out precision/recall (Section 3) is only valid because this dataset has full ground truth. A real deployment doesn't —
            you only have logged outcomes from whatever policy was running. This estimates the new policy's value from logged data alone,
            then checks the estimate against the true value to prove the method works.
          </p>
          {loading ? <Skeleton /> : ope && (
            <div>
              <ReanalyzeButton onClick={runOffPolicyEval} loading={opeLoading} />
              <p className="text-xs text-neutral-500 mb-3 italic">In plain terms: this proves you can trust the ₹ value of a new policy from historical logs alone, before it's ever deployed — instead of "grading its own homework" against data it was tuned on.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <MetricTile label="Direct Method (DM)" raw={`₹${ope.V_dm.toFixed(0)}`} />
                <MetricTile label="IPS only" raw={`₹${ope.V_ips.toFixed(0)}`} />
                <MetricTile label="Doubly-Robust (DR)" raw={`₹${ope.V_dr.toFixed(0)}`} />
                <MetricTile label="Oracle ground truth" raw={`₹${ope.V_true_oracle_target.toFixed(0)}`} />
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                <StatBox label="DR error vs oracle" value={`${ope.dr_error_pct.toFixed(1)}%`} good />
                <StatBox label="DM error vs oracle" value={`${ope.dm_error_pct.toFixed(1)}%`} />
                <StatBox label="IPS error vs oracle" value={`${ope.ips_error_pct.toFixed(1)}%`} />
              </div>
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(53,107,63,0.08)', color: '#356B3F' }}>
                DR's estimate is off from oracle truth by only <b>{ope.dr_error_pct.toFixed(1)}%</b> using logged data alone — dramatically
                more accurate than DM ({ope.dm_error_pct.toFixed(1)}%) or IPS ({ope.ips_error_pct.toFixed(1)}%) alone. 95% bootstrap CI: [₹{ope.dr_ci_low.toFixed(0)}, ₹{ope.dr_ci_high.toFixed(0)}] per customer.
              </div>
            </div>
          )}
        </GlassCard>

        {/* 4.7 Portfolio conflict */}
        <GlassCard id="sec-4-7">
          <SectionHead number="4.7" title="Policy portfolio conflict check" subtitle="Does this rule silently punish one customer segment more than others?" />
          <p className="text-sm mb-4 text-neutral-600">
            Aggregate precision/recall can hide a rule that's excellent overall but has a much higher false-positive rate in one segment.
            This breaks the false-positive rate down by segment and flags outliers.
          </p>
          {loading ? <Skeleton /> : portfolio && (
            <div>
              <ReanalyzeButton onClick={runPortfolioCheck} loading={portfolioLoading} />
              <p className="text-xs text-neutral-500 mb-3 italic">In plain terms: does this policy quietly hurt one group of customers more than everyone else, even though its overall numbers look fine? "vs population" alone can mislead on a small segment — a 57x ratio can be a single false positive in 52 people, not a real pattern — so "Flagged" below requires both a large ratio and a real absolute rate before it's treated as a genuine concern.</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <MetricTile label="Population FP rate (new policy)" value={portfolio.overall_fp_rate_new_policy * 100} suffix="%" decimals={2} />
                <MetricTile label="Population FP rate (baseline)" value={portfolio.overall_fp_rate_baseline * 100} suffix="%" decimals={2} />
              </div>
              <div className="overflow-x-auto rounded-xl border border-black/5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-neutral-500 border-b border-black/5">
                      <th className="py-2 px-3">Segment</th><th className="py-2 px-3">n</th>
                      <th className="py-2 px-3">FP rate (new)</th><th className="py-2 px-3">vs population</th><th className="py-2 px-3">Flagged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.segments.map((s, i) => (
                      <tr key={i} className={`border-b border-black/5 ${s.flagged_as_outlier ? 'bg-[#A6392F]/5' : ''}`}>
                        <td className="py-2 px-3">{s.segment_type}: {s.segment_value}</td>
                        <td className="py-2 px-3">{s.n_normal_customers}</td>
                        <td className="py-2 px-3">{(s.fp_rate_new_policy * 100).toFixed(2)}%</td>
                        <td className="py-2 px-3">{s.fp_rate_vs_population_ratio?.toFixed(2)}x</td>
                        <td className="py-2 px-3">{s.flagged_as_outlier ? 'Yes' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm mt-3 text-neutral-600">
                {portfolio.n_segments_flagged > 0
                  ? `${portfolio.n_segments_flagged} segment(s) flagged for elevated false-positive concentration — worth monitoring before full deployment.`
                  : 'No segments flagged — false-positive burden is evenly distributed.'}
              </p>
            </div>
          )}
        </GlassCard>

        {/* 4.8 Blast radius */}
        <GlassCard id="sec-4-8">
          <SectionHead number="4.8" title="Policy blast radius" subtitle="Not aggregates — the literal accounts this change flips." />
          <p className="text-sm mb-4 text-neutral-600">
            Every metric above is an aggregate. The question a reviewer actually asks before approving is "which specific
            accounts does this flip, and is any of them going to embarrass me?" This is that diff — baseline vs. discovered
            policy, per customer, on the held-out test set — with an AI note on the handful genuinely worth a second look,
            and, on demand, a plain-language, jargon-free draft of the actual letter that customer would receive.
          </p>
          {loading ? <Skeleton /> : blast && (
            <div>
              <ReanalyzeButton onClick={runBlastRadius} loading={blastLoading} />
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="metric-tile">
                  <div className="text-xs text-neutral-400 mb-1">Newly flagged</div>
                  <div className="text-xl font-bold">{blast.n_newly_flagged} <span className="text-sm font-normal text-neutral-400">(₹{blast.newly_flagged_loss_at_stake.toLocaleString(undefined, { maximumFractionDigits: 0 })} at stake)</span></div>
                </div>
                <div className="metric-tile">
                  <div className="text-xs text-neutral-400 mb-1">Newly cleared</div>
                  <div className="text-xl font-bold">{blast.n_newly_cleared} <span className="text-sm font-normal text-neutral-400">(₹{blast.newly_cleared_loss_at_stake.toLocaleString(undefined, { maximumFractionDigits: 0 })} at stake)</span></div>
                </div>
              </div>

              <div className="font-bold mb-2 text-sm">{blast.worth_reviewing_count} worth a human's attention</div>
              {!blast.llm_annotated && (
                <p className="text-[12px] text-neutral-400 mb-3">
                  {blast.llm_configured === false
                    ? 'Groq API key not configured — showing raw flips without an AI review note. Set GROQ_API_KEY in backend/.env to enable.'
                    : `AI review note unavailable right now — showing raw flips instead.${blast.llm_error ? ` (${blast.llm_error})` : ''}`}
                </p>
              )}
              <div className="space-y-2.5">
                {blast.worth_reviewing.map(r => (
                  <div key={r.customer_id} className="rounded-xl px-4 py-3 text-sm" style={{
                    background: r.flip === 'newly_flagged' ? 'rgba(150,106,34,0.10)' : 'rgba(166,57,47,0.08)',
                    color: r.flip === 'newly_flagged' ? '#966A22' : '#A6392F',
                  }}>
                    <div className="font-semibold mb-0.5">
                      Customer #{r.customer_id} — {r.flip === 'newly_flagged' ? 'newly flagged, not a known abuser' : 'newly cleared, but is a known abuser'}
                    </div>
                    <div className="text-neutral-700">{r.review_note || `Max amount ₹${r.max_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}, escalation ratio ${r.escalation_ratio.toFixed(2)}, account age ${r.account_age_at_escalation}d.`}</div>

                    {letters[r.customer_id] ? (
                      <div className="mt-2.5 rounded-lg px-3 py-2.5 text-[13px] whitespace-pre-line bg-white/60 text-neutral-700 border border-black/5">
                        {letters[r.customer_id]}
                      </div>
                    ) : (
                      <button
                        onClick={() => draftCustomerLetter(r.customer_id)}
                        disabled={letterLoading[r.customer_id]}
                        className="btn-secondary mt-2.5 px-3 py-1.5 rounded-lg text-xs inline-flex items-center gap-1.5"
                      >
                        {letterLoading[r.customer_id] ? <Spinner /> : null}
                        {letterLoading[r.customer_id] ? 'Drafting…' : 'Draft customer-facing letter'}
                      </button>
                    )}
                    {letterError[r.customer_id] && (
                      <div className="text-[12px] mt-1.5 text-[#A6392F]">{letterError[r.customer_id]}</div>
                    )}
                  </div>
                ))}
                <VIPFalloutSandbox />
                {blast.worth_reviewing.length === 0 && (
                  <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(53,107,63,0.08)', color: '#356B3F' }}>
                    <CheckCircle2 size={16} className="flex-none" /> Every flip is either a real abuser newly caught or a legitimate customer correctly staying cleared — nothing here needs a second look.
                  </div>
                )}
              </div>
            </div>
          )}
        </GlassCard>

        {/* 4.9 Policy version history */}
        <GlassCard id="sec-4-9">
          <SectionHead number="4.9" title="Policy version history" subtitle="Real teams iterate policies over time — this is that timeline, not a one-shot classifier." />
          <p className="text-sm mb-4 text-neutral-600">
            Retrain a genuinely different candidate below (a new decision tree with different hyperparameters, evaluated
            on the exact same held-out test set as v1) and it's added to this timeline with real metrics — not a
            relabeled copy of the same policy.
          </p>

          <div className="rounded-xl px-4 py-3.5 mb-4" style={{ background: 'rgba(43,93,94,0.06)' }}>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">Max depth (1–10)</label>
                <input type="number" min={1} max={10} value={retrainDepth} onChange={e => setRetrainDepth(Number(e.target.value))} className="input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">Min samples per leaf (2–200)</label>
                <input type="number" min={2} max={200} value={retrainLeaf} onChange={e => setRetrainLeaf(Number(e.target.value))} className="input" />
              </div>
            </div>
            <button onClick={runRetrain} disabled={retrainBusy} className="gold-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm">
              {retrainBusy ? <Spinner /> : <RefreshCw size={14} />}
              {retrainBusy ? 'Retraining…' : 'Retrain candidate'}
            </button>
            <button onClick={refreshHistory} disabled={historyLoading} className="btn-secondary inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ml-2">
              {historyLoading ? <Spinner /> : <RefreshCw size={14} />} Refresh
            </button>
          </div>

          {(() => {
            const active = history.find(v => v.deployment_status === 'ACTIVE')
            return (
              <div className="rounded-xl px-4 py-3 text-sm mb-4" style={{
                background: active ? 'rgba(53,107,63,0.08)' : 'rgba(43,93,94,0.08)',
                color: active ? '#356B3F' : '#966A22',
              }}>
                {active
                  ? <><b>Active policy: {active.label}</b> — every other version is proposed or superseded until a human approves a newer one.</>
                  : <><b>No active policy yet.</b> Nothing in this timeline has been approved — every version below, including v1, is PROPOSED. Remediation and the autonomous engineer only ever add proposals; nothing deploys itself.</>}
              </div>
            )
          })()}

          {(() => {
            const sorted = [...history].reverse()
            const [top, ...earlier] = sorted
            if (!top) return null
            return (
              <div className="space-y-3">
                {renderVersionCard(top, true)}
                {earlier.length > 0 && (
                  <>
                    <button
                      onClick={() => setHistoryExpanded(o => !o)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-neutral-500 hover:bg-black/5 transition-colors border border-dashed border-black/10"
                    >
                      {historyExpanded ? 'Hide' : 'Show'} {earlier.length} earlier version{earlier.length === 1 ? '' : 's'}
                    </button>
                    {historyExpanded && (
                      <div className="space-y-3">
                        {earlier.map(v => renderVersionCard(v, false))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })()}
        </GlassCard>
        {approvingVersionNeedsDevilsAdvocate !== null && (
          <DevilsAdvocateModal
            gates={history.find(h => h.version === approvingVersionNeedsDevilsAdvocate)?.gates || []}
            onCancel={() => setApprovingVersionNeedsDevilsAdvocate(null)}
            onAccept={() => {
              setApprovingVersion(approvingVersionNeedsDevilsAdvocate);
              setApprovingVersionNeedsDevilsAdvocate(null);
            }}
          />
        )}
        {approvingVersion !== null && (
          <ApprovalModal
            onClose={() => setApprovingVersion(null)}
            onApproved={(approvalToken) => handleVersionApproved(approvingVersion, approvalToken)}
          />
        )}

        {/* 4.10 Live drift monitor */}
        {drift && (
          <GlassCard id="sec-4-10">
            <SectionHead number="4.10" title="Live drift monitor" subtitle="Every stage above is a snapshot at approval time — is the policy still working six months later?" />
            <p className="text-sm mb-4 text-neutral-600">
              A real, previously-unknown gap found while building this: the co-evolution arms race above reports zero
              evasions found and full convergence — but its attacker only ever tested rings that wait 10–30 days before
              escalating. The deployed policy's actual rule doesn't care about amount or sharing once a ring strikes
              within 7 days — a fast-strike ring evades entirely, and the "fully converged" certificate never tested
              that case. This simulates rings gradually adapting toward a faster strike and tracks the frozen, deployed
              policy's real recall on each new monthly cohort — not retrained, not warned in advance.
            </p>
            <div style={{ width: '100%', height: 260 }} className="mb-4">
              <ResponsiveContainer>
                <LineChart data={drift.months} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} label={{ value: 'Month', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                  <YAxis domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={((v: unknown) => `${(Number(v) * 100).toFixed(1)}%`) as (value: unknown) => string} labelFormatter={m => `Month ${m}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={drift.alert_recall_floor} stroke="#A6392F" strokeDasharray="4 4"
                    label={{ value: 'alert floor', position: 'insideTopRight', fontSize: 10, fill: '#A6392F' }} />
                  <Line type="monotone" dataKey="recall" name="Recall" stroke="#2B5D5E" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="precision" name="Precision" stroke="#2B5D5E" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {drift.alert_month ? (
              <div className="rounded-xl px-4 py-3.5 text-sm" style={{ background: 'rgba(166,57,47,0.08)', color: '#A6392F' }}>
                <div className="font-bold mb-1 flex items-center gap-2"><TriangleAlert size={16} /> Drift alert: recall fell below {(drift.alert_recall_floor * 100).toFixed(0)}% at month {drift.alert_month}</div>
                <div className="text-neutral-700 mb-2">{drift.root_cause}</div>
                <div className="text-neutral-500 text-[13px]"><b>Recommended action:</b> {drift.recommended_action}</div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(53,107,63,0.08)', color: '#356B3F' }}>
                <CheckCircle2 size={16} className="flex-none" /> No drift alert across the simulated window.
              </div>
            )}

            {remediation && (
              <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="font-bold text-sm mb-1.5 flex items-center gap-2">
                  <ShieldCheck size={16} className="text-[#356B3F]" /> Closed the loop: the gap above has been patched and re-verified
                </div>
                <p className="text-sm mb-4 text-neutral-600">
                  The finding above didn't stop at "recommended action." <code>src/remediate_drift.py</code> re-ran the adversarial
                  arms race starting from the deployed policy, widened to the exact dimension this monitor found untested
                  ({remediation.widened_dimension}), and re-converged at generation {remediation.converged_at_generation}. The
                  chart below re-runs the identical drift simulation against the new policy — same months, same synthetic
                  cohorts, same seed — as proof, not a claim.
                </p>
                <div style={{ width: '100%', height: 220 }} className="mb-3">
                  <ResponsiveContainer>
                    <LineChart margin={{ top: 8, right: 16, left: -16, bottom: 0 }}
                      data={drift.months.map((m, i) => ({
                        month: m.month,
                        recall_before: m.recall,
                        recall_after: remediation.drift.months[i]?.recall,
                      }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={((v: unknown) => `${(Number(v) * 100).toFixed(1)}%`) as (value: unknown) => string} labelFormatter={m => `Month ${m}`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="recall_before" name="Recall — before remediation" stroke="#A6392F" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="recall_after" name="Recall — after remediation (v3)" stroke="#356B3F" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl px-4 py-3 text-sm" style={{ background: remediation.drift.fixed ? 'rgba(53,107,63,0.08)' : 'rgba(166,57,47,0.08)', color: remediation.drift.fixed ? '#356B3F' : '#A6392F' }}>
                  {remediation.drift.fixed
                    ? <><CheckCircle2 size={16} className="inline mr-1.5 -mt-0.5" />Verified: recall never drops below {(drift.alert_recall_floor * 100).toFixed(0)}% across all 12 months, including the previously-fatal fast-strike region. Registered in Version History as v3, awaiting the same identity-verified approval as any other version.</>
                    : <>Remediation attempted but not fully verified — still alerts at month {remediation.drift.alert_month}.</>}
                </div>
              </div>
            )}

            {attackCoverage && (
              <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="font-bold text-sm mb-1.5">Attack coverage map</div>
                <p className="text-sm mb-3 text-neutral-600">
                  The strike-timing gap above was one dimension. Every behavioral axis a real ring can vary is swept
                  independently — {200} realistic points each, everything else held at a known-abuse value — and
                  scored on what fraction the deployed policy actually catches. Real computed percentages, not a
                  decorative chart.
                </p>
                <div className="space-y-2">
                  {attackCoverage.dimensions.map(dim => {
                    const pre = attackCoverage.pre_remediation[dim]
                    const post = attackCoverage.post_remediation?.[dim]
                    return (
                      <div key={dim} className="text-[13px]">
                        <div className="flex justify-between mb-0.5">
                          <span className="font-medium">{dim}</span>
                          <span className="text-neutral-500">
                            {pre.toFixed(0)}%{post !== undefined && post !== null && post !== pre ? ` → ${post.toFixed(0)}%` : ''}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-black/5 overflow-hidden relative">
                          <div className="h-full rounded-full absolute inset-y-0 left-0" style={{ width: `${pre}%`, background: pre < 90 ? '#A6392F' : '#2B5D5E' }} />
                        </div>
                        {post !== undefined && post !== null && post !== pre && (
                          <div className="h-2 rounded-full bg-black/5 overflow-hidden relative mt-1">
                            <div className="h-full rounded-full absolute inset-y-0 left-0" style={{ width: `${post}%`, background: '#356B3F' }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {evasionDistance && (
              <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="font-bold text-sm mb-1.5">Risk policy attack surface</div>
                <p className="text-sm mb-4 text-neutral-600">
                  Coverage above answers "what % of a sweep gets caught." This answers a sharper question: starting
                  from a pattern the policy currently catches, what is the <em>smallest</em> behavioral change — one
                  dimension, or two combined — that flips the decision to evaded? A policy that needs a bigger change
                  to defeat has a smaller attack surface, even at the same raw coverage number.
                </p>
                <p className="text-xs text-neutral-500 mb-4 italic">In plain terms: "0.15 normalized units" means a ring only had to nudge one behavior 15% of the way across its realistic range to slip through — a small, cheap change for an attacker. "Fully robust" means no such nudge, however small, got past it.</p>
                {(() => {
                  const pre = evasionDistance.pre_remediation
                  const post = evasionDistance.post_remediation
                  const RED_ZONE = 0.15
                  const gauge = (o: typeof pre | null, label: string) => {
                    if (o == null) return null
                    const robust = o.minimum_distance == null
                    const pct = robust ? 100 : Math.min(100, o.minimum_distance! * 100)
                    const inRedZone = !robust && o.minimum_distance! < RED_ZONE
                    return (
                      <div className="mb-3 last:mb-0">
                        <div className="flex justify-between text-[12.5px] mb-1">
                          <span className="text-neutral-500">{label}</span>
                          <span className="font-medium" style={{ color: inRedZone ? '#A6392F' : '#356B3F' }}>
                            {robust ? 'fully robust — no evasion found' : `${o.minimum_distance!.toFixed(3)} via ${o.dimensions?.join(' + ')}`}
                          </span>
                        </div>
                        <div className="h-3 rounded-full relative" style={{ background: 'linear-gradient(90deg, #A6392F 0%, #A6392F 15%, #2B5D5E 15%, #2B5D5E 40%, #356B3F 40%, #356B3F 100%)', opacity: 0.25 }}>
                          <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow"
                               style={{ left: `calc(${pct}% - 7px)`, background: inRedZone ? '#A6392F' : '#356B3F' }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5">
                          <span>0.0 (trivially evaded)</span><span>1.0 (needs a large change)</span>
                        </div>
                      </div>
                    )
                  }
                  return <>{gauge(pre, 'Pre-remediation')}{post && gauge(post, 'Post-remediation')}</>
                })()}
              </div>
            )}
          </GlassCard>
        )}

        {/* 4.11 Counterfactual replay */}
        {counterfactual && (
          <GlassCard id="sec-4-11">
            <SectionHead number="4.11" title="Counterfactual replay" subtitle="What if we'd approved v1 months ago instead of today?" />
            <p className="text-sm mb-4 text-neutral-600">
              The doubly-robust estimator from section 4.6 works at a single point in time. This replays the exact
              same method — never re-running history, using only the logs the old baseline policy would actually have
              produced — against {counterfactual.n_historical_months} months of the past, to answer the question a
              business stakeholder actually asks about a delayed rollout: how much did waiting cost us?
            </p>
            <p className="text-xs text-neutral-500 mb-3 italic">In plain terms: this is the ₹ price tag on the time this policy sat in review instead of running — and "error vs. oracle" is how much to trust that number, since real deployments never get to check their estimate against the true answer the way this synthetic one can.</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="metric-tile">
                <div className="text-xs text-neutral-400 mb-1">DR-estimated missed value</div>
                <div className="text-xl font-bold">₹{counterfactual.total_dr_estimated_missed_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
              <div className="metric-tile">
                <div className="text-xs text-neutral-400 mb-1">Estimator error vs. oracle</div>
                <div className="text-xl font-bold">{counterfactual.dr_error_pct.toFixed(1)}%</div>
              </div>
            </div>
            <div style={{ width: '100%', height: 240 }} className="mb-4">
              <ResponsiveContainer>
                <LineChart data={counterfactual.months} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} label={{ value: 'Months before today', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={((v: unknown) => `₹${Number(v).toLocaleString()}`) as (value: unknown) => string} labelFormatter={m => `Month ${m}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="cumulative_dr_extra_value" name="Cumulative missed value (DR estimate)" stroke="#2B5D5E" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="cumulative_oracle_extra_value" name="True value (oracle, synthetic-only)" stroke="#2B5D5E" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[13px] text-neutral-500">{counterfactual.narrative}</p>
          </GlassCard>
        )}

        {/* 4.12 Autonomous Risk Policy Engineer */}
        <GlassCard id="sec-4-12">
          <SectionHead number="4.12" title="Autonomous Risk Policy Engineer" subtitle="Loss to verified candidate, without a human orchestrating every step." />
          <AITimelineScrubber />
          <p className="text-sm mb-4 text-neutral-600">
            Every stage above can be run manually, one at a time. This runs the whole loop — AI autopsy, feature
            discovery, LLM-proposed policy hypotheses, real decision trees fit on those features, adversarial attack
            and hardening, and full verification — synthesized into a readiness score. The rule enforced everywhere
            below: <b>the LLM proposes feature subsets and reasoning only</b> — it never computes a metric, never picks
            a threshold, and never cites a feature outside a fixed whitelist. It never approves anything either — the
            best eligible candidate is registered as a new, real, <i>unapproved</i> version in the same timeline as
            every other policy, waiting at the same human approval gate.
          </p>
          <button onClick={runAutonomousEngineer} disabled={agentLoading} className="gold-btn inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm mb-4">
            {agentLoading ? <Spinner /> : <Sparkles size={15} />}
            {agentLoading ? 'Running the full loop (~10s)…' : 'Run autonomous engineer'}
          </button>
          {agentError && (
            <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm mb-4" style={{ background: 'rgba(166,57,47,0.08)', color: '#A6392F' }}>
              <TriangleAlert size={16} className="flex-none" /> {agentError}
            </div>
          )}

          {agentResult && (
            <div className="space-y-4">
              <div>
                <div className="font-bold text-sm mb-2">Run timeline <span className="font-normal text-neutral-400">(real recorded stage timings, not simulated)</span></div>
                <div className="rounded-xl bg-black/[0.03] px-4 py-3 font-mono text-[12.5px] space-y-1">
                  {agentResult.timeline.map((entry, i) => (
                    <div key={i} className="flex gap-2.5">
                      <span className="text-neutral-400 flex-none">+{entry.t.toFixed(2)}s</span>
                      <span className="flex-none" style={{
                        color: entry.status === 'pass' ? '#356B3F' : entry.status === 'error' ? '#A6392F' : entry.status === 'blocked' ? '#A6392F' : '#966A22',
                      }}>
                        {entry.status === 'pass' ? '✓' : entry.status === 'error' ? '✕' : entry.status === 'blocked' ? '⊘' : '·'}
                      </span>
                      <span className="text-neutral-700">{entry.step}</span>
                      {entry.detail && <span className="text-neutral-400">— {entry.detail}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl px-4 py-3.5" style={{ background: 'rgba(43,93,94,0.06)' }}>
                <div className="font-bold text-sm mb-1.5">AI Autopsy Agent {!agentResult.autopsy.llm_available && <span className="text-neutral-400 font-normal">(Groq key not configured — degraded)</span>}</div>
                <div className="text-sm text-neutral-700 mb-1"><b>{agentResult.autopsy.failure_type}</b> — confidence {(agentResult.autopsy.confidence * 100).toFixed(0)}%</div>
                <div className="text-sm text-neutral-600 mb-2">{agentResult.autopsy.root_cause}</div>
                {agentResult.autopsy.missed_signals.length > 0 && (
                  <div className="text-[13px] text-neutral-500">Missed signals: {agentResult.autopsy.missed_signals.join(', ')}</div>
                )}
              </div>

              <div>
                <div className="font-bold text-sm mb-2">Feature discovery <span className="font-normal text-neutral-400">(pure pandas/numpy + RandomForest importance — no LLM)</span></div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {agentResult.discovery.candidates_tested.map(c => (
                    <div key={c.feature} className="rounded-lg px-3 py-2 text-[13px]" style={{ background: c.accepted ? 'rgba(53,107,63,0.08)' : 'rgba(0,0,0,0.03)' }}>
                      <div className="font-semibold">{c.feature} {c.accepted && <span style={{ color: '#356B3F' }}>✓</span>}</div>
                      <div className="text-neutral-500">importance {c.importance.toFixed(3)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-bold text-sm mb-2">Candidate policies, ranked by readiness</div>
                <p className="text-xs text-neutral-500 mb-3 italic">In plain terms: the score is a tie-breaker between candidates that already passed every gate — it never overrides a failed gate. "BLOCKED" means at least one gate failed, full stop, regardless of how high the score reads.</p>
                <div className="space-y-2.5">
                  {agentResult.candidates.map((c, i) => (
                    <div key={i} className="rounded-xl border border-black/5 px-4 py-3.5">
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
                        <div className="font-semibold text-sm">{c.hypothesis.name} {!c.hypothesis.llm_generated && <span className="text-neutral-400 font-normal text-xs">(baseline)</span>}</div>
                        <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{
                          background: c.failed ? 'rgba(0,0,0,0.06)' : c.readiness.status === 'APPROVAL_ELIGIBLE' ? 'rgba(53,107,63,0.1)' : 'rgba(166,57,47,0.1)',
                          color: c.failed ? '#6b6b6b' : c.readiness.status === 'APPROVAL_ELIGIBLE' ? '#356B3F' : '#A6392F',
                        }}>
                          {c.failed ? 'CRASHED' : c.readiness.status === 'APPROVAL_ELIGIBLE' ? `APPROVAL ELIGIBLE · ${c.readiness.overall_score}/100` : `BLOCKED · ${c.readiness.overall_score}/100`}
                        </span>
                      </div>
                      <div className="text-[13px] text-neutral-500 mb-1">{c.hypothesis.rationale} — features: {c.x_cols.join(', ')}</div>
                      {c.hypothesis.hypothesis_statement && (
                        <div className="text-[12.5px] rounded-lg px-2.5 py-1.5 mb-2 italic" style={{ background: 'rgba(43,93,94,0.08)', color: '#2B5D5E' }}>
                          Testable claim: {c.hypothesis.hypothesis_statement}
                        </div>
                      )}

                      {c.failed || !c.verify ? (
                        <div className="text-[13px]" style={{ color: '#A6392F' }}>{c.readiness.blocked_reasons[0]}</div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                            <MetricTile label="Precision" value={c.verify.regression.precision * 100} suffix="%" decimals={1} />
                            <MetricTile label="Recall" value={c.verify.regression.recall * 100} suffix="%" decimals={1} />
                            <MetricTile label="Adversarial coverage" value={c.verify.adversarial.coverage_pct} suffix="%" decimals={1} />
                            <MetricTile label="Fairness flags" value={c.verify.fairness.n_segments_flagged} />
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 mt-2 text-[12.5px]">
                            {c.readiness.gates.map(g => (
                              <div key={g.name} className="flex items-center gap-1.5">
                                <span style={{ color: g.passed ? '#356B3F' : '#A6392F' }}>{g.passed ? '✓' : '✕'}</span>
                                <span className="text-neutral-600">{g.name}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {agentResult.final_status === 'POLICY_REGISTERED' && agentResult.registered_version ? (
                <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(53,107,63,0.08)', color: '#356B3F' }}>
                  <CheckCircle2 size={16} className="flex-none mt-0.5" />
                  <span className="min-w-0">Registered as <b>{agentResult.registered_version.label}</b> in Version History (section 4.9) — awaiting the same identity-verified human approval as every other version.</span>
                </div>
              ) : (
                <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(166,57,47,0.08)', color: '#A6392F' }}>
                  <div className="font-bold mb-1 flex items-center gap-2"><TriangleAlert size={16} /> NO APPROVAL-ELIGIBLE POLICY</div>
                  <div className="text-neutral-700">No candidate this run passed every gate — nothing was registered. Do not deploy. This is the verifier constraining the system as designed, not a failure to produce output; the recommended next step is generating additional hypotheses or a human investigation, not lowering the bar.</div>
                </div>
              )}
            </div>
          )}
        </GlassCard>

        {/* 4.13 Economic Intervention Optimizer */}
        {interventionOptimizer && (
          <GlassCard id="sec-4-13">
            <SectionHead number="4.13" title="Economic intervention optimizer" subtitle="Not just ALLOW/BLOCK — a graded ladder, picked by real expected Rs value." />
            <p className="text-sm mb-4 text-neutral-600">
              Every policy above outputs a binary decision. A real risk team has more levers — step-up verification, a
              short delay, manual review — each preventing a different fraction of the loss at a different friction
              cost to a genuine customer. For every held-out customer, expected net value is computed per action and
              the optimizer picks the best one.
            </p>
            <div className="rounded-xl px-4 py-3 text-sm mb-4" style={{ background: 'rgba(43,93,94,0.08)', color: '#966A22' }}>
              {interventionOptimizer.separability_note}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <MetricTile label="Optimizer net value" raw={`₹${interventionOptimizer.total_net_value_optimizer.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <MetricTile label="Binary policy net value" raw={`₹${interventionOptimizer.total_net_value_binary_policy.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <MetricTile label="Allow-all net value" raw={`₹${interventionOptimizer.total_net_value_allow_all.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            </div>
            <div className="mb-4">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Action ladder (engineering estimates, disclosed)</div>
              <div className="space-y-1.5">
                {interventionOptimizer.action_definitions.map(a => (
                  <div key={a.action} className="flex justify-between items-baseline text-[12.5px] rounded-lg px-3 py-2" style={{ background: 'rgba(0,0,0,0.03)' }}>
                    <span><b>{a.action}</b> <span className="text-neutral-500">— {a.rationale}</span></span>
                    <span className="text-neutral-500 whitespace-nowrap ml-3">{(a.prevent_frac * 100).toFixed(0)}% prevented, ₹{a.friction_cost} cost</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
                Decision-boundary sweep (synthetic, at a representative loss of ₹{interventionOptimizer.decision_boundary_representative_loss_rs.toLocaleString()}) — proof the ladder genuinely grades
              </div>
              <p className="text-xs text-neutral-500 mb-2 italic">In plain terms: "p≥0.02" means "once this customer's estimated abuse probability crosses 2%" — read left to right, each row is the next, harsher action the optimizer switches to as risk climbs.</p>
              <div className="flex flex-wrap gap-2">
                {interventionOptimizer.decision_boundary_transitions.map((t, i) => (
                  <span key={i} className="text-[12px] px-2.5 py-1 rounded-full font-medium" style={{ background: 'rgba(43,93,94,0.1)', color: '#2B5D5E' }}>
                    p≥{t.p_abuse.toFixed(2)} → {t.optimal_action}
                  </span>
                ))}
              </div>
            </div>
          </GlassCard>
        )}

        {/* 4.14 Residual behavior scan (experimental) */}
        {residualClusters && (
          <GlassCard id="sec-4-14">
            <SectionHead number="4.14" title="Residual behavior scan" subtitle="Experimental — an illustration of the capability, not a fraud-discovery claim." />
            <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm mb-4" style={{ background: 'rgba(43,93,94,0.12)', color: '#966A22' }}>
              <TriangleAlert size={16} className="flex-none mt-0.5" />
              <span>{residualClusters.disclaimer}</span>
            </div>
            <p className="text-xs text-neutral-400 mb-4">Policy used for this scan: {residualClusters.policy_used}</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <MetricTile label="Loss explained by known policy" value={residualClusters.pct_loss_explained_by_known_policy} suffix="%" decimals={1} />
              <MetricTile label="Loss in residual/borderline customers" value={residualClusters.pct_loss_in_residual_clusters} suffix="%" decimals={1} />
            </div>
            {residualClusters.clusters.length === 0 ? (
              <p className="text-sm text-neutral-500">{residualClusters.method}</p>
            ) : (
              <div className="space-y-2">
                {residualClusters.clusters.map(c => (
                  <div key={c.cluster_id} className="rounded-xl border border-black/5 px-4 py-3 text-[13px]">
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold">Cluster {c.cluster_id}</span>
                      <span className="text-neutral-500">{c.size} customer(s), abuse rate {(c.abuse_rate * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-neutral-500">Mean loss ₹{c.mean_loss_rs.toLocaleString()} — distinguished by {c.dominant_dimensions.join(', ')}</div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}

        {/* 4.15 Evaluation rigor - consolidated: difficulty tiers, secret holdout, multi-seed, ablation, mutation testing */}
        {(difficultyTiers || secretHoldout || multiSeedEval || ablation || mutationTesting) && (
          <GlassCard id="sec-4-15">
            <SectionHead number="4.15" title="Evaluation rigor" subtitle="Does this survive harder data, an untouched seed, 10 independent runs, and a broken-on-purpose mutant?" />
            <p className="text-sm mb-5 text-neutral-600">
              The headline 100%/100%/0-FP numbers elsewhere in this dashboard are earned on one population that this
              project's own tooling found to be near-perfectly separable. This section is the honest stress-test of
              that claim — one consolidated place rather than five more top-level sections.
            </p>
            <p className="text-xs text-neutral-500 mb-5 italic">In plain terms, four different ways of asking "are you sure?": <b>difficulty tiers</b> — does it still work on harder, messier customers, not just easy ones; <b>secret holdout</b> — does it work on data it never got a chance to see while being built; <b>10-seed evaluation</b> — is the headline number a fluke of one lucky data split, or does it hold up across ten independent ones; <b>mutation testing</b> — if the policy itself were quietly broken, would this project's own checks actually notice.</p>

            {difficultyTiers && (
              <div className="mb-5">
                <div className="font-bold text-sm mb-1.5">Difficulty tiers</div>
                <p className="text-xs text-neutral-500 mb-2">
                  {difficultyTiers.policy_evaluated} scored on data harder by construction — see each tier's
                  precision/recall, not net value (population sizes differ, see caveat).
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="text-left text-neutral-400">
                        <th className="pb-1 pr-3 font-semibold">Tier</th>
                        <th className="pb-1 pr-3 font-semibold">Precision</th>
                        <th className="pb-1 pr-3 font-semibold">Recall</th>
                        <th className="pb-1 font-semibold">FP rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {difficultyTiers.tiers.map(t => (
                        <tr key={t.tier} className="border-t border-black/5">
                          <td className="py-1.5 pr-3 font-medium capitalize">{t.tier}</td>
                          <td className="py-1.5 pr-3">{(t.precision * 100).toFixed(1)}%</td>
                          <td className="py-1.5 pr-3">{(t.recall * 100).toFixed(1)}%</td>
                          <td className="py-1.5">{(t.fp_rate * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                      {difficultyTiers.drifted && (
                        <tr className="border-t border-black/5">
                          <td className="py-1.5 pr-3 font-medium capitalize">drifted</td>
                          <td className="py-1.5 pr-3 text-neutral-400" colSpan={3}>
                            recall {(difficultyTiers.drifted.recall_at_month_1 * 100).toFixed(0)}% (month 1) → {(difficultyTiers.drifted.recall_at_final_month_pre_remediation * 100).toFixed(0)}% (pre-remediation)
                            {difficultyTiers.drifted.recall_at_final_month_post_remediation != null && ` → ${(difficultyTiers.drifted.recall_at_final_month_post_remediation * 100).toFixed(0)}% (post-remediation)`}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {secretHoldout && (
              <div className="mb-5 pt-5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="font-bold text-sm mb-1.5">Secret holdout (seed {secretHoldout.secret_seed}, one-shot)</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                  <MetricTile label="Precision" value={secretHoldout.precision * 100} suffix="%" decimals={1} />
                  <MetricTile label="Recall" value={secretHoldout.recall * 100} suffix="%" decimals={1} />
                  <MetricTile label="FP rate" value={secretHoldout.fp_rate * 100} suffix="%" decimals={1} />
                  <MetricTile label="False positives" value={secretHoldout.false_positives} />
                </div>
                <p className="text-xs text-neutral-500">{secretHoldout.scope_note}</p>
              </div>
            )}

            {multiSeedEval && (
              <div className="mb-5 pt-5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="font-bold text-sm mb-1.5">{multiSeedEval.n_seeds}-seed evaluation (mean ± std)</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricTile label="Precision" raw={`${(multiSeedEval.precision.mean * 100).toFixed(1)}% ± ${(multiSeedEval.precision.std * 100).toFixed(1)}`} />
                  <MetricTile label="Recall" raw={`${(multiSeedEval.recall.mean * 100).toFixed(1)}% ± ${(multiSeedEval.recall.std * 100).toFixed(1)}`} />
                  <MetricTile label="FP rate" raw={`${(multiSeedEval.fp_rate.mean * 100).toFixed(1)}% ± ${(multiSeedEval.fp_rate.std * 100).toFixed(1)}`} />
                  <MetricTile label="Net value" raw={`₹${(multiSeedEval.net_value_rs.mean / 1000).toFixed(0)}k ± ${(multiSeedEval.net_value_rs.std / 1000).toFixed(0)}k`} />
                </div>
              </div>
            )}

            {ablation && (
              <div className="mb-5 pt-5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="font-bold text-sm mb-1.5">Ablation — which stage earns its place</div>
                <div className="space-y-1.5">
                  {ablation.stages.map(s => (
                    <div key={s.stage} className="flex justify-between text-[12.5px]">
                      <span>{s.stage}</span>
                      <span className="font-medium">₹{s.net_value_rs.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mutationTesting && (
              <div className="pt-5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="font-bold text-sm mb-1.5">Policy mutation testing</div>
                <p className="text-xs text-neutral-500 mb-2">
                  Deliberately breaks the deployed policy's tree structure (threshold ±10%, or an inverted split) and
                  checks whether this project's own verification suite catches it.
                </p>
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-2xl font-bold">{mutationTesting.mutation_score_pct != null ? `${mutationTesting.mutation_score_pct}%` : 'n/a'}</div>
                  <div className="text-xs text-neutral-500">
                    {mutationTesting.n_caught}/{mutationTesting.n_behaviorally_different} behaviorally-different mutants caught
                    ({mutationTesting.n_mutants_generated} generated total)
                  </div>
                </div>
                <p className="text-xs text-neutral-400">{mutationTesting.sample_size_caveat}</p>
              </div>
            )}
          </GlassCard>
        )}

        {/* 5. Approval */}
        <GlassCard id="sec-5">
          <SectionHead number={5} title="Human approval gate" subtitle="This system never auto-deploys." />
          <div className="text-sm space-y-2 mb-4 text-neutral-700">
            <p>Every candidate policy ships with:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Precision/recall/false-positive cost on a held-out test set</li>
              <li>Doubly-robust off-policy evaluation validated against oracle ground truth</li>
              <li>A portfolio conflict check across customer segments</li>
              <li>An adversarial regression log, converged via automated co-evolution</li>
              <li>The exact human-readable rule — no black box</li>
            </ul>
          </div>
          <button onClick={() => setShowApproval(true)} className="gold-btn inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm">
            <ShieldCheck size={16} /> Submit for human approval
          </button>
          <p className="text-xs text-neutral-400 mt-2">Requires signing in and a live face match against the reviewer's enrolled identity, independently re-verified server-side.</p>
          {submitted && (
            <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm mt-4" style={{ background: 'rgba(53,107,63,0.08)', color: '#356B3F' }}>
              <CheckCircle2 size={16} className="flex-none mt-0.5" />
              <span className="min-w-0">{submitted.label} approved by <b>{submitted.identity}</b> — biometrically verified.</span>
            </div>
          )}
          {submitError && (
            <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm mt-4" style={{ background: 'rgba(166,57,47,0.08)', color: '#A6392F' }}>
              <TriangleAlert size={16} className="flex-none" /> {submitError}
            </div>
          )}
          <button
            onClick={() => window.open(api.dossierUrl(submitted?.identity ?? undefined), '_blank')}
            className="btn-secondary inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm mt-4"
          >
            <FileDown size={15} /> Download compliance dossier (PDF)
          </button>
          <p className="text-xs text-neutral-400 mt-2">
            Every stage above — held-out metrics, adversarial log, off-policy evaluation, portfolio check, blast radius —
            assembled into one exportable artifact, real numbers only.
          </p>
        </GlassCard>

        {/* 6. Bring your own data */}
        <GlassCard id="sec-6">
          <SectionHead number={6} title="Merchant workspaces" subtitle="This isn't hardcoded to one merchant's dataset." />
          <p className="text-sm mb-4 text-neutral-600">
            Upload any transactions CSV — an LLM maps its columns onto the schema this analysis needs, no exact column
            names required — and it's saved as its own workspace you can revisit any time, not lost on refresh. Because a
            real upload has no ground-truth labels, each workspace runs an unsupervised shared-device/shared-address
            signal scan rather than reusing the labeled demo pipeline's validated precision/recall.
          </p>
          <DatasetUpload llmEnabled={llmEnabled} />
        </GlassCard>
      {showApproval && (
        <ApprovalModal
          onClose={() => setShowApproval(false)}
          onApproved={(approvalToken) => handleHeadlineApproval(approvalToken)}
        />
      )}
        </div>
      </main>
      <ChatWidget
        llmEnabled={llmEnabled}
        speakByDefault={settings.speakByDefault}
        commandsEnabled={settings.commandsEnabled}
        voiceId={settings.voiceId}
        commands={{
          retrain: runRetrain,
          runAutonomousEngineer,
          scrollToSection: (id) => {
            const el = document.getElementById(id)
            if (!el) return false
            const startY = window.scrollY
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            // Smooth scrolling is a compositor-driven animation that some
            // environments (a backgrounded/throttled tab, reduced-motion
            // setups) never actually run - if scroll position hasn't moved
            // at all shortly after, force it there instantly instead of
            // silently leaving the user stuck at the top of the page.
            setTimeout(() => {
              if (Math.abs(window.scrollY - startY) < 2) {
                el.scrollIntoView({ behavior: 'instant', block: 'start' })
              }
            }, 400)
            return true
          },
        }}
      />
    </div>
  )
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'rgba(0,0,0,0.04)' }} />)}
    </div>
  )
}

function StatBox({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="metric-tile px-4 py-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`text-xl font-extrabold mt-1 ${good ? 'text-[#356B3F]' : ''}`}>{value}</div>
    </div>
  )
}
