"""
Risk Autopsy - demo app.
Run with: streamlit run app/app.py
"""
import streamlit as st
import pandas as pd
import json
import plotly.graph_objects as go
import plotly.io as pio
import os
import streamlit.components.v1 as components

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")

st.set_page_config(page_title="Risk Autopsy", layout="wide")

# =====================================================================
# PREMIUM THEME: CSS + scroll-reveal JS
# =====================================================================
st.markdown("""
<style>
:root{
  --gold:#B8860B; --gold-light:#D4AF37; --ink:#1A1A1A;
  --paper:#FFFFFF; --paper-soft:#F7F5F0; --line:rgba(0,0,0,0.07);
}
html{ scroll-behavior:smooth; }

/* the app view itself goes transparent - the real 3D canvas (injected below,
   same Three.js scene as the login page) shows through from behind it */
[data-testid="stAppViewContainer"]{ background:transparent !important; }
[data-testid="stHeader"]{ background:transparent !important; }
.main .block-container{ padding-top:2.2rem; }

::-webkit-scrollbar{ width:11px; }
::-webkit-scrollbar-track{ background:#f1efe9; }
::-webkit-scrollbar-thumb{ background:linear-gradient(180deg,var(--gold-light),var(--gold)); border-radius:8px; border:2px solid #f1efe9; }

/* section cards - real Streamlit bordered containers, true frosted glass
   over the 3D canvas, matching the login page's card treatment exactly */
.ra-card{
  position:relative;
  background:rgba(255,255,255,0.62) !important;
  backdrop-filter:blur(22px) saturate(160%) !important;
  -webkit-backdrop-filter:blur(22px) saturate(160%) !important;
  border:1px solid rgba(255,255,255,0.5) !important;
  border-radius:22px !important;
  padding:8px 8px !important;
  box-shadow:0 1px 1px rgba(255,255,255,0.6) inset, 0 30px 60px -28px rgba(0,0,0,0.18);
  margin-bottom:30px;
  opacity:0; transform:perspective(1400px) translateY(40px) scale(0.985);
  transform-style:preserve-3d; will-change:transform, opacity;
  transition:opacity 0.8s cubic-bezier(.16,.8,.24,1), transform 0.8s cubic-bezier(.16,.8,.24,1), box-shadow 0.4s ease, border-color 0.4s ease;
  overflow:hidden;
}
.ra-card::before{
  content:""; position:absolute; top:0; left:0; right:0; height:3px;
  background:linear-gradient(90deg, transparent, var(--gold-light), var(--gold), var(--gold-light), transparent);
  opacity:0.85; z-index:2;
}
/* once first revealed, hand continuous transform control to the scroll-tied
   JS below (faster transition so it tracks the scroll smoothly instead of
   the slower one-shot entrance easing) */
.ra-card.reveal-visible{
  opacity:1; transform:perspective(1400px) translateY(0) scale(1);
  transition:opacity 0.15s linear, transform 0.15s linear, box-shadow 0.4s ease, border-color 0.4s ease;
}
.ra-card:hover{
  box-shadow:0 1px 1px rgba(255,255,255,0.7) inset, 0 40px 74px -26px rgba(184,134,11,0.32) !important;
  border-color:rgba(184,134,11,0.45) !important;
}
[data-testid="stMain"]{ perspective:1600px; }

/* section header badge */
.sec-head{ display:flex; align-items:center; gap:16px; margin:6px 4px 18px; }
.sec-badge{
  flex:0 0 auto; width:44px; height:44px; border-radius:13px;
  background:linear-gradient(135deg,var(--gold-light),var(--gold));
  color:#fff; font-weight:800; font-size:17px;
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 10px 22px rgba(184,134,11,0.35);
}
.sec-title{ font-size:24px; font-weight:800; color:var(--ink); line-height:1.15; }
.sec-sub{ font-size:13.5px; color:#8a8a8a; margin-top:2px; }

/* metrics as premium glass tiles */
div[data-testid="stMetric"]{
  background:rgba(255,255,255,0.55);
  backdrop-filter:blur(10px);
  border:1px solid rgba(255,255,255,0.6);
  border-radius:16px; padding:16px 18px 12px;
  box-shadow:0 1px 1px rgba(255,255,255,0.7) inset, 0 12px 24px -16px rgba(0,0,0,0.12);
  transition:transform 0.3s cubic-bezier(.2,.8,.2,1), box-shadow 0.3s ease, border-color 0.3s ease;
}
div[data-testid="stMetric"]:hover{
  transform:translateY(-5px) scale(1.015);
  box-shadow:0 1px 1px rgba(255,255,255,0.8) inset, 0 22px 40px -16px rgba(184,134,11,0.45);
  border-color:rgba(184,134,11,0.5);
}
div[data-testid="stMetricLabel"]{ font-size:11.5px !important; letter-spacing:0.6px; text-transform:uppercase; color:#9a8560 !important; font-weight:600 !important; }
div[data-testid="stMetricValue"]{ font-weight:800 !important; color:var(--ink) !important; font-size:1.9rem !important; }

/* buttons */
div[data-testid="stButton"] button{
  border-radius:12px !important;
  box-shadow:0 10px 24px rgba(184,134,11,0.28);
  transition:transform 0.15s ease, box-shadow 0.15s ease !important;
  font-weight:700 !important; letter-spacing:0.2px;
}
div[data-testid="stButton"] button:hover{
  transform:translateY(-2px);
  box-shadow:0 16px 32px rgba(184,134,11,0.38);
}
div[data-testid="stButton"] button:active{ transform:translateY(0); }

/* alerts */
div[data-testid="stAlert"]{
  border-radius:14px !important;
  border:1px solid var(--line) !important;
  box-shadow:0 10px 26px -16px rgba(0,0,0,0.18);
}

/* code blocks */
div[data-testid="stCodeBlock"]{
  border-radius:14px !important;
  overflow:hidden;
  box-shadow:0 14px 30px -18px rgba(0,0,0,0.25);
  border:1px solid rgba(0,0,0,0.06);
}

/* plotly charts get a card feel too */
div[data-testid="stPlotlyChart"]{
  border-radius:14px; overflow:hidden;
  box-shadow:0 1px 2px rgba(0,0,0,0.03), 0 16px 32px -20px rgba(0,0,0,0.15);
}

h1{ font-weight:900 !important; letter-spacing:-1.2px !important; font-size:2.6rem !important; }
[data-testid="stCaptionContainer"]{ font-size:13px !important; color:#9a8560 !important; letter-spacing:1px !important; font-weight:600; }

.count-up{ transition:none; }
</style>
""", unsafe_allow_html=True)

# Ambient premium background (CSS-only - no WebGL, so it can't crash or
# leak under Streamlit's frequent rerun cycle) + one debounced MutationObserver
# that handles both scroll-reveal and count-up animation, bound ONCE per
# element (never a forever-polling interval, which is what caused a runaway
# WebGL crash loop in an earlier version of this file - see git history / README).
components.html("""
<script>
(function(){
  const doc = window.parent.document;

  if(!doc.getElementById('risk-autopsy-bg-style')){
    const style = doc.createElement('style');
    style.id = 'risk-autopsy-bg-style';
    style.textContent = `
      #risk-autopsy-bg{ position:fixed; inset:0; z-index:-1; overflow:hidden; background:#fff; }
      #risk-autopsy-bg span{
        position:absolute; border-radius:50%; filter:blur(70px);
        background:radial-gradient(circle, rgba(184,134,11,0.16), rgba(212,175,55,0.03) 70%);
        animation:raDrift 34s ease-in-out infinite alternate;
      }
      #risk-autopsy-bg span:nth-child(1){ width:520px; height:520px; top:-140px; left:-120px; animation-duration:30s; }
      #risk-autopsy-bg span:nth-child(2){ width:420px; height:420px; top:20%; right:-100px; animation-duration:38s; animation-delay:-6s;
        background:radial-gradient(circle, rgba(212,175,55,0.14), rgba(184,134,11,0.02) 70%); }
      #risk-autopsy-bg span:nth-child(3){ width:600px; height:600px; bottom:-220px; left:20%; animation-duration:44s; animation-delay:-14s; }
      @keyframes raDrift{ from{ transform:translate(0,0) scale(1);} to{ transform:translate(60px,40px) scale(1.12);} }
    `;
    doc.head.appendChild(style);
  }
  if(!doc.getElementById('risk-autopsy-bg')){
    const bg = doc.createElement('div');
    bg.id = 'risk-autopsy-bg';
    bg.innerHTML = '<span></span><span></span><span></span>';
    doc.body.insertBefore(bg, doc.body.firstChild);
  }

  function fmtIndianComma(n){
    // Match the app's existing f"{x:,.0f}" (Western grouping) formatting -
    // toLocaleString('en-IN') would silently produce a DIFFERENT grouping
    // (lakhs/crores) than every static number already on the page, which
    // reads as a bug the moment the two are seen side by side.
    return Math.round(n).toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
  }

  function animateValue(el, endStr){
    const match = endStr.match(/-?[\\d,]+\\.?\\d*/);
    if(!match) return;
    const prefix = endStr.slice(0, match.index);
    const suffix = endStr.slice(match.index + match[0].length);
    const end = parseFloat(match[0].replace(/,/g,''));
    const decimals = (match[0].split('.')[1]||'').length;
    const duration = 900; const start = performance.now();
    function frame(now){
      const p = Math.min((now-start)/duration, 1);
      const eased = 1 - Math.pow(1-p, 3);
      const val = end * eased;
      const formatted = decimals ? val.toFixed(decimals) : fmtIndianComma(val);
      el.textContent = prefix + formatted + suffix;
      if(p < 1) requestAnimationFrame(frame);
      else el.textContent = prefix + (decimals ? end.toFixed(decimals) : fmtIndianComma(end)) + suffix;
    }
    requestAnimationFrame(frame);
  }

  if(!doc._riskAutopsyObserver){
    // IMPORTANT: must use the PARENT window's own IntersectionObserver
    // constructor (doc.defaultView.IntersectionObserver), not this iframe's
    // local one - an observer created in one document/realm reliably
    // observing target elements that live in a DIFFERENT document (the
    // parent) is not something browsers support consistently. Using the
    // wrong-realm constructor here silently never fired, leaving every
    // card stuck at opacity:0 (invisible) forever - a real regression,
    // caught by checking the DOM state directly rather than assuming.
    doc._riskAutopsyObserver = new doc.defaultView.IntersectionObserver((entries)=>{
      entries.forEach(entry => { if(entry.isIntersecting) entry.target.classList.add('reveal-visible'); });
    }, { root:null, threshold:0.08, rootMargin:'0px 0px -60px 0px' });
  }

  function tagCardElements(){
    // Streamlit's bordered-container markup uses an internal generated class
    // name (not a stable data-testid) to render the border, and it has
    // changed between Streamlit versions before. Detecting "is this actually
    // a bordered container" by its REAL rendered border - rather than
    // guessing at Streamlit's internal class/testid - keeps this working
    // even if that internal implementation changes again.
    doc.querySelectorAll('div[data-testid="stVerticalBlock"]:not(.ra-card-checked)').forEach(el=>{
      el.classList.add('ra-card-checked');
      const cs = doc.defaultView.getComputedStyle(el);
      if(cs.borderTopWidth !== '0px'){ el.classList.add('ra-card'); }
    });
  }

  function bindNewElements(){
    tagCardElements();
    doc.querySelectorAll('.ra-card:not(.reveal-bound)').forEach((el,i)=>{
      el.classList.add('reveal-bound');
      el.style.transitionDelay = (i % 6) * 0.06 + 's';
      doc._riskAutopsyObserver.observe(el);
      // safety net: don't rely solely on the observer firing in time - if
      // this card is already on-screen right now, reveal it immediately.
      const r = el.getBoundingClientRect();
      if(r.top < doc.defaultView.innerHeight && r.bottom > 0){
        el.classList.add('reveal-visible');
      }
    });
    doc.querySelectorAll('div[data-testid="stMetricValue"]:not(.count-up-done)').forEach(el=>{
      el.classList.add('count-up-done');
      const target = el.textContent;
      if(!/\\d/.test(target)) return;
      el.textContent = target.replace(/[\\d,]/g, '0');
      animateValue(el, target);
    });
  }

  bindNewElements();
  if(doc._riskAutopsyMO) doc._riskAutopsyMO.disconnect();
  let debounceTimer = null;
  doc._riskAutopsyMO = new MutationObserver(()=>{
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(bindNewElements, 120);
  });
  const root = doc.querySelector('section.main') || doc.body;
  doc._riskAutopsyMO.observe(root, { childList:true, subtree:true });

  // ---- Continuous scroll-linked 3D tilt/parallax/fade ----
  // Runs every frame WHILE scrolling (not just once on first view): each
  // card tilts and fades based on how far it sits from the vertical center
  // of the viewport, so the page keeps moving/responding the entire time
  // you scroll, not just on first appearance.
  const win = doc.defaultView;
  let ticking = false;
  function applyScrollTilt(){
    ticking = false;
    const vh = win.innerHeight;
    const center = vh / 2;
    doc.querySelectorAll('.ra-card.reveal-visible').forEach(el=>{
      const rect = el.getBoundingClientRect();
      const elCenter = rect.top + rect.height/2;
      let norm = (elCenter - center) / vh;           // -0.5..0.5 roughly, can exceed
      norm = Math.max(-1, Math.min(1, norm));
      const rotateX = norm * 10;                       // tilt up to 10deg
      const translateZ = -Math.abs(norm) * 60;          // recede into the screen
      const opacity = Math.max(0.35, 1 - Math.abs(norm) * 0.9);
      const scale = 1 - Math.abs(norm) * 0.035;
      el.style.opacity = opacity;
      el.style.transform = `perspective(1400px) rotateX(${-rotateX}deg) translateZ(${translateZ}px) scale(${scale})`;
    });
  }
  function onScroll(){
    if(!ticking){ win.requestAnimationFrame(applyScrollTilt); ticking = true; }
  }
  if(!doc._riskAutopsyScrollBound){
    doc._riskAutopsyScrollBound = true;
    win.addEventListener('scroll', onScroll, { passive:true });
    win.setInterval(applyScrollTilt, 400); // catches cards newly revealed between scroll events
  }
  applyScrollTilt();
})();
</script>
""", height=0)

def section_head(number, title, subtitle=None):
    sub_html = f'<div class="sec-sub">{subtitle}</div>' if subtitle else ""
    st.markdown(f"""
    <div class="sec-head">
      <div class="sec-badge">{number}</div>
      <div><div class="sec-title">{title}</div>{sub_html}</div>
    </div>
    """, unsafe_allow_html=True)

PLOTLY_TEMPLATE = go.layout.Template()
PLOTLY_TEMPLATE.layout = dict(
    paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(250,248,243,0.6)",
    font=dict(color="#1A1A1A", family="-apple-system,Segoe UI,sans-serif"),
    colorway=["#B8860B", "#D4AF37", "#2E86AB", "#D64545"],
)

@st.cache_data
def load_data():
    customers = pd.read_csv(os.path.join(DATA, "customers.csv"))
    txns = pd.read_csv(os.path.join(DATA, "transactions.csv"))
    with open(os.path.join(DATA, "results.json")) as f:
        results = json.load(f)
    with open(os.path.join(DATA, "adversarial_results.json")) as f:
        adv = json.load(f)
    with open(os.path.join(DATA, "coevolution_results.json")) as f:
        coevo = json.load(f)
    return customers, txns, results, adv, coevo

customers, txns, results, adv, coevo = load_data()
total_loss = txns[txns.txn_type == "chargeback"].amount.sum()

st.title("🔬 Risk Autopsy")
st.caption("EVERY LOSS BECOMES A DEFENSE  ·  ABUSE-RING SENTINEL  ·  TRACK 2")
st.write("")

# ---------------- Section 1: the loss ----------------
with st.container(border=True):
    section_head(1, "This merchant lost money", "The starting point of every autopsy: a real, unexplained loss.")
    c1, c2, c3 = st.columns(3)
    c1.metric("Total chargeback loss (90 days)", f"₹{total_loss:,.0f}")
    c2.metric("Customers involved", f"{customers.is_abuse_ring.sum()}")
    c3.metric("Abuse rings detected in autopsy", f"{customers[customers.is_abuse_ring==1].address_id.nunique()}")
    st.markdown("We don't know why yet. Let's find out.")

# ---------------- Section 2: autopsy on one merchant ----------------
with st.container(border=True):
    section_head(2, "Run Autopsy on one flagged customer", "Reconstruct the exact decision chain that let the loss happen.")

    abuse_customers = customers[customers.is_abuse_ring == 1].customer_id.tolist()
    selected = st.selectbox("Pick a customer to reconstruct", abuse_customers, index=0)

    if st.button("▶ RUN AUTOPSY", type="primary"):
        st.session_state.autopsy_run = True

    if st.session_state.get("autopsy_run"):
        ct = txns[txns.customer_id == selected].sort_values("day")
        cust_row = customers[customers.customer_id == selected].iloc[0]

        st.subheader(f"Timeline reconstruction — customer #{selected}")
        fig = go.Figure()
        colors = {"purchase": "#2E86AB", "return": "#D4AF37", "chargeback": "#D64545"}
        for _, row in ct.iterrows():
            fig.add_trace(go.Scatter(
                x=[row.day], y=[row.amount], mode="markers+text",
                marker=dict(size=18, color=colors.get(row.txn_type, "gray"),
                            line=dict(width=2, color="white")),
                text=[row.txn_type], textposition="top center",
                name=row.txn_type, showlegend=False,
            ))
        fig.update_layout(template=PLOTLY_TEMPLATE, xaxis_title="Day", yaxis_title="Amount (₹)", height=350,
                           title="Every step here was individually approved by existing controls",
                           margin=dict(t=60))
        st.plotly_chart(fig, width='stretch')

        n_ring_members = (customers.address_id == cust_row.address_id).sum()
        st.warning(f"⚠️ This customer shares an address with **{n_ring_members - 1} other accounts** — "
                   f"a coordinated ring, not an isolated incident.")

# ---------------- Section 3: policy comparison ----------------
with st.container(border=True):
    section_head(3, "Existing policy vs. discovered policy", "The brief's exact required deliverable: measured precision, recall, false-positive cost.")

    col1, col2 = st.columns(2)
    with col1:
        st.subheader("🔴 Baseline policy (industry-standard)")
        st.code("IF max_purchase_amount > ₹25,000:\n    FLAG for step-up verification")
        b = results["baseline"]
        st.metric("Precision", f"{b['precision']:.1%}")
        st.metric("Recall", f"{b['recall']:.1%}")
        st.metric("Loss prevented", f"₹{b['loss_prevented']:,.0f} / ₹{results['total_test_loss']:,.0f}")
        st.metric("False positives (cost)", f"{b['fp']} (₹{b['fp_cost']:,.0f})")

    with col2:
        st.subheader("🟢 Discovered policy v1 (behavioral)")
        st.code(results["rule_text"])
        d = results["discovered"]
        st.metric("Precision", f"{d['precision']:.1%}")
        st.metric("Recall", f"{d['recall']:.1%}")
        st.metric("Loss prevented", f"₹{d['loss_prevented']:,.0f} / ₹{results['total_test_loss']:,.0f}")
        st.metric("False positives (cost)", f"{d['fp']} (₹{d['fp_cost']:,.0f})")

    st.info(f"Discovered policy v1 catches **{d['loss_prevented']/results['total_test_loss']:.0%}** of held-out loss "
            f"vs baseline's **{b['loss_prevented']/results['total_test_loss']:.0%}**, with "
            f"**{b['fp'] - d['fp']} fewer false positives**.")

# ---------------- Section 4: adversarial test ----------------
with st.container(border=True):
    section_head(4, "\"But we don't trust our own AI\"", "Adversarial stress test before deployment.")
    st.markdown("We don't guess where the policy is weak — we **introspect the model's own "
                 "feature importances** to find out, then craft an evasion that specifically targets that.")

    if st.button("⚔ RUN ADVERSARIAL TEST"):
        st.session_state.adv_run = True

    if st.session_state.get("adv_run"):
        st.info(f"🔍 **Introspection result:** v1 relies on **`{adv['top_feature']}`** for "
                f"**{adv['top_feature_importance']:.0%}** of its decision — everything else is nearly unused. "
                f"That's the blind spot to attack.")
        colA, colB = st.columns(2)
        with colA:
            st.error(f"**Policy v1 result:** {adv['v1_missed']} / {adv['n_evaders']} evasion attempts "
                     f"**MISSED** ({adv['v1_missed']/adv['n_evaders']:.0%} evasion success)")
            st.caption(f"A ring that keeps `{adv['top_feature']}` low — while still behaving like a real ring "
                       f"(shared device/address, coordinated timing) — walks straight through v1.")

        st.markdown("**Retraining v2** with the evasion cases included as regression tests...")

        with colB:
            st.success(f"**Policy v2 result:** {adv['v2_missed']} / {adv['n_evaders']} evasion attempts missed "
                        f"({adv['v2_missed']/adv['n_evaders']:.0%} evasion success)")
            st.caption("v2 learns to weigh other real signals (device/address sharing, amount) instead of "
                       f"over-relying on `{adv['top_feature']}` alone.")

        st.subheader("v2 regression check — did fixing the blind spot break anything on the original test set?")
        r1, r2 = st.columns(2)
        r1.metric("Precision", f"{adv['v2_test_precision']:.1%}")
        r2.metric("Recall", f"{adv['v2_test_recall']:.1%}")
        r3, r4 = st.columns(2)
        r3.metric("False positives", adv['v2_test_fp'])
        r4.metric("Loss prevented", f"₹{adv['v2_loss_prevented']:,.0f}",
                   delta=f"of ₹{adv['total_test_loss']:,.0f} total")
        st.code(adv["v2_rule_text"])
        st.success("✅ No regression. v2 is a strict improvement over v1 — ready for human approval.")

# ---------------- Section 4.5: automated co-evolution (the capstone) ----------------
with st.container(border=True):
    section_head("4.5", "Automated red-team / blue-team co-evolution", "The capstone: not one test, a converging arms race.")
    st.markdown("""
    One adversarial test proves the policy survives *one* attack. It doesn't prove there isn't a
    *different* gap right next to it. So we don't stop at one round — we run an **automated arms race**:
    an attacker repeatedly searches for evasions within the known abuse archetype (varying amounts,
    timing, and sharing — not inventing new fraud types), and a defender retrains after every round
    that finds any. This continues until the attacker exhausts its search budget with **zero** wins —
    a measured **robustness certificate**, not a one-off test.
    """)

    if st.button("🧬 RUN CO-EVOLUTION ARMS RACE"):
        st.session_state.coevo_run = True

    if st.session_state.get("coevo_run"):
        log_df = pd.DataFrame(coevo["generation_log"])
        fig2 = go.Figure()
        fig2.add_trace(go.Bar(x=log_df.generation, y=log_df.evasions_found,
                                marker_color="#D64545", name="Evasions found"))
        fig2.update_layout(
            template=PLOTLY_TEMPLATE,
            title=f"Evasions found per generation (search budget: {coevo['search_budget_per_generation']} candidates/round)",
            xaxis_title="Generation", yaxis_title="Evasions found", height=320,
        )
        st.plotly_chart(fig2, width='stretch')

        if coevo["converged"]:
            st.success(f"🏆 **Converged at generation {coevo['converged_at_generation']}** — the attacker "
                       f"could no longer find a single evasion in a fresh {coevo['search_budget_per_generation']}-candidate "
                       f"search within the known abuse archetype.")
        else:
            st.warning("Did not converge within the generation budget — policy still has exploitable gaps.")

        st.subheader("Final policy — validated against the ENTIRE customer population, not just held-out")
        f1, f2, f3 = st.columns(3)
        f1.metric("Precision (full population)", f"{coevo['final_precision']:.1%}")
        f2.metric("Recall (full population)", f"{coevo['final_recall']:.1%}")
        f3.metric("False positives (full population)", coevo['final_fp'])
        st.code(coevo["final_rule_text"])
        st.caption("This is the policy that would ship — it survived not one adversarial test, "
                   "but a converged arms race, and was independently re-checked against every "
                   "customer in the dataset, not just the held-out slice.")

# ---------------- Section 5: approval ----------------
with st.container(border=True):
    section_head(5, "Human approval gate", "This system never auto-deploys.")
    st.markdown("""
    Every candidate policy ships with:
    - Precision/recall/false-positive cost on a **held-out test set**
    - An **adversarial regression log** (what evasion attempts were tried, and the result)
    - The exact human-readable rule — no black box

    **Next steps not built in this prototype (roadmap):**
    - Doubly-robust off-policy evaluation (accounting for the fact historical data was generated under the *old* policy)
    - Policy portfolio conflict checks (does this rule spike false positives on any customer segment?)
    - Auto-generated compliance-ready PDF dossier per policy
    """)
    if st.button("✅ SUBMIT FOR HUMAN APPROVAL", type="primary"):
        st.balloons()
        st.success("Policy v2 submitted for review. Every loss becomes a defense.")
