import sys
sys.path.insert(0, '.')
import engines.survey_engine as se
res = se.get_survey_candidates('ASTAGA', '2026-10', '2026')
cands = res.get('candidates', [])
online = [c for c in cands if str(c.get('cabang') or '').upper() == 'ONLINE']
for c in online[:10]:
    print(c['reseller_id'], '| Reseller:', c['reseller_name'], '| Induk:', c['agen_name'], '| Cabang:', c['cabang'], '| SCO:', c['sco_name'])
