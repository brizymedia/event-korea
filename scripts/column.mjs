#!/usr/bin/env node
// 생활정보 · 업계 칼럼 엔진 — 네 사이트(큰길이벤트 · 이벤트코리아 · 큰길브리지 · 진지노샵)가 같은 파일을 쓴다.
// 고칠 때는 네 저장소의 scripts/column.mjs 를 똑같이 고친다. 사이트마다 다른 것은 _column/config.json 에만 둔다.
//
//   node scripts/column.mjs plan              오늘 쓸 업계 글(주제 · 도시) 추천
//   node scripts/column.mjs check [파일…]      글 검사 (파일을 안 주면 전부)
//        --also <다른 저장소의 _column/posts>  다른 사이트 글과도 겹침 비교 (여러 번 줄 수 있다)
//   node scripts/column.mjs build             column 페이지 · rss · sitemap 생성
//
// 글 원본: _column/posts/<date>-<slug>.json   형식은 _column/GUIDE.md

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CDIR = resolve(ROOT, '_column');
const PDIR = resolve(CDIR, 'posts');
const cfg = JSON.parse(readFileSync(resolve(CDIR, 'config.json'), 'utf8'));
const BASE = cfg.column.base;                       // 예: "/column/"
const OUT = resolve(ROOT, BASE.replace(/^\/|\/$/g, ''));
const DOMAIN = cfg.site.domain.replace(/\/$/, '');
const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// ───────────────────────── 공통 ─────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = s => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const ext = /^https?:/.test(u) && !u.startsWith(DOMAIN);
    return `<a href="${u}"${ext ? ' target="_blank" rel="noopener nofollow"' : ''}>${t}</a>`;
  });
const plain = s => String(s ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const url = slug => `${BASE}${slug}/`;
const abs = p => DOMAIN + encodeURI(p);

function loadPosts(dir = PDIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => {
    const p = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    p._file = f;
    return p;
  });
}
const published = posts => posts.filter(p => p.date <= todayKST())
  .sort((a, b) => (b.date + b._file).localeCompare(a.date + a._file));

function blockText(b) {
  if (b.p) return b.p;
  if (b.tip) return b.tip;
  if (b.warn) return b.warn;
  if (b.ul) return b.ul.join('\n');
  if (b.ol) return b.ol.join('\n');
  if (b.table) return [b.table.head, ...b.table.rows].map(r => r.join(' ')).join('\n');
  if (b.quote) return b.quote.text;
  if (b.img) return b.img.caption || '';
  return '';
}
const bodyText = p => plain([p.lead, ...(p.points || []),
  ...(p.sections || []).flatMap(s => [s.h2, ...s.blocks.map(blockText)]),
  ...(p.faq || []).flatMap(f => [f.q, f.a])].join('\n'));

// ───────────────────────── plan ─────────────────────────
function plan() {
  const P = cfg.plan;
  const posts = loadPosts();
  const ind = posts.filter(p => p.category === 'industry');
  const useT = {}, useC = {}, pair = new Set();
  for (const p of ind) {
    useT[p.topic] = (useT[p.topic] || 0) + 1;
    if (p.city) { useC[p.city] = (useC[p.city] || 0) + 1; pair.add(p.topic + '|' + p.city); }
  }
  const n = +(process.argv.find(a => a.startsWith('--n='))?.slice(4) || P.perDay || 2);
  const picks = [], usedT = new Set(), usedC = new Set();
  // 같은 주제 · 도시가 반복되지 않도록 가장 덜 쓴 것부터
  const topics = [...P.topics].sort((a, b) => (useT[a.id] || 0) - (useT[b.id] || 0));
  for (const t of topics) {
    if (picks.length >= n) break;
    if (usedT.has(t.id)) continue;
    let city = null;
    if (picks.length < (P.cityPosts ?? n) && t.city !== false) {
      city = [...P.cities].sort((a, b) => (useC[a] || 0) - (useC[b] || 0))
        .find(c => !usedC.has(c) && !pair.has(t.id + '|' + c)) || null;
    }
    usedT.add(t.id); if (city) usedC.add(city);
    picks.push({ topic: t.id, 주제: t.name, city, 키워드: (city ? t.keyword.replace('{city}', city) : t.keyword.replace('{city} ', '').replace('{city}', '')), 방향: t.angle || '' });
  }
  console.log(`# ${cfg.site.name} — ${todayKST()} 업계 글 ${n}개`);
  picks.forEach((p, i) => console.log(`${i + 1}. topic=${p.topic} · 도시=${p.city || '(없음)'} · 핵심 키워드="${p.키워드}"\n   주제: ${p.주제}${p.방향 ? `\n   방향: ${p.방향}` : ''}`));
  const life = posts.filter(p => p.category === 'life').slice(-10).map(p => `- ${p.date} ${p.title}`);
  console.log(`\n# 생활정보 1개 — 루틴이 그날 이슈를 고른다. 최근 생활정보 글(겹치지 않게):\n${life.join('\n') || '- (아직 없음)'}`);
}

// ───────────────────────── check ─────────────────────────
const COMMON_BANNED = [
  [/\d[\d,.]*\s*(만\s*)?원(?![가-힣])/, '가격 · 금액은 쓰지 않는다'],
  [/100\s*%|무조건|반드시\s*보장|보장합니다|보장해\s*드립니다/, '과장 · 보장 표현'],
  [/업계\s*(1위|최초|최고)|국내\s*(1위|최초)|최고의\s*업체/, '근거 없는 순위 · 최고 표현'],
  [/알아보겠습니다|알아볼까요/, '빈 도입 문장'],
];
const shingles = (t, k = 6) => { const s = new Set(); const x = t.replace(/\s+/g, ''); for (let i = 0; i + k <= x.length; i++) s.add(x.slice(i, i + k)); return s; };
function overlap(a, b) { let n = 0; for (const x of a) if (b.has(x)) n++; return a.size ? n / a.size : 0; }

function checkOne(p, file, others) {
  const E = [], W = [];
  const need = (c, m) => { if (!c) E.push(m); };
  const len = (s, lo, hi, name) => { const l = [...String(s || '')].length; if (l < lo || l > hi) E.push(`${name} 길이 ${l}자 (${lo}~${hi})`); };
  need(/^\d{4}-\d{2}-\d{2}$/.test(p.date || ''), 'date 형식 YYYY-MM-DD');
  need(/^[0-9a-z가-힣]+(-[0-9a-z가-힣]+)*$/.test(p.slug || '') && [...p.slug].length <= 70, 'slug: 한글 · 영소문자 · 숫자 · - , 70자 이하');
  need(file === `${p.date}-${p.slug}.json`, `파일 이름은 ${p.date}-${p.slug}.json 이어야 한다`);
  need(cfg.categories[p.category], `category 는 ${Object.keys(cfg.categories).join(' · ')} 중 하나`);
  if (p.category === 'industry') need(cfg.plan.topics.some(t => t.id === p.topic), 'industry 글의 topic 은 config.plan.topics 의 id');
  len(p.title, 15, 60, 'title'); len(p.description, 60, 170, 'description'); len(p.lead, 80, 450, 'lead');
  need(p.keyword?.main, 'keyword.main');
  need(Array.isArray(p.points) && p.points.length >= 3 && p.points.length <= 5, 'points 3~5개');
  need(Array.isArray(p.sections) && p.sections.length >= 4 && p.sections.length <= 8, 'sections 4~8개');
  need(Array.isArray(p.faq) && p.faq.length >= 2 && p.faq.length <= 6, 'faq 2~6개');
  const srcMin = p.category === 'life' ? 2 : 1;
  need(Array.isArray(p.sources) && p.sources.length >= srcMin && p.sources.every(s => s.name && /^https:\/\//.test(s.url)), `sources ${srcMin}개 이상, 주소는 https://`);
  for (const s of p.sections || []) {
    need(s.h2 && Array.isArray(s.blocks) && s.blocks.length, `소제목/블록 비어 있음: ${s.h2}`);
    for (const b of s.blocks || []) if (b.img) need(b.img.src?.startsWith('/') && existsSync(resolve(ROOT, b.img.src.slice(1))) && b.img.alt?.length >= 8, `사진 파일이 없거나 alt 8자 미만: ${b.img?.src}`);
    for (const b of s.blocks || []) need(['p', 'ul', 'ol', 'table', 'tip', 'warn', 'quote', 'img'].some(k => k in b), `모르는 블록: ${JSON.stringify(b).slice(0, 60)}`);
  }
  if (E.length) return { E, W };

  const body = bodyText(p);
  const all = body + '\n' + p.title + '\n' + p.description;
  const n = [...body.replace(/\s/g, '')].length;
  if (n < 1500) E.push(`본문 ${n}자 — 1500자 이상`);
  if (!(p.sections.some(s => s.blocks.some(b => b.table)))) E.push('표(table) 1개 이상');
  const kw = p.keyword.main;
  if (!p.title.includes(kw)) E.push(`제목에 핵심 키워드 "${kw}" 가 통째로 없다`);
  if (!p.lead.includes(kw)) E.push(`lead 에 핵심 키워드 "${kw}" 가 없다`);
  const cnt = body.split(kw).length - 1;
  if (cnt > 12) E.push(`핵심 키워드 ${cnt}번 — 12번 이하`);
  if (p.city) {
    if (!p.title.includes(p.city)) E.push(`city="${p.city}" 인데 제목에 없다`);
    if (!p.lead.includes(p.city)) E.push(`city="${p.city}" 인데 lead 에 없다`);
    const c = all.split(p.city).length - 1;
    if (c > 10) E.push(`도시 이름 ${c}번 — 10번 이하 (도시 이름 바꿔 끼우기 글로 보인다)`);
  }
  const raw = JSON.stringify([p.lead, p.sections, p.faq, p.cta]);
  if (!/\]\(\/[^)]*\)/.test(raw)) E.push('본문에 사이트 내부 링크 [글](/주소) 1개 이상');
  for (const [re, why] of [...COMMON_BANNED.filter(([re]) => !(cfg.allowPrice && re === COMMON_BANNED[0][0])),
    ...(cfg.banned || []).map(b => [new RegExp(b.re), b.why])]) {
    const m = all.match(re);
    if (m) E.push(`금지 표현 "${m[0]}" — ${why}`);
  }
  const me = shingles(body);
  for (const o of others) {
    const r = overlap(me, o.sh);
    if (r > 0.3) E.push(`${o.name} 와 본문 ${(r * 100).toFixed(0)}% 겹침 (30% 이하) — 목차부터 새로 짠다`);
    else if (r > 0.18) W.push(`${o.name} 와 ${(r * 100).toFixed(0)}% 겹침`);
  }
  if (p.date > todayKST()) W.push(`date ${p.date} 는 미래 — 그날까지 게시되지 않는다`);
  return { E, W };
}

function check() {
  const args = process.argv.slice(3);
  const also = []; const files = [];
  for (let i = 0; i < args.length; i++) { if (args[i] === '--also') also.push(args[++i]); else files.push(args[i]); }
  const posts = loadPosts();
  const targets = files.length ? files.map(f => basename(f)) : posts.map(p => p._file);
  const slugs = {};
  for (const p of posts) (slugs[p.slug] ||= []).push(p._file);
  let bad = 0;
  for (const f of targets) {
    const p = posts.find(x => x._file === f);
    if (!p) { console.log(`✗ ${f}: _column/posts/ 에 없다`); bad++; continue; }
    const others = posts.filter(x => x._file !== f).map(x => ({ name: x._file, sh: shingles(bodyText(x)) }));
    for (const d of also) for (const x of loadPosts(resolve(d))) others.push({ name: `${d}/${x._file}`, sh: shingles(bodyText(x)) });
    const { E, W } = checkOne(p, f, others);
    if (slugs[p.slug]?.length > 1) E.push(`slug 중복: ${slugs[p.slug].join(', ')}`);
    if (E.length) { bad++; console.log(`✗ ${f}`); E.forEach(e => console.log('   - ' + e)); }
    else console.log(`✓ ${f}`);
    W.forEach(w => console.log('   (주의) ' + w));
  }
  console.log(bad ? `\n${bad}개 실패` : `\n모두 통과 (${targets.length}개)`);
  process.exit(bad ? 1 : 0);
}

// ───────────────────────── build ─────────────────────────
const T = cfg.theme;
const CSS = `
:root{--bg:${T.bg};--sf:${T.surface};--ln:${T.line};--ink:${T.ink};--ink2:${T.ink2};--ac:${T.accent};--acink:${T.accentInk}}
*{margin:0;padding:0;box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--ink);font-family:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;line-height:1.8;letter-spacing:-.01em;word-break:keep-all;overflow-wrap:anywhere}
a{color:var(--ac)}
.wrap{max-width:760px;margin:0 auto;padding:0 18px}
header.top{border-bottom:1px solid var(--ln);position:sticky;top:0;background:var(--bg);z-index:5}
header.top .wrap{display:flex;align-items:center;gap:14px;height:56px}
header.top .brand{white-space:nowrap;flex-shrink:0;font-weight:800;color:var(--ink);text-decoration:none;font-size:1rem}
header.top nav{min-width:0;margin-left:auto;display:flex;gap:14px;font-size:.88rem;overflow-x:auto;white-space:nowrap}
header.top nav a{color:var(--ink2);text-decoration:none}
header.top nav a:hover{color:var(--ink)}
.crumb{font-size:.8rem;color:var(--ink2);margin:22px 0 10px}
.crumb a{color:var(--ink2);text-decoration:none}
.badge{display:inline-block;font-size:.75rem;font-weight:700;padding:3px 10px;border-radius:999px;background:var(--ac);color:var(--acink)}
.city{display:inline-block;font-size:.75rem;padding:2px 9px;border-radius:999px;border:1px solid var(--ln);color:var(--ink2);margin-left:6px}
h1{font-size:clamp(1.45rem,4.6vw,2rem);line-height:1.35;margin:12px 0 10px;letter-spacing:-.03em}
.meta{font-size:.82rem;color:var(--ink2);margin-bottom:22px}
.lead{font-size:1.06rem;margin-bottom:22px}
.points{background:var(--sf);border:1px solid var(--ln);border-left:4px solid var(--ac);border-radius:10px;padding:16px 18px 16px 20px;margin:0 0 26px}
.points b{display:block;font-size:.85rem;color:var(--ac);margin-bottom:6px}
.points ul{padding-left:18px}
.toc{border:1px solid var(--ln);border-radius:10px;padding:14px 18px;margin-bottom:30px;font-size:.92rem}
.toc b{font-size:.85rem;color:var(--ink2)}
.toc ol{padding-left:20px}
.toc a{color:var(--ink);text-decoration:none}
article h2{font-size:1.28rem;line-height:1.45;margin:38px 0 12px;padding-top:8px;letter-spacing:-.02em}
article p{margin:0 0 14px}
article ul,article ol{margin:0 0 16px;padding-left:22px}
article li{margin:4px 0}
.tbl{overflow-x:auto;margin:6px 0 18px;border:1px solid var(--ln);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:.9rem;min-width:480px}
th,td{padding:10px 12px;border-bottom:1px solid var(--ln);text-align:left;vertical-align:top}
th{background:var(--sf);font-weight:700;white-space:nowrap}
tr:last-child td{border-bottom:0}
.tip,.warn{border-radius:10px;padding:13px 16px;margin:6px 0 18px;font-size:.94rem;background:var(--sf);border:1px solid var(--ln)}
.tip::before{content:"현장 메모";display:block;font-weight:800;font-size:.8rem;color:var(--ac);margin-bottom:4px}
.warn{border-color:#E5484D}
.warn::before{content:"주의";display:block;font-weight:800;font-size:.8rem;color:#E5484D;margin-bottom:4px}
figure{margin:8px 0 22px}
figure img{display:block;max-width:100%;height:auto;border-radius:10px;border:1px solid var(--ln);margin:0 auto}
figcaption{font-size:.84rem;color:var(--ink2);margin-top:8px;text-align:center}
blockquote{border-left:3px solid var(--ln);padding:4px 0 4px 16px;color:var(--ink2);margin:0 0 16px}
blockquote cite{display:block;font-size:.8rem;margin-top:4px;font-style:normal}
.faq details{border:1px solid var(--ln);border-radius:10px;margin-bottom:10px;padding:12px 16px;background:var(--sf)}
.faq summary{font-weight:700;cursor:pointer}
.faq details p{margin:10px 0 0}
.src{font-size:.85rem;color:var(--ink2)}
.src ul{padding-left:20px}
.cta{margin:40px 0 10px;padding:22px 20px;border-radius:14px;background:var(--sf);border:1px solid var(--ln)}
.cta h3{font-size:1.1rem;margin-bottom:6px}
.cta p{color:var(--ink2);margin-bottom:14px;font-size:.95rem}
.btns{display:flex;flex-wrap:wrap;gap:8px}
.btn{display:inline-block;padding:11px 18px;border-radius:999px;font-weight:800;font-size:.9rem;text-decoration:none;border:1px solid var(--ln);color:var(--ink)}
.btn.p{background:var(--ac);color:var(--acink);border-color:var(--ac)}
.note{font-size:.82rem;color:var(--ink2);margin-top:26px;padding-top:14px;border-top:1px solid var(--ln)}
.rel h2{font-size:1.1rem;margin:44px 0 12px}
.cards{list-style:none;padding:0;display:grid;gap:12px}
.cards a{display:block;text-decoration:none;color:var(--ink);background:var(--sf);border:1px solid var(--ln);border-radius:12px;padding:16px 18px}
.cards a:hover{border-color:var(--ac)}
.cards h3{font-size:1.02rem;line-height:1.45;margin:8px 0 6px}
.cards p{font-size:.88rem;color:var(--ink2);line-height:1.65}
.cards .d{font-size:.78rem;color:var(--ink2);margin-left:6px}
.hero{padding:34px 0 18px}
.hero p{color:var(--ink2)}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 22px}
.chips button{font:inherit;font-size:.85rem;padding:7px 14px;border-radius:999px;border:1px solid var(--ln);background:transparent;color:var(--ink2);cursor:pointer}
.chips button[aria-pressed=true]{background:var(--ac);color:var(--acink);border-color:var(--ac);font-weight:700}
footer{border-top:1px solid var(--ln);margin-top:56px;padding:26px 0 40px;font-size:.82rem;color:var(--ink2)}
footer a{color:var(--ink2)}
`;

function head({ title, desc, path, type = 'website', extra = '', kw = '', image = cfg.site.ogImage }) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${kw ? `<meta name="keywords" content="${esc(kw)}">\n` : ''}<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${abs(path)}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(cfg.site.name)}">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${abs(path)}">
<meta property="og:image" content="${DOMAIN}${encodeURI(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="${T.bg}">
${cfg.site.favicon ? `<link rel="icon" href="${cfg.site.favicon}">\n` : ''}<link rel="alternate" type="application/rss+xml" title="${esc(cfg.column.title)}" href="${BASE}rss.xml">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>${CSS.replace(/\n/g, '')}</style>
${extra}</head>
<body>
<header class="top"><div class="wrap"><a class="brand" href="/">${esc(cfg.site.name)}</a><nav>${cfg.column.nav.map(n => `<a href="${n.href}">${esc(n.label)}</a>`).join('')}</nav></div></header>
`;
}
const foot = () => `<footer><div class="wrap">${cfg.site.footer}<br><a href="/">${esc(cfg.site.name)} 홈</a> · <a href="${BASE}">${esc(cfg.column.title)}</a> · <a href="${BASE}rss.xml">RSS</a></div></footer>
</body>
</html>
`;
const ld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>\n`;

function renderBlock(b) {
  if (b.p) return `<p>${inline(b.p)}</p>`;
  if (b.ul) return `<ul>${b.ul.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`;
  if (b.ol) return `<ol>${b.ol.map(x => `<li>${inline(x)}</li>`).join('')}</ol>`;
  if (b.tip) return `<div class="tip">${inline(b.tip)}</div>`;
  if (b.warn) return `<div class="warn">${inline(b.warn)}</div>`;
  if (b.quote) return `<blockquote>${inline(b.quote.text)}${b.quote.from ? `<cite>— ${inline(b.quote.from)}</cite>` : ''}</blockquote>`;
  if (b.img) return `<figure><img src="${b.img.src}" alt="${esc(b.img.alt)}" loading="lazy" decoding="async"${b.img.w ? ` width="${b.img.w}" height="${b.img.h}"` : ''}>${b.img.caption ? `<figcaption>${inline(b.img.caption)}</figcaption>` : ''}</figure>`;
  if (b.table) return `<div class="tbl"><table><thead><tr>${b.table.head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${b.table.rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return '';
}

function card(p) {
  return `<li data-c="${p.category}"><a href="${url(p.slug)}"><span class="badge">${esc(cfg.categories[p.category].name)}</span>${p.city ? `<span class="city">${esc(p.city)}</span>` : ''}<span class="d">${p.date}</span><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p></a></li>`;
}

function renderPost(p, all) {
  const path = url(p.slug);
  const cat = cfg.categories[p.category];
  const cta = p.cta || cfg.cta[p.category];
  const rel = [...all.filter(x => x !== p && x.category === p.category), ...all.filter(x => x !== p && x.category !== p.category)].slice(0, 4);
  const firstImg = p.sections.flatMap(s => s.blocks).find(b => b.img)?.img.src;
  const image = p.cover || firstImg || cfg.site.ogImage;
  const person = { '@type': 'Organization', name: cfg.site.publisher || cfg.site.name, url: DOMAIN + '/' };
  const extra = ld({
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.description,
    datePublished: p.date + 'T07:00:00+09:00', dateModified: (p.updated || p.date) + 'T07:00:00+09:00',
    author: person, publisher: { ...person, logo: { '@type': 'ImageObject', url: DOMAIN + cfg.site.ogImage } },
    image: DOMAIN + encodeURI(image), mainEntityOfPage: abs(path), inLanguage: 'ko-KR', articleSection: cat.name,
    keywords: [p.keyword.main, ...(p.keyword.sub || [])].join(', '),
    ...(p.city ? { contentLocation: { '@type': 'Place', name: p.city } } : {}),
  }) + ld({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: p.faq.map(f => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })),
  }) + ld({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: cfg.site.name, item: DOMAIN + '/' },
      { '@type': 'ListItem', position: 2, name: cfg.column.title, item: abs(BASE) },
      { '@type': 'ListItem', position: 3, name: p.title, item: abs(path) }],
  });
  return head({ title: `${p.title} | ${cfg.site.name}`, desc: p.description, path, type: 'article', extra, image, kw: [p.keyword.main, ...(p.keyword.sub || [])].join(', ') }) + `
<main class="wrap">
<div class="crumb"><a href="/">${esc(cfg.site.name)}</a> › <a href="${BASE}">${esc(cfg.column.title)}</a>${cat.name !== cfg.column.title ? ` › ${esc(cat.name)}` : ''}</div>
<article>
<span class="badge">${esc(cat.name)}</span>${p.city ? `<span class="city">${esc(p.city)}</span>` : ''}
<h1>${esc(p.title)}</h1>
<div class="meta"><time datetime="${p.date}">${p.date}</time>${p.updated ? ` · 고침 ${p.updated}` : ''} · ${esc(cfg.site.name)}</div>
<p class="lead">${inline(p.lead)}</p>
<div class="points"><b>핵심만 먼저</b><ul>${p.points.map(x => `<li>${inline(x)}</li>`).join('')}</ul></div>
<nav class="toc" aria-label="목차"><b>목차</b><ol>${p.sections.map((s, i) => `<li><a href="#s${i + 1}">${esc(s.h2.replace(/^\d+\.\s*/, ''))}</a></li>`).join('')}<li><a href="#faq">자주 묻는 질문</a></li></ol></nav>
${p.sections.map((s, i) => `<h2 id="s${i + 1}">${esc(s.h2)}</h2>\n${s.blocks.map(renderBlock).join('\n')}`).join('\n')}
<h2 id="faq">자주 묻는 질문</h2>
<div class="faq">${p.faq.map(f => `<details><summary>${inline(f.q)}</summary><p>${inline(f.a)}</p></details>`).join('')}</div>
<div class="src"><h2>참고한 자료</h2><ul>${p.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(s.name)}</a></li>`).join('')}</ul></div>
${cta ? `<div class="cta"><h3>${inline(cta.title)}</h3><p>${inline(cta.text)}</p><div class="btns">${cta.buttons.map((b, i) => `<a class="btn${i ? '' : ' p'}" href="${b.href}">${esc(b.label)}</a>`).join('')}</div></div>` : ''}
${cfg.requiredTail?.[p.category] || cfg.requiredTail?.all ? `<p class="note">${inline(cfg.requiredTail[p.category] || cfg.requiredTail.all)}</p>` : ''}
</article>
${rel.length ? `<section class="rel"><h2>함께 보면 좋은 글</h2><ul class="cards">${rel.map(card).join('')}</ul></section>` : ''}
</main>
` + foot();
}

function renderIndex(all) {
  const extra = ld({
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: cfg.column.title, description: cfg.column.description, url: abs(BASE),
    isPartOf: { '@type': 'WebSite', name: cfg.site.name, url: DOMAIN + '/' },
    hasPart: all.slice(0, 30).map(p => ({ '@type': 'BlogPosting', headline: p.title, url: abs(url(p.slug)), datePublished: p.date })),
  });
  const cats = Object.entries(cfg.categories).filter(([k]) => all.some(p => p.category === k));
  return head({ title: `${cfg.column.title} | ${cfg.site.name}`, desc: cfg.column.description, path: BASE, extra }) + `
<main class="wrap">
<section class="hero"><h1>${esc(cfg.column.title)}</h1><p>${esc(cfg.column.description)}</p></section>
${cats.length > 1 ? `<div class="chips" role="group" aria-label="분류"><button aria-pressed="true" data-f="">전체</button>${cats.map(([k, c]) => `<button aria-pressed="false" data-f="${k}">${esc(c.name)}</button>`).join('')}</div>` : ''}
<ul class="cards" id="list">${all.map(card).join('\n') || '<li>첫 글을 준비하고 있습니다.</li>'}</ul>
</main>
<script>document.querySelectorAll('.chips button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.chips button').forEach(x=>x.setAttribute('aria-pressed',x===b));document.querySelectorAll('#list li').forEach(li=>li.hidden=!!b.dataset.f&&li.dataset.c!==b.dataset.f)})</script>
` + foot();
}

function build() {
  const all = published(loadPosts());
  mkdirSync(OUT, { recursive: true });
  // 지난번에 만든 글 폴더 중 사라진 글은 지운다 (목록에 적힌 것만 — 다른 파일은 건드리지 않는다)
  const manifest = resolve(OUT, '.built.json');
  const prev = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : [];
  const now = all.map(p => p.slug);
  for (const s of prev) if (!now.includes(s)) rmSync(resolve(OUT, s), { recursive: true, force: true });
  for (const p of all) {
    mkdirSync(resolve(OUT, p.slug), { recursive: true });
    writeFileSync(resolve(OUT, p.slug, 'index.html'), renderPost(p, all));
  }
  writeFileSync(resolve(OUT, 'index.html'), renderIndex(all));
  writeFileSync(manifest, JSON.stringify(now, null, 1) + '\n');
  const lastmod = all[0]?.date || todayKST();
  writeFileSync(resolve(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${abs(BASE)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>
${all.map(p => `<url><loc>${abs(url(p.slug))}</loc><lastmod>${p.updated || p.date}</lastmod><priority>0.6</priority></url>`).join('\n')}
</urlset>
`);
  const rfc = d => new Date(d + 'T07:00:00+09:00').toUTCString();
  writeFileSync(resolve(OUT, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${esc(cfg.column.title)} | ${esc(cfg.site.name)}</title>
<link>${abs(BASE)}</link>
<description>${esc(cfg.column.description)}</description>
<language>ko</language>
${all.slice(0, 50).map(p => `<item><title>${esc(p.title)}</title><link>${abs(url(p.slug))}</link><guid>${abs(url(p.slug))}</guid><pubDate>${rfc(p.date)}</pubDate><category>${esc(cfg.categories[p.category].name)}</category><description>${esc(p.description)}</description></item>`).join('\n')}
</channel></rss>
`);
  // robots.txt 에 칼럼 사이트맵 줄이 없으면 한 번 붙인다
  const robots = resolve(ROOT, 'robots.txt');
  const line = `Sitemap: ${DOMAIN}${BASE}sitemap.xml`;
  if (existsSync(robots)) {
    const r = readFileSync(robots, 'utf8');
    if (!r.includes(line)) writeFileSync(robots, r.replace(/\s*$/, '\n') + line + '\n');
  }
  console.log(`${BASE} — 글 ${all.length}개 생성 (${todayKST()} 기준 게시분)`);
}

const cmd = process.argv[2];
if (cmd === 'plan') plan();
else if (cmd === 'check') check();
else if (cmd === 'build') build();
else { console.log('사용법: node scripts/column.mjs plan | check [파일…] [--also 경로] | build'); process.exit(1); }
