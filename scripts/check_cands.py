import sys
sys.path.insert(0, '.')
import engines.survey_engine as se
res = se.get_survey_candidates('ASTAGA', '2026-10', '2026')
cands = res.get('candidates', [])
cabangs = set(c.get('cabang') for c in cands)
print('Cabangs:', cabangs)
online_cands = [c for c in cands if str(c.get('cabang') or '').upper() == 'ONLINE']
print('Online count:', len(online_cands))
