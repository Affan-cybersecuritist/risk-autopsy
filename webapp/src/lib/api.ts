// In production this frontend is served BY the FastAPI backend itself
// (backend/main.py mounts webapp/dist as static files), so API calls are
// same-origin - no base URL needed, and no CORS involved at all. In dev,
// vite serves the frontend on :5173 while uvicorn serves the API on
// :8011, so an explicit base URL is required.
//
// TEMPORARY: was :8010. A stuck/unkillable stale backend process was still
// holding :8010 with pre-fix code, so the dev API was moved to :8011 to
// guarantee this points at the current code. Once you've fully stopped
// whatever's on :8010 (restart your machine if needed) you can move this
// back to :8010 and run uvicorn on the normal port again.
import { supabase } from './supabase'

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:8011'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${path} failed: ${res.status} ${body}`)
  }
  return res.json()
}

export interface Overview {
  total_chargeback_loss: number
  customers_involved: number
  abuse_rings_detected: number
  total_customers: number
}

export interface TimelineEvent {
  day: number
  amount: number
  txn_type: 'purchase' | 'return' | 'chargeback'
}

export interface AutopsyResult {
  customer_id: number
  is_abuse_ring: boolean
  shared_address_members: number
  timeline: TimelineEvent[]
}

export interface PolicyMetrics {
  precision: number
  recall: number
  loss_prevented: number
  fp: number
  fp_cost: number
}

export interface PolicyComparison {
  baseline: PolicyMetrics
  discovered: PolicyMetrics
  total_test_loss: number
  rule_text: string
  n_train: number
  n_test: number
}

export interface AdversarialResults {
  n_evaders: number
  top_feature: string
  top_feature_importance: number
  v1_caught: number
  v1_missed: number
  v2_caught: number
  v2_missed: number
  v2_test_precision: number
  v2_test_recall: number
  v2_test_fp: number
  v2_loss_prevented: number
  total_test_loss: number
  v2_rule_text: string
}

export interface CoevolutionGeneration {
  generation: number
  evasions_found: number
  search_budget: number
  test_precision: number
  test_recall: number
  test_fp: number
}

export interface CoevolutionResults {
  generation_log: CoevolutionGeneration[]
  converged: boolean
  converged_at_generation: number | null
  final_precision: number
  final_recall: number
  final_fp: number
  final_rule_text: string
  search_budget_per_generation: number
}

export interface OffPolicyEvalResults {
  n_customers: number
  logged_flag_rate: number
  target_flag_rate: number
  V_dm: number
  V_ips: number
  V_dr: number
  V_true_oracle_target: number
  V_true_oracle_baseline: number
  dr_error_vs_oracle: number
  dm_error_vs_oracle: number
  ips_error_vs_oracle: number
  dr_error_pct: number
  dm_error_pct: number
  ips_error_pct: number
  dr_ci_low: number
  dr_ci_high: number
}

export interface PortfolioSegment {
  segment_type: string
  segment_value: string
  n_normal_customers: number
  fp_rate_new_policy: number
  fp_rate_baseline: number
  fp_rate_vs_population_ratio: number | null
  flagged_as_outlier: boolean
}

export interface PortfolioConflictResults {
  overall_fp_rate_new_policy: number
  overall_fp_rate_baseline: number
  flag_multiplier: number
  min_segment_size: number
  n_segments_flagged: number
  segments: PortfolioSegment[]
}

export interface BlastRadiusRow {
  customer_id: number
  flip: 'newly_flagged' | 'newly_cleared'
  is_abuse_ring: boolean
  max_amount: number
  loss_rs: number
  account_age_at_escalation: number
  device_sharing: number
  address_sharing: number
  escalation_ratio: number
  review_note?: string
}

export interface BlastRadiusResults {
  n_test_customers: number
  n_newly_flagged: number
  n_newly_cleared: number
  newly_flagged_loss_at_stake: number
  newly_cleared_loss_at_stake: number
  newly_flagged: BlastRadiusRow[]
  newly_cleared: BlastRadiusRow[]
  worth_reviewing_count: number
  worth_reviewing: BlastRadiusRow[]
  llm_annotated: boolean
  llm_configured?: boolean
  llm_error?: string
}

export interface DriftMonthEntry {
  month: number
  precision: number
  recall: number
  fp: number
  loss_total: number
  loss_missed: number
  typical_strike_wait_days: [number, number]
}

export interface DriftMonitorResults {
  months: DriftMonthEntry[]
  alert_recall_floor: number
  alert_month: number | null
  root_cause?: string
  recommended_action?: string
  compared_against?: string
  fixed?: boolean
}

export interface CounterfactualMonthEntry {
  month: number
  n_customers: number
  logged_flag_rate: number
  target_flag_rate: number
  dr_extra_value_this_month: number
  oracle_extra_value_this_month: number
  cumulative_dr_extra_value: number
  cumulative_oracle_extra_value: number
}

export interface CounterfactualReplayResults {
  n_historical_months: number
  months: CounterfactualMonthEntry[]
  total_dr_estimated_missed_value: number
  total_oracle_missed_value: number
  dr_error_pct: number
  narrative: string
}

export interface DriftRemediationResult {
  drift: DriftMonitorResults
  converged_at_generation: number | null
  widened_dimension: string
  final_rule_text: string
}

export interface AgentDiscoveredFeature {
  feature: string
  description: string
  importance: number
  accepted: boolean
}

export interface AgentDiscovery {
  candidates_tested: AgentDiscoveredFeature[]
  base_feature_importances: Record<string, number>
  accepted_features: string[]
  method: string
}

export interface AgentAutopsy {
  failure_type: string
  root_cause: string
  missed_signals: string[]
  existing_control_failure: string
  candidate_features: string[]
  confidence: number
  llm_available: boolean
}

export interface AgentHypothesis {
  name: string
  features: string[]
  rationale: string
  hypothesis_statement?: string
  llm_generated: boolean
}

export interface AgentGate {
  name: string
  detail: string
  passed: boolean
  threshold: string
}

export interface AgentReadiness {
  gates: AgentGate[]
  breakdown: Record<string, number>
  weights: Record<string, number>
  overall_score: number
  status: 'APPROVAL_ELIGIBLE' | 'BLOCKED'
  blocked_reasons: string[]
}

export interface AgentTimelineEntry {
  t: number
  step: string
  detail: string
  status: 'ok' | 'pass' | 'blocked' | 'error'
}

export interface AgentCandidate {
  hypothesis: AgentHypothesis
  x_cols: string[]
  failed?: boolean
  harden_generations: number
  harden_converged: boolean
  verify: {
    regression: { precision: number; recall: number; fp: number; loss_prevented: number; total_test_loss: number }
    adversarial: { evasions_found: number; search_size: number; coverage_pct: number }
    fairness: { overall_fp_rate: number; n_segments_flagged: number; has_severe_flag: boolean }
    blast_radius: { n_newly_flagged: number; n_newly_cleared: number; newly_flagged_loss_at_stake: number; worth_reviewing_count: number }
    off_policy: { dr_value_per_customer: number; dm_value_per_customer: number; dr_dm_agreement_pct: number }
    complexity: { depth: number; n_nodes: number; n_features: number }
  } | null
  readiness: AgentReadiness
  rule_text: string
}

export interface AgentRunResult {
  generated_at: number
  duration_seconds: number
  discovery: AgentDiscovery
  autopsy: AgentAutopsy
  candidates: AgentCandidate[]
  recommended_index: number
  registered_version: PolicyHistoryEntry | null
  final_status: 'POLICY_REGISTERED' | 'NO_APPROVAL_ELIGIBLE_POLICY'
  timeline: AgentTimelineEntry[]
}

export interface AttackCoverageResult {
  dimensions: string[]
  pre_remediation: Record<string, number>
  post_remediation: Record<string, number> | null
  method: string
}

export interface PolicyHistoryEntry {
  version: number
  label: string
  created_at: string | null
  hyperparams: { max_depth: number; min_samples_leaf: number }
  precision: number
  recall: number
  fp: number
  fp_cost: number
  loss_prevented: number
  total_test_loss: number
  rule_text: string
  approved_by: string | null
  approved_at: string | null
  deployment_status?: 'ACTIVE' | 'PROPOSED' | 'SUPERSEDED'
  note?: string
  gates?: AgentGate[]
  gates_note?: string
}

export interface InterventionActionDefinition {
  action: string
  prevent_frac: number
  friction_cost: number
  rationale: string
}

export interface InterventionCustomerAction {
  customer_id: number
  action: string
  expected_net_value: number
  p_abuse: number
}

export interface InterventionOptimizerResult {
  action_definitions: InterventionActionDefinition[]
  per_customer_actions: InterventionCustomerAction[]
  action_counts: Record<string, number>
  total_net_value_optimizer: number
  total_net_value_binary_policy: number
  total_net_value_allow_all: number
  improvement_vs_binary: number
  improvement_vs_allow_all: number
  n_test_customers: number
  n_ambiguous_customers: number
  separability_note: string
  decision_boundary_curve: { p_abuse: number; optimal_action: string }[]
  decision_boundary_transitions: { p_abuse: number; optimal_action: string }[]
  decision_boundary_representative_loss_rs: number
  method: string
}

export interface EvasionDistanceOutcome {
  minimum_distance: number | null
  dimensions: string[] | null
  perturbed_point: Record<string, number> | null
  original_point: Record<string, number>
  per_dimension_single_axis_distance: Record<string, number | null>
  note?: string
}

export interface EvasionDistanceResult {
  pre_remediation: EvasionDistanceOutcome
  post_remediation: EvasionDistanceOutcome | null
  method: string
}

export interface ResidualCluster {
  cluster_id: number
  size: number
  mean_loss_rs: number
  abuse_rate: number
  centroid: Record<string, number>
  dominant_dimensions: string[]
}

export interface ResidualClusterResult {
  disclaimer: string
  policy_used: string
  k_chosen: number | null
  silhouette_score: number | null
  pct_loss_explained_by_known_policy: number
  pct_loss_in_residual_clusters: number
  n_residual_customers: number
  clusters: ResidualCluster[]
  method: string
}

export interface CausalDecisionNode {
  node_id: number
  feature: string
  threshold: number
  customer_value: number
  direction: '<=' | '>'
}

export interface CausalGraphResult {
  customer_id: number
  is_abuse_ring: boolean
  loss_rs: number
  outcome: 'caught' | 'missed_loss' | 'false_positive' | 'correctly_allowed'
  decision_chain: {
    path: CausalDecisionNode[]
    leaf_node_id: number
    predicted_class: 'abuse' | 'genuine'
    leaf_class_distribution: Record<string, number>
    closest_call: { node_id: number; feature: string; gap_normalized: number } | null
  }
  scope_note: string
}

export interface HealthResult {
  status: string
  llm_enabled: boolean
}

export interface DifficultyTierRow {
  tier: string
  n_customers: number
  n_abuse: number
  precision: number
  recall: number
  false_positives: number
  fp_rate: number
  net_value_rs: number
}

export interface DifficultyDriftedRow {
  tier: 'drifted'
  note: string
  recall_at_month_1: number
  recall_at_final_month_pre_remediation: number
  alert_month: number | null
  recall_at_final_month_post_remediation?: number
}

export interface DifficultyTiersResult {
  tiers: DifficultyTierRow[]
  drifted: DifficultyDriftedRow | null
  policy_evaluated: string
  method: string
  net_value_caveat: string
}

export interface SecretHoldoutResult {
  secret_seed: number
  n_customers: number
  n_abuse: number
  precision: number
  recall: number
  false_positives: number
  fp_rate: number
  net_value_rs: number
  policy_evaluated: string
  scope_note: string
}

export interface MultiSeedStat { mean: number; std: number }

export interface MultiSeedEvalResult {
  n_seeds: number
  seeds: number[]
  per_seed: { seed: number; precision: number; recall: number; fp_rate: number; net_value_rs: number }[]
  precision: MultiSeedStat
  recall: MultiSeedStat
  fp_rate: MultiSeedStat
  net_value_rs: MultiSeedStat
  method: string
}

export interface AblationStage {
  stage: string
  loss_prevented_rs: number | null
  false_positives: number | null
  false_positive_cost_rs: number | null
  net_value_rs: number
  note?: string
}

export interface AblationResult {
  stages: AblationStage[]
  method: string
}

export interface MutationTestingResult {
  original_precision: number
  original_recall: number
  original_net_value_rs: number
  n_mutants_generated: number
  n_behaviorally_different: number
  n_caught: number
  mutation_score_pct: number | null
  per_mutation_type: Record<string, { total_behaviorally_different: number; caught: number }>
  gate_thresholds: { precision_floor: number; recall_floor: number }
  sample_size_caveat: string
  method: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface DatasetUploadResult {
  total_customers: number
  total_transactions: number
  total_chargeback_loss: number
  shared_device_clusters: number
  shared_address_clusters: number
  flagged_customer_count: number
  flagged_customer_ids: number[]
  top_customers_by_amount: { customer_id: number; n_txns: number; total_amount: number; max_amount: number }[]
  column_mapping: Record<string, string | null>
  tenant_id: string
}

export interface TenantSummary {
  id: string
  name: string
  uploaded_at: string
  total_customers: number
  total_chargeback_loss: number
  flagged_customer_count: number
}

export interface TenantRecord {
  id: string
  name: string
  uploaded_at: string
  column_mapping: Record<string, string | null>
  analysis: DatasetUploadResult
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`API ${path} failed: ${res.status} ${errBody}`)
  }
  return res.json()
}

export const api = {
  overview: () => get<Overview>('/api/overview'),
  abuseRingCustomers: () => get<{ customer_ids: number[] }>('/api/customers/abuse-ring'),
  autopsy: (customerId: number) => get<AutopsyResult>(`/api/autopsy/${customerId}`),
  policyComparison: () => get<PolicyComparison>('/api/policy/comparison'),
  adversarial: () => get<AdversarialResults>('/api/policy/adversarial'),
  coevolution: () => get<CoevolutionResults>('/api/policy/coevolution'),
  offPolicyEval: () => get<OffPolicyEvalResults>('/api/policy/off-policy-eval'),
  portfolioConflict: () => get<PortfolioConflictResults>('/api/policy/portfolio-conflict'),
  blastRadius: () => get<BlastRadiusResults>('/api/policy/blast-radius'),
  driftMonitor: () => get<DriftMonitorResults>('/api/policy/drift'),
  driftRemediation: () => get<DriftRemediationResult>('/api/policy/drift-remediation'),
  attackCoverage: () => get<AttackCoverageResult>('/api/policy/attack-coverage'),
  interventionOptimizer: () => get<InterventionOptimizerResult>('/api/policy/intervention-optimizer'),
  evasionDistance: () => get<EvasionDistanceResult>('/api/policy/evasion-distance'),
  residualClusters: () => get<ResidualClusterResult>('/api/policy/residual-clusters'),
  causalGraph: (customerId: number) => get<CausalGraphResult>(`/api/autopsy/${customerId}/causal-graph`),
  difficultyTiers: () => get<DifficultyTiersResult>('/api/policy/difficulty-tiers'),
  secretHoldout: () => get<SecretHoldoutResult>('/api/policy/secret-holdout'),
  multiSeedEval: () => get<MultiSeedEvalResult>('/api/policy/multi-seed-eval'),
  ablation: () => get<AblationResult>('/api/policy/ablation'),
  mutationTesting: () => get<MutationTestingResult>('/api/policy/mutation-testing'),
  counterfactualReplay: () => get<CounterfactualReplayResults>('/api/policy/counterfactual'),
  runAgent: () => post<AgentRunResult>('/api/agent/run', {}),
  lastAgentRun: () => get<AgentRunResult>('/api/agent/last'),
  customerLetter: (customerId: number) =>
    get<{ customer_id: number; flip: string; letter: string }>(`/api/policy/blast-radius/${customerId}/letter`),
  health: () => get<HealthResult>('/api/health'),
  narrative: (customerId: number) => get<{ customer_id: number; narrative: string }>(`/api/autopsy/${customerId}/narrative`),
  chat: (question: string, history: ChatMessage[]) => post<{ answer: string }>('/api/chat', { question, history }),
  commandIntent: (text: string) => post<{ intent: 'navigate' | 'retrain' | 'run_agent' | 'chat'; section_id: string | null }>('/api/command-intent', { text }),
  ttsUrl: () => `${API_BASE}/api/tts`,
  dossierUrl: (approvedBy?: string) => `${API_BASE}/api/dossier${approvedBy ? `?approved_by=${encodeURIComponent(approvedBy)}` : ''}`,
  policyHistory: () => get<{ history: PolicyHistoryEntry[] }>('/api/policy/history'),
  retrainPolicy: (maxDepth: number, minSamplesLeaf: number) =>
    post<PolicyHistoryEntry>('/api/policy/retrain', { max_depth: maxDepth, min_samples_leaf: minSamplesLeaf }),
  // Server-side identity + face-match verification (backend/auth.py) - the
  // browser's own face-api.js comparison is UX feedback only; this call is
  // what actually mints the short-lived token /api/policy/approve requires.
  getApprovalToken: (accessToken: string) =>
    post<{ token: string; email: string }>('/api/policy/approval-token', {
      access_token: accessToken,
    }),
  approvePolicyVersion: (version: number, approvalToken: string) =>
    post<PolicyHistoryEntry>('/api/policy/approve', { version, approval_token: approvalToken }),
  tenants: () => get<{ tenants: TenantSummary[] }>('/api/tenants'),
  tenant: (id: string) => get<TenantRecord>(`/api/tenants/${id}`),
  deleteTenant: async (id: string): Promise<void> => {
    // Backend now requires a real logged-in session (security audit fix -
    // this endpoint had no auth at all before).
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('sign in required to delete a workspace')
    const res = await fetch(`${API_BASE}/api/tenants/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`delete failed: ${res.status}`)
  },
  uploadDataset: async (file: File): Promise<DatasetUploadResult> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${API_BASE}/api/dataset/upload`, { method: 'POST', body: form })
    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`upload failed: ${res.status} ${errBody}`)
    }
    return res.json()
  },
}
