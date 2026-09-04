# Risk Autopsy — 5-minute pitch script

The buildathon deliverable is public repo + 5-minute pitch video + architecture doc. The video is what a judge actually watches; the dashboard is what they might click through afterward if you've earned it. Structure the video to lead with your best finding, not your first section.

---

## 0:00–0:30 — The loss, stated plainly

> "[Merchant] lost ₹47.58 lakh to chargebacks in 90 days, across 180 customers and 45 coordinated abuse rings. The industry-standard rule — flag anything over ₹25,000 — catches 58% of that loss and wrongly flags 57 good customers along the way. That's the problem Track 2 asked us to solve: one loss category, honest metrics, defense only."

---

## 0:30–1:30 — The policy, and the honest number

Show the baseline-vs-discovered comparison. State precision (90.6%), recall (100%), and false-positive cost (₹750 vs ₹8,550) out loud. Then say the caveat yourself, unprompted:

> "This dataset's abuse rings share device and address IDs by construction, which makes it easier to separate than real-world fraud. On a harder synthetic tier, precision holds at 74.7%; on a secret seed we never touched during training, 98.4%. We're not hiding the easy case — we tested against the hard one too."

---

## 1:30–3:00 — Lead with the blind spot you found and fixed

This is your best material — don't bury it in a validation appendix.

> "We ran an adversarial arms race against our own policy and it converged in two generations with zero evasions found — looked done. But we noticed the attacker's search only ever tried rings that wait 10 to 30 days before escalating. So we asked: what if a ring struck faster than that? We simulated it. Recall collapsed to zero by month 10 — a policy that looked fully converged had a blind spot the certificate never tested. We widened the attacker's search down to 1 day, re-ran the arms race, re-converged, and verified recall never drops below 50% across all 12 months, including the previously fatal fast-strike window. That's the difference between a policy that passed its own test and a policy that's actually been attacked honestly."

*(Show: the drift monitor chart collapsing, then the remediation screenshot showing it fixed. This is your single best visual — spend real time on it.)*

---

## 3:00–4:00 — Defense-only, by design

> "Every action this system takes sits on a graded ladder — allow, step-up verification, delay, manual review, block — chosen by expected rupee value, never a blanket punishment. Nothing deploys automatically. Every candidate policy waits at a human approval gate with the exact rule in plain English, an adversarial log, and the accounts it would newly flag — including five borderline cases we flagged for human review because they don't match the known-abuser profile, with a plain-language draft letter ready for each."

---

## 4:00–4:45 — What's next / limitations, stated yourself

> "This runs on synthetic data by construction — we say so throughout, not just in a footnote. We deliberately chose shallow decision trees over complex ensembles so a human approver can actually read the rule, and built an offline pipeline rather than streaming infra because this is a hackathon prototype, not production. The next real step is running the same pipeline against a merchant's actual transaction CSV, which the app already supports via unsupervised device/address-sharing detection since real uploads have no ground-truth labels."

---

## 4:45–5:00 — Close

Name the repo, restate the one-sentence pitch:

> "One loss category, honestly measured, adversarially tested, never auto-deployed."

---

## Why this ordering

It puts your single most impressive, most differentiated piece of work — the fast-strike blind spot — in the first 90 seconds after the setup, not somewhere past minute 8 of a dashboard walkthrough a judge was never going to reach. Everything after that becomes "and here's why you can trust this," which lands better once they've already seen you catch yourself being wrong once.

## Delivery notes

- **Don't open on section 1 of the dashboard.** Lead with the numbers, then the drift-monitor finding. That story is the only thing in this project a judge will remember after seeing 30 other submissions.
- **Have the drift-monitor and remediation screenshots ready to flash immediately** — `docs/screenshots/08-drift-monitor.jpg` and `docs/screenshots/11-remediation-closed-loop.jpg`.
- **If asked "why so much extra stuff beyond the brief":** the answer is in the close — supporting evidence for a number you can already state in one sentence, not a separate set of features to be impressed by individually.
