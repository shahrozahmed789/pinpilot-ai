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
