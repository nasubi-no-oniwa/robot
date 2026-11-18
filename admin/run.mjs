// ランキングの管理（GitHub の上でだけ動く。鍵は FT_BLUE_SERVICE_ACCOUNT）
// admin/req.json の中身にしたがって、記録を調べる（dump）・バンする（ban）
import fs from 'fs';
import { token, api } from '../tools/fb.mjs';
const req = JSON.parse(fs.readFileSync('admin/req.json', 'utf8'));
const tk = await token();
const get = async p => JSON.parse(await api('GET', p, undefined, tk) || 'null');
const t = ms => new Date(ms + 9 * 3600e3).toISOString().slice(5, 19).replace('T', ' ');
if (req.dump) {
  for (const w of ['all', 'd']) {
    const o = await get('/robot/b/' + w + '.json') || {};
    const rows = Object.entries(o).map(([id, r]) => ({ id, ...r })).sort((a, b) => b.sk - a.sk).slice(0, req.top || 15);
    console.log(`\n== ${w === 'd' ? '今日' : '全期間'}（全${Object.keys(o).length}件）`);
    for (const r of rows) {
      const dur = r.at && r.st ? ((r.at - r.st) / 1000).toFixed(1) : '?';
      console.log(`${String(r.k).padStart(4)}問 ${(r.t / 10).toFixed(1)}秒  ${JSON.stringify(r.n)}  uid=${r.id}  開始${t(r.st)}  記録${t(r.at)}  開始から${dur}秒`);
    }
  }
  const ban = await get('/robot/ban.json'); console.log('\n== バン済み', JSON.stringify(ban));
}
for (const uid of req.ban || []) {
  if (!/^[A-Za-z0-9]{20,40}$/.test(uid)) { console.log('uid の形がちがう', uid); continue; }
  const keep = {};
  for (const w of ['all', 'd']) { const r = await get(`/robot/b/${w}/${uid}.json`); if (r) keep[w] = r; }
  await api('PUT', `/robot/ban/${uid}.json`, { at: Date.now(), why: req.why || '', rec: keep }, tk);
  for (const w of ['all', 'd']) await api('DELETE', `/robot/b/${w}/${uid}.json`, undefined, tk);
  console.log('バンしました', uid, JSON.stringify(Object.fromEntries(Object.entries(keep).map(([k, r]) => [k, r.n + ' ' + r.k + '問']))));
}
