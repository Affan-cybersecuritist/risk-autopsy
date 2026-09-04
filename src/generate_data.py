"""
Risk Autopsy - synthetic transaction data generator.

Simulates a merchant's customer base over a period, with:
- Normal customers (majority, benign behavior)
- Abuse-ring customers (minority, embedded pattern: low-value purchase ->
  wait 17-23 days -> escalate to high-value purchase -> return/chargeback)
This mirrors a real, documented abuse typology (purchase-escalation fraud /
return abuse), not an arbitrary invented pattern.

This is the "easy" tier - see src/dataset_tiers.py for the harder
"ambiguous"/"adversarial" tiers used by src/difficulty_tiers_eval.py to
honestly test whether this project's headline numbers survive weaker
signal, not just this population.

Output: data/transactions.csv, data/customers.csv
"""
import numpy as np
from dataset_tiers import generate_population

rng = np.random.default_rng(42)
df_customers, df_txns = generate_population(rng, tier="easy")

df_customers.to_csv("data/customers.csv", index=False)
df_txns.to_csv("data/transactions.csv", index=False)

print("Customers:", len(df_customers), " | Abuse ring:", df_customers.is_abuse_ring.sum())
print("Transactions:", len(df_txns))
print("Total chargeback loss (Rs):", df_txns[df_txns.txn_type=="chargeback"].amount.sum())
