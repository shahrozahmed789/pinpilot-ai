import { getPinterestToken } from './server';
export async function pinterest(path: string, init: RequestInit = {}) {
  const token = await getPinterestToken();
  const response = await fetch(`https://api.pinterest.com/v5${path}`, { ...init, signal: init.signal || AbortSignal.timeout(6_000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) }, cache: 'no-store' });
  const text = await response.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) throw new Error(`Pinterest API ${response.status}: ${data.message || data.message_detail || 'Request failed'}`);
  return data;
}
