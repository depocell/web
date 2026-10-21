import sys
sys.path.insert(0, '.')
import engines.survey_engine as se
from collections import Counter

res = se.get_survey_candidates('ASTAGA', '2026-10', '2026')
cands = res.get('candidates', [])
gt5 = [c for c in cands if c.get('prev_trx', 0) > 5]
le5 = [c for c in cands if c.get('prev_trx', 0) <= 5]

print('Total Churn Awal (>=1 trx):', len(cands))
print('Target Berkualitas (> 5 trx):', len(gt5))
print('Akun Iseng/Retail Kecil (<= 5 trx):', len(le5))
print('\nBreakdown Cabang (> 5 trx):', dict(Counter(c['cabang'] for c in gt5)))

print('\nTop 8 Reseller Potensial (> 5 trx):')
for c in sorted(gt5, key=lambda x: x['prev_trx'], reverse=True)[:8]:
    print(f"  {c['reseller_id']} | {c['reseller_name']} | Cabang: {c['cabang']} | Trx Lalu: {c['prev_trx']}")
