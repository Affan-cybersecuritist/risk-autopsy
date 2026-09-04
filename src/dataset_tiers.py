"""
Risk Autopsy - tier-parameterized synthetic population generator.

WHY THIS EXISTS: the original generate_data.py hardcoded one population -
"easy" below, byte-identical to it. Every headline number in this project
(100%/100%/0 FP) is earned on that population, and this project's own
evasion-distance/intervention-optimizer work found and disclosed a real
weakness: it's near-perfectly separable (device/address sharing is close to
a perfect signal by construction). A skeptical reviewer's next question is
"does this survive harder data?" - this file exists to let src/*_eval.py
scripts answer that honestly, on data that's harder BY CONSTRUCTION, not by
picking numbers that look more modest.

Tiers:
  "easy"       - the original population, unchanged. See generate_data.py.
  "ambiguous"  - adds GENUINE customers who look ring-like without being
                 rings: a shared-corporate-device cluster (coworkers on one
                 office network/card machine), genuine gift-purchase
                 escalations (low then high value, no return), and
                 high-frequency genuine repeat buyers. None of these are
                 abuse - they exist to make "sharing" and "escalation" less
                 clean a signal, honestly harder for the discovered policy.
  "adversarial"- everything in "ambiguous", PLUS the SAME abuse-ring
                 mechanics as "easy" but deliberately camouflaged: the
                 escalation is spread across 2 medium purchases instead of
                 one jump (suppresses escalation_ratio), strike timing is
                 drawn from a wide window instead of the tight 17-23 day
                 pattern, and only 2 of the 4 ring members share a device
                 (partial sharing, weaker signal).

Each tier returns (customers_df, transactions_df) - never writes files
itself; callers decide where results go (generate_data.py writes the "easy"
tier to the committed data/ files, exactly as before; eval scripts write
tier-specific outputs elsewhere).
"""
import numpy as np
import pandas as pd


def _add_txn(transactions, cid, day, amount, txn_type, device_id, address_id):
    transactions.append({
        "customer_id": cid, "day": day, "amount": amount,
        "txn_type": txn_type, "device_id": device_id, "address_id": address_id,
    })


def _generate_easy_core(rng, customers, transactions, cust_id):
    """The original generate_data.py population, unmodified logic - kept as
    its own function so "ambiguous"/"adversarial" can build ON TOP of it
    rather than duplicating it."""
    N_NORMAL = 2850
    N_NORMAL_HIGH_VALUE = 150
    N_ABUSE_LOUD = 80
    N_ABUSE_STEALTH = 100

    N_FAMILY_CUSTOMERS = int(N_NORMAL * 0.05)
    family_assignments = {}
    idx = 0
    fam_cluster_num = 0
    while idx < N_FAMILY_CUSTOMERS:
        size = int(rng.integers(2, 5))
        fam_device = f"dev_family_{fam_cluster_num}"
        fam_addr = f"addr_family_{fam_cluster_num}"
        for _ in range(min(size, N_FAMILY_CUSTOMERS - idx)):
            family_assignments[idx] = (fam_device, fam_addr)
            idx += 1
        fam_cluster_num += 1

    for i in range(N_NORMAL):
        cid = cust_id; cust_id += 1
        if i in family_assignments:
            device_id, address_id = family_assignments[i]
        else:
            device_id = f"dev_{cid}"
            address_id = f"addr_{cid}"
        account_created_day = rng.integers(0, 60)
        n_purchases = rng.poisson(3) + 1
        day = account_created_day
        for p in range(n_purchases):
            day += rng.integers(3, 25)
            amount = float(np.clip(rng.lognormal(mean=7.2, sigma=0.5), 200, 24000))
            _add_txn(transactions, cid, day, amount, "purchase", device_id, address_id)
            if rng.random() < 0.05:
                _add_txn(transactions, cid, day + rng.integers(2, 10), amount, "return", device_id, address_id)
        customers.append({"customer_id": cid, "is_abuse_ring": 0, "account_created_day": account_created_day,
                           "device_id": device_id, "address_id": address_id})

    for i in range(N_NORMAL_HIGH_VALUE):
        cid = cust_id; cust_id += 1
        device_id = f"dev_{cid}"
        address_id = f"addr_{cid}"
        account_created_day = rng.integers(0, 60)
        day = account_created_day + rng.integers(5, 20)
        amount = float(np.clip(rng.normal(35000, 8000), 26000, 60000))
        _add_txn(transactions, cid, day, amount, "purchase", device_id, address_id)
        customers.append({"customer_id": cid, "is_abuse_ring": 0, "account_created_day": account_created_day,
                           "device_id": device_id, "address_id": address_id})

    cluster_size = 4
    for c in range(N_ABUSE_LOUD // cluster_size):
        shared_device = f"dev_ring_loud_{c}"
        shared_addr = f"addr_ring_loud_{c}"
        for k in range(cluster_size):
            cid = cust_id; cust_id += 1
            account_created_day = rng.integers(0, 40)
            low_amount = float(np.clip(rng.normal(1200, 300), 300, 3000))
            wait = int(rng.integers(17, 24))
            high_amount = float(np.clip(rng.normal(42000, 6000), 30000, 60000))
            day1 = account_created_day + rng.integers(3, 10)
            _add_txn(transactions, cid, day1, low_amount, "purchase", shared_device, shared_addr)
            day2 = day1 + wait
            _add_txn(transactions, cid, day2, high_amount, "purchase", shared_device, shared_addr)
            day3 = day2 + rng.integers(2, 6)
            _add_txn(transactions, cid, day3, high_amount, "return", shared_device, shared_addr)
            day4 = day3 + rng.integers(1, 4)
            _add_txn(transactions, cid, day4, high_amount, "chargeback", shared_device, shared_addr)
            customers.append({"customer_id": cid, "is_abuse_ring": 1, "account_created_day": account_created_day,
                               "device_id": shared_device, "address_id": shared_addr})

    for c in range(N_ABUSE_STEALTH // cluster_size):
        shared_device = f"dev_ring_stealth_{c}"
        shared_addr = f"addr_ring_stealth_{c}"
        for k in range(cluster_size):
            cid = cust_id; cust_id += 1
            account_created_day = rng.integers(0, 40)
            low_amount = float(np.clip(rng.normal(900, 200), 300, 1800))
            wait = int(rng.integers(17, 24))
            mid_amount = float(np.clip(rng.normal(14000, 2500), 8000, 21000))
            day1 = account_created_day + rng.integers(3, 10)
            _add_txn(transactions, cid, day1, low_amount, "purchase", shared_device, shared_addr)
            day2 = day1 + wait
            _add_txn(transactions, cid, day2, mid_amount, "purchase", shared_device, shared_addr)
            day3 = day2 + rng.integers(2, 6)
            _add_txn(transactions, cid, day3, mid_amount, "return", shared_device, shared_addr)
            day4 = day3 + rng.integers(1, 4)
            _add_txn(transactions, cid, day4, mid_amount, "chargeback", shared_device, shared_addr)
            customers.append({"customer_id": cid, "is_abuse_ring": 1, "account_created_day": account_created_day,
                               "device_id": shared_device, "address_id": shared_addr})

    return cust_id


def _add_ambiguous_customers(rng, customers, transactions, cust_id):
    """Genuine customers who look ring-like WITHOUT being rings - makes the
    "sharing" and "escalation" signals honestly harder, not artificially
    easy. None of these are is_abuse_ring=1."""
    # Shared-corporate-device cluster: 6 genuine coworkers on one office
    # network/card machine - real device sharing, zero abuse.
    N_CORP_CLUSTERS = 5
    for c in range(N_CORP_CLUSTERS):
        corp_device = f"dev_corp_{c}"
        for k in range(6):
            cid = cust_id; cust_id += 1
            address_id = f"addr_{cid}"  # different homes - only the device is shared
            account_created_day = rng.integers(0, 60)
            n_purchases = rng.poisson(2) + 1
            day = account_created_day
            for p in range(n_purchases):
                day += rng.integers(3, 25)
                amount = float(np.clip(rng.lognormal(mean=7.0, sigma=0.4), 200, 20000))
                _add_txn(transactions, cid, day, amount, "purchase", corp_device, address_id)
            customers.append({"customer_id": cid, "is_abuse_ring": 0, "account_created_day": account_created_day,
                               "device_id": corp_device, "address_id": address_id})

    # Genuine gift-purchase escalation: low value then, weeks later, a real
    # high-value gift - looks like ring escalation timing, no return/sharing.
    N_GIFT_CUSTOMERS = 60
    for _ in range(N_GIFT_CUSTOMERS):
        cid = cust_id; cust_id += 1
        device_id = f"dev_{cid}"
        address_id = f"addr_{cid}"
        account_created_day = rng.integers(0, 40)
        low_amount = float(np.clip(rng.normal(1200, 300), 300, 3000))
        wait = int(rng.integers(15, 26))  # overlaps the ring's 17-23 day window on purpose
        gift_amount = float(np.clip(rng.normal(20000, 5000), 8000, 40000))
        day1 = account_created_day + rng.integers(3, 10)
        _add_txn(transactions, cid, day1, low_amount, "purchase", device_id, address_id)
        day2 = day1 + wait
        _add_txn(transactions, cid, day2, gift_amount, "purchase", device_id, address_id)
        customers.append({"customer_id": cid, "is_abuse_ring": 0, "account_created_day": account_created_day,
                           "device_id": device_id, "address_id": address_id})

    # Genuine high-frequency repeat buyers - high purchase COUNT (burst-like)
    # but no escalation, no sharing, no return.
    N_FREQUENT_CUSTOMERS = 60
    for _ in range(N_FREQUENT_CUSTOMERS):
        cid = cust_id; cust_id += 1
        device_id = f"dev_{cid}"
        address_id = f"addr_{cid}"
        account_created_day = rng.integers(0, 60)
        n_purchases = int(rng.integers(6, 11))
        day = account_created_day
        for _p in range(n_purchases):
            day += rng.integers(1, 5)
            amount = float(np.clip(rng.lognormal(mean=6.8, sigma=0.3), 200, 15000))
            _add_txn(transactions, cid, day, amount, "purchase", device_id, address_id)
        customers.append({"customer_id": cid, "is_abuse_ring": 0, "account_created_day": account_created_day,
                           "device_id": device_id, "address_id": address_id})

    return cust_id


def _add_adversarial_rings(rng, customers, transactions, cust_id):
    """The SAME abuse-ring mechanics as the 'easy' tier's stealth rings,
    deliberately camouflaged to suppress the exact signals the discovered
    policy relies on - a genuinely harder version of the same archetype,
    not a new one."""
    N_CAMOUFLAGED = 80
    cluster_size = 4
    for c in range(N_CAMOUFLAGED // cluster_size):
        shared_addr = f"addr_ring_camo_{c}"
        cluster_devices = [f"dev_ring_camo_{c}_shared", f"dev_ring_camo_{c}_a", f"dev_ring_camo_{c}_b"]
        for k in range(cluster_size):
            cid = cust_id; cust_id += 1
            # Only 2 of 4 members share the device - partial sharing, weaker signal.
            device_id = cluster_devices[0] if k < 2 else cluster_devices[1 + (k - 2)]
            account_created_day = rng.integers(0, 40)
            low_amount = float(np.clip(rng.normal(2000, 400), 500, 4000))
            # Escalation spread across 2 medium purchases instead of one
            # jump - suppresses escalation_ratio relative to a single big leap.
            mid_amount_1 = float(np.clip(rng.normal(9000, 1500), 6000, 13000))
            mid_amount_2 = float(np.clip(rng.normal(11000, 1500), 8000, 16000))
            # Wide strike-timing window instead of the tight 17-23 day
            # pattern - defeats a policy relying on that narrow signature.
            wait1 = int(rng.integers(3, 35))
            wait2 = int(rng.integers(2, 15))
            day1 = account_created_day + rng.integers(3, 10)
            _add_txn(transactions, cid, day1, low_amount, "purchase", device_id, shared_addr)
            day2 = day1 + wait1
            _add_txn(transactions, cid, day2, mid_amount_1, "purchase", device_id, shared_addr)
            day3 = day2 + wait2
            _add_txn(transactions, cid, day3, mid_amount_2, "purchase", device_id, shared_addr)
            day4 = day3 + rng.integers(2, 6)
            _add_txn(transactions, cid, day4, mid_amount_2, "return", device_id, shared_addr)
            day5 = day4 + rng.integers(1, 4)
            _add_txn(transactions, cid, day5, mid_amount_2, "chargeback", device_id, shared_addr)
            customers.append({"customer_id": cid, "is_abuse_ring": 1, "account_created_day": account_created_day,
                               "device_id": device_id, "address_id": shared_addr})

    return cust_id


def generate_population(rng: np.random.Generator, tier: str = "easy") -> tuple[pd.DataFrame, pd.DataFrame]:
    if tier not in ("easy", "ambiguous", "adversarial"):
        raise ValueError(f"unknown tier {tier!r} - must be 'easy', 'ambiguous', or 'adversarial'")

    customers, transactions = [], []
    cust_id = _generate_easy_core(rng, customers, transactions, 0)

    if tier in ("ambiguous", "adversarial"):
        cust_id = _add_ambiguous_customers(rng, customers, transactions, cust_id)

    if tier == "adversarial":
        cust_id = _add_adversarial_rings(rng, customers, transactions, cust_id)

    df_customers = pd.DataFrame(customers)
    df_txns = pd.DataFrame(transactions).sort_values(["customer_id", "day"]).reset_index(drop=True)
    return df_customers, df_txns
