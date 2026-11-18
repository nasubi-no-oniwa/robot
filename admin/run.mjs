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

// 自己点検：遊ぶ人と同じ立場（名前なしのログイン）で、記録が書けるか・おかしな記録がはじかれるかを確かめて、あとを消す
if (req.selftest) {
  const KEY = 'AIzaSyB2iLUuAyxSJ45RewGrbyLg0sYLsC7njIo', DB = 'https://ft-blue-default-rtdb.asia-southeast1.firebasedatabase.app/robot/';
  const su = await (await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) })).json();
  const uid = su.localId, q = '?auth=' + encodeURIComponent(su.idToken); let bad = 0;
  const put = (path, body) => fetch(DB + path + '.json' + q, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const want = async (label, r, ok) => { const good = r.ok === ok; if (!good) bad++; console.log((good ? '○' : '×') + ' ' + label + '（' + r.status + '）' + (good ? '' : ' ' + (await r.text()).slice(0, 200))); };
  const TS = { '.sv': 'timestamp' }; const r0 = await put('run/' + uid, { st: TS }); await want('遊び始めの記録が書ける', r0, true); const st = (await r0.json()).st;
  await new Promise(r => setTimeout(r, 2500));
  const dk = Math.floor((Date.now() + 32400000) / 86400000), rec = (k, t) => ({ n: 'てすと', k, t, sk: k * 100000 + 99999 - t, st, v: 1, at: TS, lg: '1-' + t });
  await want('速すぎる記録（2.5秒で300問）は、はじかれる', await put('b/all/' + uid, rec(300, 2000)), false);
  await want('0問の記録が書ける', await put('b/all/' + uid, { ...rec(0, 20), lg: '' }), true);
  await want('ふつうの記録が書ける（全期間）', await put('b/all/' + uid, rec(2, 20)), true);
  await want('ふつうの記録が書ける（今日）', await put('b/d/' + uid, { ...rec(2, 20), dk, ds: dk * 100000000 + rec(2, 20).sk }), true);
  await want('前より悪い記録では上書きできない', await put('b/all/' + uid, rec(1, 20)), false);
  await want('ほかの人の場所には書けない', await put('b/all/xxxxxxxxxxxxxxxxxxxxxxxxxxxx', rec(2, 20)), false);
  await want('ランキングはだれでも読める', await fetch(DB + 'b/all.json?orderBy="sk"&limitToLast=3'), true);
  await want('今日のランキングも読める', await fetch(DB + 'b/d.json?orderBy="ds"&startAt=' + dk * 100000000 + '&limitToLast=3'), true);
  for (const p of ['b/all/', 'b/d/', 'run/']) await api('DELETE', '/robot/' + p + uid + '.json', undefined, tk);
  console.log(bad ? '点検で ' + bad + ' 件の問題' : '点検はすべて通りました'); if (bad) process.exit(1);
}
