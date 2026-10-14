'use client';
import { useEffect, useMemo, useState } from 'react';

type Idea = { title: string; description: string; keywords: string[]; visualBrief: string; style?: number };
type PinRow = { id: string; title: string; description: string; keywords: string[]; boardName: string; destination: string; scheduledAt: string; createdAt: string; status: string; imageData?: string; imageUrl?: string; pinterestPinId?: string; bufferPostId?: string };
type Activity = { id: string; time: string; label: string; detail: string; tone?: 'success' | 'warning' | 'neutral' };
const STORAGE = 'pinpilot-workspace-v2';
const starterIdeas = (niche: string, audience: string, count: number): Idea[] => {
  const clean = niche.trim() || 'creative ideas';
  const lower = clean.toLowerCase();
  const variants = [
    { title: `${clean}: The Complete Inspiration Guide`, description: `Explore ${lower} with a curated visual guide, practical details, and fresh inspiration for your next project. Save this idea for later.`, keys: [clean, `${clean} ideas`, `${clean} inspiration`], style: 0 },
    { title: `7 ${clean} Ideas Worth Saving`, description: `Need a fresh starting point? Discover seven thoughtful ${lower} ideas and bookmark the ones that fit your style and plans.`, keys: [clean, `best ${clean}`, `${clean} trends`], style: 1 },
    { title: `How to Choose ${clean} That Fit Your Style`, description: `Use this simple visual checklist to compare details, find the right fit, and make a confident choice for your next project.`, keys: [`how to choose ${clean}`, clean, `${clean} checklist`], style: 2 },
    { title: `${clean}: Details That Make a Difference`, description: `Small details can make a big impact. Use these ${lower} tips to plan a cohesive look and create a result that feels personal.`, keys: [`${clean} tips`, clean, `${clean} details`], style: 3 },
    { title: `${clean} Ideas for Your Next Project`, description: `Save this collection of ${lower} inspiration and revisit it when you are ready to plan your next step.`, keys: [`${clean} inspiration`, clean, `${clean} guide`], style: 4 },
  ];
  return Array.from({ length: Math.max(1, Math.min(count, 5)) }, (_, i) => {
    const v = variants[i % variants.length];
    return { title: v.title, description: `${v.description} Designed for ${audience || 'your target audience'}.`, keywords: v.keys, visualBrief: `Original vertical 2:3 graphic. Feature the headline “${v.title}”, clear typography, strong contrast, useful visual hierarchy, and no copied competitor artwork.`, style: v.style };
  });
};
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
function previewSvg(idea: Idea, niche: string) {
  const palettes = [
    { bg: '#fff7f7', ink: '#101a2d', accent: '#ef2345', accent2: '#ffd4db' },
    { bg: '#f8f3eb', ink: '#25352d', accent: '#c61539', accent2: '#e6d9c8' },
    { bg: '#fffdfb', ink: '#181825', accent: '#f12646', accent2: '#f3e5e7' },
    { bg: '#f6f7f5', ink: '#11251d', accent: '#e7193c', accent2: '#dce8df' },
    { bg: '#fff5f0', ink: '#201524', accent: '#eb163a', accent2: '#f4d1cf' },
  ];
  const p = palettes[(idea.style ?? 0) % palettes.length];
  const words = idea.title.split(/\s+/); const lines: string[] = []; let line = '';
  for (const word of words) { if ((line + ' ' + word).trim().length > 18 && line) { lines.push(line); line = word; } else line = (line + ' ' + word).trim(); }
  if (line) lines.push(line);
  const visible = lines.slice(0, 5);
  const titleText = visible.map((s, i) => `<text x="78" y="${500 + i * 72}" fill="${p.ink}" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="800">${esc(s)}</text>`).join('');
  const nicheLabel = esc(niche.slice(0, 50).toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${p.bg}"/><stop offset="1" stop-color="${p.accent2}"/></linearGradient><linearGradient id="hot" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff3654"/><stop offset="1" stop-color="#b9002d"/></linearGradient></defs><rect width="1000" height="1500" rx="44" fill="url(#bg)"/><circle cx="840" cy="176" r="150" fill="${p.accent2}"/><circle cx="850" cy="170" r="86" fill="url(#hot)"/><path d="M700 210 L825 90 L902 200 L790 295Z" fill="${p.ink}" opacity=".08"/><rect x="62" y="62" width="876" height="1376" rx="34" fill="none" stroke="${p.ink}" stroke-opacity=".13" stroke-width="3"/><text x="78" y="145" fill="${p.accent}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" letter-spacing="3">PINPILOT AI</text><text x="78" y="198" fill="${p.ink}" opacity=".68" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="600">${nicheLabel}</text><rect x="78" y="265" width="152" height="8" rx="4" fill="url(#hot)"/>${titleText}<text x="78" y="970" fill="${p.ink}" opacity=".76" font-family="Arial, Helvetica, sans-serif" font-size="28">SAVE THIS FOR YOUR NEXT PROJECT</text><rect x="78" y="1045" width="844" height="250" rx="28" fill="${p.ink}"/><text x="120" y="1120" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700">A LITTLE INSPIRATION</text><text x="120" y="1182" fill="#ffffff" opacity=".78" font-family="Arial, Helvetica, sans-serif" font-size="21">Ideas • Tips • Details • Guides</text><rect x="120" y="1220" width="190" height="5" rx="3" fill="url(#hot)"/><text x="78" y="1376" fill="${p.ink}" opacity=".65" font-family="Arial, Helvetica, sans-serif" font-size="18" letter-spacing="2">ORIGINAL TEMPLATE DESIGN</text></svg>`;
}
function dataSvg(svg: string) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }
function makeActivity(label: string, detail: string, tone: Activity['tone'] = 'neutral'): Activity { return { id: `${Date.now()}-${Math.random()}`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), label, detail, tone }; }
export default function Home() {
  const [demoMode, setDemoMode] = useState(true);
  const [niche, setNiche] = useState('');
  const [audience, setAudience] = useState('United States');
  const [destination, setDestination] = useState('');
  const [cadence, setCadence] = useState('2');
  const [timezone, setTimezone] = useState('America/Los_Angeles');
  const [pins, setPins] = useState<PinRow[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Ready. Add a niche and destination URL, then start automation.');
  const [adminConfigured, setAdminConfigured] = useState(false);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [accountConnected, setAccountConnected] = useState(false);
  const [liveBoardName, setLiveBoardName] = useState('');
  const [liveAnalytics, setLiveAnalytics] = useState<Record<string, string | number | null>>({});
  const [range, setRange] = useState('30');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        const s = JSON.parse(saved);
        if (typeof s.niche === 'string') setNiche(s.niche);
        if (typeof s.audience === 'string') setAudience(s.audience);
        if (typeof s.destination === 'string') setDestination(s.destination);
        if (typeof s.cadence === 'string') setCadence(s.cadence);
        if (typeof s.timezone === 'string') setTimezone(s.timezone);
        if (Array.isArray(s.pins)) setPins(s.pins);
        if (Array.isArray(s.activities)) setActivities(s.activities.slice(0, 14));
        if (typeof s.active === 'boolean') setActive(s.active);
      }
    } catch { /* start with clean defaults */ }
    fetch('/api/auth/status').then(r => r.json()).then(d => { setAdminConfigured(!!d.configured); setAdminAuthenticated(!!d.authenticated); }).catch(() => {});
    fetch('/api/buffer/status').then(r => r.json()).then(d => { if (d.connected) { setAccountConnected(true); setLiveBoardName(d.boardName || ''); setDemoMode(false); setActive(false); setPins(prev => prev.filter(pin => !pin.id.startsWith('demo-'))); } }).catch(() => {});
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify({ niche, audience, destination, cadence, timezone, pins, activities: activities.slice(0, 14), active })); } catch { /* local-only demo can exceed browser quota */ }
  }, [niche, audience, destination, cadence, timezone, pins, activities, active]);
  async function api(path: string, method = 'GET', body?: unknown) {
    const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  }
  async function signIn() {
    setBusy(true);
    try { await api('/api/auth/login', 'POST', { password: adminPassword }); setAdminAuthenticated(true); setLoginOpen(false); setAdminPassword(''); setStatus('Live controls unlocked for this browser session.'); setActivities(a => [makeActivity('Dashboard unlocked', 'Private live controls are available.', 'success'), ...a].slice(0, 14)); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Login failed'); }
    finally { setBusy(false); }
  }
  function startDemo() {
    if (!niche.trim()) { setStatus('Enter your niche first.'); return; }
    if (!destination.trim() || !/^https?:\/\//i.test(destination.trim())) { setStatus('Enter your website, shop or product page URL so every Pin has a destination.'); return; }
    setBusy(true); setStatus('Agent is preparing your daily Pin batch…');
    window.setTimeout(() => {
      const count = Number(cadence);
      const ideas = starterIdeas(niche, audience, count);
      const now = Date.now();
      const created: PinRow[] = ideas.map((idea, i) => ({ id: `demo-${now}-${i}`, title: idea.title, description: idea.description, keywords: idea.keywords, boardName: 'Demo board · not connected', destination: destination.trim(), scheduledAt: new Date(now + (i + 1) * Math.max(45, Math.floor(720 / (count + 1))) * 60_000).toISOString(), createdAt: new Date(now).toISOString(), status: 'DEMO QUEUED', imageData: dataSvg(previewSvg(idea, niche)) }));
      setPins(prev => [...created, ...prev].slice(0, 100));
      setActive(true);
      setActivities(prev => [makeActivity('Batch generated', `${created.length} original template-based Pin designs and SEO drafts created.`, 'success'), makeActivity('Queue filled automatically', `${created.length} demo Pins scheduled locally. They have not been published to Pinterest.`, 'warning'), ...prev].slice(0, 14));
      setStatus(`Demo batch ready: ${created.length} Pin drafts, design previews, SEO copy, and scheduled queue records generated automatically. No Pinterest publishing occurred.`);
      setBusy(false);
    }, 350);
  }
  async function startLive() {
    if (!niche.trim()) { setStatus('Enter your niche first.'); return; }
    if (!destination.trim() || !/^https?:\/\//i.test(destination.trim())) { setStatus('Enter your site/shop destination URL first.'); return; }
    if (!adminConfigured) { setStatus('Live automation is locked until DASHBOARD_PASSWORD and DASHBOARD_SESSION_SECRET are set on Netlify. Demo mode remains available.'); return; }
    if (!adminAuthenticated) { setLoginOpen(true); setStatus('Unlock your private dashboard before changing live automation settings.'); return; }
    setBusy(true); setStatus('Saving settings and checking the Buffer connection in safe test mode…');
    try {
      const d = await api('/api/automation/start', 'POST', { niche, audience, destinationUrl: destination.trim(), dailyPinLimit: Number(cadence), timezone });
      setActive(true); setAccountConnected(true); setLiveBoardName(d.boardName || 'Default board selected');
      setActivities(prev => [makeActivity('Automation started', d.message || 'Settings saved; the background worker will process the pipeline.', 'success'), ...prev].slice(0, 14)); setStatus(d.message || 'Automation enabled. Background jobs will run on the server schedule.');
      await refreshLive();
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to start live automation'); }
    finally { setBusy(false); }
  }
  async function pauseLive() {
    if (demoMode) { setActive(false); setActivities(a => [makeActivity('Demo automation paused', 'No additional demo batches will be generated until Start is pressed again.'), ...a].slice(0, 14)); setStatus('Demo automation paused.'); return; }
    if (!adminAuthenticated) { setLoginOpen(true); return; }
    setBusy(true); try { const d = await api('/api/automation/stop', 'POST', {}); setActive(false); setStatus(d.message || 'Automation paused. Existing queued Pins remain scheduled.'); setActivities(a => [makeActivity('Automation paused', 'Background worker will stop creating/publishing new Pins.', 'warning'), ...a].slice(0, 14)); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to pause'); } finally { setBusy(false); }
  }
  async function refreshLive() {
    if (!adminAuthenticated) { setLoginOpen(true); return; }
    setBusy(true);
    try {
      const [buffer, q] = await Promise.all([api('/api/buffer/status'), api('/api/automation/status')]);
      // Buffer's API currently exposes only limited/experimental post metrics, so do not
      // display invented analytics. Full Pinterest reporting can be enabled after approval.
      setLiveAnalytics({});
      const queueRows = Array.isArray(q.items) ? q.items.map((p: any) => ({ id: String(p.id), title: p.title || 'Untitled Pin', description: p.description || '', keywords: Array.isArray(p.source_keywords) ? p.source_keywords : [], boardName: p.board_name || p.board_id || 'Pinterest board', destination: p.destination_url || '', scheduledAt: p.scheduled_at || p.created_at || '', createdAt: p.created_at || '', status: String(p.status || 'queued').toUpperCase().replace(/_/g, ' '), imageUrl: p.image_url, pinterestPinId: p.pinterest_pin_id, bufferPostId: p.buffer_post_id })) : [];
      setPins(queueRows.slice(0, 100));
      setActive(!!q.enabled);
      setStatus(`${buffer.message} Queue refreshed. Full Pinterest analytics remain deferred until official Pinterest API access is enabled.`);
      setAccountConnected(!!buffer.connected);
      setLiveBoardName(q.settings?.board_name || buffer.boardName || liveBoardName);
      setActivities(a => [makeActivity('Buffer status refreshed', 'Checked the Buffer Pinterest channel and refreshed the Pin queue. Analytics remain unreported until a supported source is enabled.', 'success'), ...a].slice(0, 14));
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Buffer connection or queue refresh failed'); }
    finally { setBusy(false); }
  }
  async function connectBuffer() {
    if (demoMode) { setDemoMode(false); setStatus('Live mode selected. Checking the server-side Buffer connection; safe test mode will not schedule posts.'); }
    if (!adminConfigured) { setStatus('Before live connection, set DASHBOARD_PASSWORD and DASHBOARD_SESSION_SECRET in Netlify to protect your private account.'); return; }
    if (!adminAuthenticated) { setLoginOpen(true); return; }
    setBusy(true);
    try {
      const result = await api('/api/buffer/status');
      setAccountConnected(!!result.connected);
      setLiveBoardName(result.boardName || '');
      setStatus(result.message || 'Buffer connection checked.');
      setActivities(a => [makeActivity('Buffer connection checked', result.message || 'Connected to Buffer.', 'success'), ...a].slice(0, 14));
    } catch (e) {
      setAccountConnected(false);
      setStatus(e instanceof Error ? e.message : 'Unable to connect to Buffer');
    } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!demoMode && accountConnected && adminAuthenticated) void refreshLive();
  // Refresh on the transition into a connected live session, not on every queue render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, accountConnected, adminAuthenticated]);
  const queued = pins.filter(p => ['queued', 'publishing', 'buffer scheduled', 'buffer draft'].some(term => p.status.toLowerCase().includes(term))).length;
  const published = pins.filter(p => p.status === 'PUBLISHED' || p.status === 'published').length;
  const fmt = (v: unknown) => typeof v === 'number' ? v.toLocaleString() : v === null || v === undefined ? '—' : String(v);
  const nextPin = useMemo(() => pins.filter(p => ['queued', 'buffer scheduled', 'buffer draft'].some(term => p.status.toLowerCase().includes(term))).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0], [pins]);
  return <main className="appShell">
    <header className="topbar">
      <a className="brandLockup" href="/" aria-label="PinPilot AI Home"><img src="/logo-full.png" alt="PinPilot AI" className="brandFull"/><span><small>YOUR AUTONOMOUS PIN WORKFLOW</small></span></a>
      <div className="topActions"><span className={`statusPill ${accountConnected ? 'connected' : 'waiting'}`}><i/>{accountConnected ? 'Buffer connected' : 'Buffer connection pending'}</span><a className="iconLink" href="/privacy">Privacy</a></div>
    </header>
    <section className="heroPanel">
      <div className="heroContent"><div className="eyebrow"><span className="pulseDot"/> PINPILOT AI · PERSONAL AUTOMATION</div><h1>One niche. One click.<br/><em>Your Pins keep moving.</em></h1><p>Research opportunities, create original Pin graphics and SEO copy, schedule a daily batch, then measure results—all from one private workspace.</p>
        <div className="heroCtas"><button className="primaryButton startButton" onClick={demoMode ? startDemo : startLive} disabled={busy || active}>{busy ? <><span className="spinner"/> Working…</> : <><span className="playIcon">▶</span> Start Automation</>}</button><button className="heroGhost" onClick={active ? pauseLive : connectBuffer} disabled={busy}>{active ? 'Ⅱ Pause automation' : accountConnected ? 'Refresh account' : 'Connect Buffer'}</button></div>
        <div className="heroFoot"><span><i className="tinyCheck">✓</i> One-time niche setup</span><span><i className="tinyCheck">✓</i> Batch generation</span><span><i className="tinyCheck">✓</i> Background-ready workflow</span></div>
      </div>
      <div className="heroLogo"><div className="logoOrbit orbitOne"/><div className="logoOrbit orbitTwo"/><img src="/logo-mark.png" alt="PinPilot AI logo mark"/><div className="logoTag">AUTOPILOT <b>●</b></div></div>
    </section>
    <div className={`notice ${demoMode ? 'demoNotice' : accountConnected ? 'successNotice' : 'pendingNotice'}`}><span className="noticeIcon">{demoMode ? '✦' : accountConnected ? '✓' : '!'}</span><div><strong>{demoMode ? 'DEMO MODE · safe to test' : accountConnected ? 'LIVE ACCOUNT CONNECTED' : 'LIVE MODE · setup still required'}</strong><p>{demoMode ? 'Start Automation generates a full sample batch, makes original template-style graphics, writes SEO copy and fills the local queue automatically. It does not post to Pinterest or fabricate analytics.' : accountConnected ? 'Live mode uses the Buffer API as a temporary publishing connector. Test mode verifies the channel but does not submit posts.' : 'Set BUFFER_API_KEY and protect the dashboard login before checking Buffer. Test mode is safe and does not schedule posts.'}</p></div><button className="modeButton" onClick={() => { if (demoMode) { setDemoMode(false); setStatus('Live mode selected. Buffer connection and server configuration are required; safe test mode will not publish.'); } else { setDemoMode(true); setStatus('Demo mode enabled. Demo batches stay in this browser only.'); } }}>{demoMode ? 'Switch to live' : 'Switch to demo'}</button></div>
    <section className="setupGrid">
      <div className="panel setupPanel"><div className="panelHead"><div><span className="stepNo">01</span><div><h2>Tell your agent what to grow</h2><p>This setup is saved in your browser in demo mode, and to the database in live mode.</p></div></div><span className="smallBadge">ONE-TIME SETUP</span></div>
        <label>Niche / topic<input value={niche} onChange={e => setNiche(e.target.value)} placeholder="e.g. sage old money wedding templates"/></label>
        <div className="twoFields"><label>Target audience<input value={audience} onChange={e => setAudience(e.target.value)} placeholder="United States"/></label><label>Daily Pin target<select value={cadence} onChange={e => setCadence(e.target.value)}><option value="1">1 Pin / day</option><option value="2">2 Pins / day</option><option value="3">3 Pins / day</option><option value="5">5 Pins / day</option></select></label></div>
        <label>Where should Pins send people?<input value={destination} onChange={e => setDestination(e.target.value)} placeholder="https://your-shop.com/product"/><small>Use your website, Etsy listing, shop or product page.</small></label>
        <label>Account timezone<select value={timezone} onChange={e => setTimezone(e.target.value)}><option value="America/Los_Angeles">Pacific Time (US)</option><option value="America/New_York">Eastern Time (US)</option><option value="America/Chicago">Central Time (US)</option><option value="Asia/Karachi">Pakistan Time</option><option value="UTC">UTC</option></select></label>
      </div>
      <div className="panel accountPanel"><div className="panelHead"><div><span className="stepNo">02</span><div><h2>Connect Buffer for Pinterest</h2><p>PinPilot checks your Buffer account from the server. No Buffer password is entered here.</p></div></div><span className={`connectionIcon ${accountConnected ? 'on' : ''}`}>{accountConnected ? '✓' : '↗'}</span></div>
        <div className="connectionCard"><div className="pinterestGlyph">P</div><div className="connectionCopy"><strong>{accountConnected ? 'Buffer Pinterest channel connected' : 'Buffer is not connected yet'}</strong><span>{accountConnected ? `Default board: ${liveBoardName || 'will be selected automatically'}` : 'Server-side Buffer API key required; connect your Pinterest channel inside Buffer first.'}</span></div><span className={`miniState ${accountConnected ? 'on' : ''}`}>{accountConnected ? 'CONNECTED' : 'PENDING'}</span></div>
        <button className="outlineButton fullButton" onClick={connectBuffer} disabled={busy}>{accountConnected ? 'Refresh Buffer connection' : 'Check Buffer connection securely'} <span>↗</span></button>
        <div className="safetyNote"><span>♧</span><p>Your Buffer API key stays server-side and is never returned to this browser.</p></div>
        {adminConfigured && !adminAuthenticated && <button className="textButton" onClick={() => setLoginOpen(v => !v)}>Unlock private live controls</button>}
        {!adminConfigured && <p className="inlineWarn">Live mode remains locked until dashboard-password protection is configured in Netlify.</p>}
      </div>
    </section>
    <section className="metricGrid"><div className="metricCard"><span className="metricIcon red">▣</span><span className="metricLabel">Pins in queue</span><strong>{queued}</strong><small>{demoMode ? 'Local demo queue' : 'Stored scheduled posts'}</small></div><div className="metricCard"><span className="metricIcon blue">↗</span><span className="metricLabel">Total Pins</span><strong>{demoMode ? '—' : fmt(liveAnalytics.total_pins)}</strong><small>{demoMode ? 'No real account data in demo' : 'Not available from the temporary Buffer connector'}</small></div><div className="metricCard"><span className="metricIcon purple">◉</span><span className="metricLabel">Impressions</span><strong>{demoMode ? '—' : fmt(liveAnalytics.impressions)}</strong><small>{demoMode ? 'Real API data only' : 'Not connected in Buffer test mode'}</small></div><div className="metricCard"><span className="metricIcon orange">↗</span><span className="metricLabel">Outbound clicks</span><strong>{demoMode ? '—' : fmt(liveAnalytics.outbound_clicks)}</strong><small>{demoMode ? 'Not fabricated in demo' : 'Not connected in Buffer test mode'}</small></div></section>
    <section className="mainGrid">
      <div className="panel workflowPanel"><div className="panelHead"><div><span className="stepNo">03</span><div><h2>Agent workflow</h2><p>The stages the background agent works through.</p></div></div><span className={`runState ${active ? 'running' : ''}`}><i/>{active ? 'ACTIVE' : 'STANDBY'}</span></div>
        <div className="workflowSteps"><div className="workflowStep"><span className="workflowIcon">⌕</span><div><strong>Trend & keyword research</strong><p>Use approved trend endpoints and available source data; report access limits honestly.</p></div><span className="stageTag">{demoMode ? 'SIMULATED' : 'API ACCESS'}</span></div><div className="workflowStep"><span className="workflowIcon">◎</span><div><strong>Competitor opportunity scan</strong><p>Analyze public data only when supported; never invent competitor views or sales.</p></div><span className="stageTag mutedTag">DEPENDENT</span></div><div className="workflowStep"><span className="workflowIcon">✦</span><div><strong>Original creative + SEO copy</strong><p>Render vertical Pin graphics, titles, descriptions and keyword metadata.</p></div><span className="stageTag goodTag">{demoMode ? 'READY IN DEMO' : 'WORKER'}</span></div><div className="workflowStep"><span className="workflowIcon">▦</span><div><strong>Schedule & publish</strong><p>Queue due Pins in Buffer. Safe test mode checks the connection before any post is sent.</p></div><span className="stageTag">{demoMode ? 'LOCAL QUEUE' : 'BUFFER API'}</span></div><div className="workflowStep"><span className="workflowIcon">⌁</span><div><strong>Performance learning loop</strong><p>Fetch actual impressions, saves and clicks, then prioritize future content.</p></div><span className="stageTag mutedTag">{demoMode ? 'NO SAMPLE METRICS' : 'ANALYTICS API'}</span></div></div>
      </div>
      <div className="panel performancePanel"><div className="panelHead"><div><span className="stepNo">04</span><div><h2>Account insights</h2><p>Only show real metrics. Buffer reporting is limited; full Pinterest analytics will follow API approval.</p></div></div><select className="rangeSelect" value={range} onChange={e => setRange(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></div><div className="analyticsBlank"><div className="chartIcon"><span/><span/><span/><span/><span/></div><strong>{demoMode ? 'Waiting for real analytics' : 'Analytics reporting is not enabled yet'}</strong><p>{demoMode ? 'Demo numbers are intentionally not fabricated.' : 'Buffer is being used temporarily for publishing. Its current API metrics are limited; full account analytics will be enabled separately.'}</p><button className="outlineButton" onClick={refreshLive} disabled={busy || demoMode}>{busy ? 'Refreshing…' : 'Refresh Buffer & queue'}</button></div><div className="analyticsMini"><div><span>Saves</span><strong>{demoMode ? '—' : fmt(liveAnalytics.saves)}</strong></div><div><span>Outbound CTR</span><strong>{demoMode ? '—' : fmt(liveAnalytics.outbound_ctr)}</strong></div><div><span>Last sync</span><strong>{demoMode ? '—' : (typeof liveAnalytics.last_synced === 'string' ? new Date(liveAnalytics.last_synced).toLocaleString() : '—')}</strong></div></div></div>
    </section>
    <section className="panel queuePanel"><div className="panelHead"><div><span className="stepNo">05</span><div><h2>Automated Pin queue</h2><p>Start Automation creates and schedules the full batch. No one-by-one queue clicks.</p></div></div><span className="smallBadge">{pins.length} RECORDS</span></div>
      {pins.length === 0 ? <div className="emptyState"><div className="emptyIcon">✦</div><strong>Your queue is ready for its first batch</strong><p>Enter your niche, set a destination, and press Start Automation above.</p></div> : <div className="pinGrid">{pins.slice(0, 8).map(pin => <article className="pinCard" key={pin.id}><div className="pinPreview">{pin.imageData ? <img src={pin.imageData} alt={`Preview for ${pin.title}`}/> : pin.imageUrl ? <img src={pin.imageUrl} alt={`Pin: ${pin.title}`}/> : <div className="noPreview">Image preview<br/>not available</div>}<span className="pinStatus">{pin.status}</span></div><div className="pinContent"><strong>{pin.title}</strong><p>{pin.description}</p><div className="pinKeywords">{pin.keywords.slice(0, 3).map(k => <span key={k}>{k}</span>)}</div><div className="pinMeta"><span>◷ {new Date(pin.scheduledAt || pin.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><a href={pin.destination} target="_blank" rel="noreferrer">Destination ↗</a></div></div></article>)}</div>}
      {nextPin && <div className="queueFooter"><span>Next scheduled: <b>{nextPin.title}</b></span><span>{new Date(nextPin.scheduledAt).toLocaleString()}</span></div>}
    </section>
    <section className="panel activityPanel"><div className="panelHead"><div><span className="stepNo">06</span><div><h2>Agent activity</h2><p>What the tool has actually done.</p></div></div><span className="smallBadge">LIVE LOG</span></div>{activities.length === 0 ? <div className="emptyLog">No automation activity yet. Start a demo batch to see the activity feed.</div> : <div className="activityList">{activities.map(a => <div className="activityRow" key={a.id}><span className={`activityDot ${a.tone || 'neutral'}`}/><div><strong>{a.label}</strong><p>{a.detail}</p></div><time>{a.time}</time></div>)}</div>}<div className="statusBar" role="status"><span className="statusLineDot"/>{status}</div></section>
    <footer className="footer"><img src="/logo-mark.png" alt=""/><span>PinPilot AI · Your Pinterest workflow on autopilot.</span><a href="/privacy">Privacy Policy</a><span className="footerNote">Live publishing is enabled only after required provider access and security setup.</span></footer>
    {loginOpen && <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="loginTitle"><div className="loginModal"><button className="closeModal" onClick={() => setLoginOpen(false)} aria-label="Close">×</button><img src="/logo-mark.png" alt=""/><h2 id="loginTitle">Unlock your workspace</h2><p>Enter your private dashboard password. This is separate from your Buffer password.</p><form onSubmit={e => { e.preventDefault(); void signIn(); }}><label>Dashboard password<input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} autoComplete="current-password"/></label><button className="primaryButton fullButton" disabled={busy || !adminPassword}>Unlock live controls</button></form><small>Configure DASHBOARD_PASSWORD and DASHBOARD_SESSION_SECRET in your Netlify environment variables first.</small></div></div>}
  </main>;
}
