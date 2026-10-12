import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function encryptionKey() {
  const value = process.env.TOKEN_ENCRYPTION_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(value)) throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes).');
  return Buffer.from(value, 'hex');
}
export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}
export function decryptToken(value: string) {
  const [ivHex, tagHex, encryptedHex] = value.split(':');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
}
export async function getPinterestToken() {
  const db = supabase();
  const { data, error } = await db.from('account_tokens').select('encrypted_access_token, encrypted_refresh_token, expires_at').eq('id', 'primary').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Pinterest is not connected yet. Use Connect Pinterest first.');
  let access = decryptToken(data.encrypted_access_token);
  if (new Date(data.expires_at).getTime() < Date.now() + 5 * 60_000) {
    if (!data.encrypted_refresh_token) throw new Error('Token expired. Reconnect Pinterest.');
    const basic = Buffer.from(`${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`).toString('base64');
    const response = await fetch('https://api.pinterest.com/v5/oauth/token', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decryptToken(data.encrypted_refresh_token) }) });
    const fresh = await response.json();
    if (!response.ok) throw new Error(`Pinterest token refresh failed (${response.status}). Reconnect Pinterest if needed.`);
    access = fresh.access_token;
    const { error: updateError } = await db.from('account_tokens').update({ encrypted_access_token: encryptToken(fresh.access_token), encrypted_refresh_token: fresh.refresh_token ? encryptToken(fresh.refresh_token) : data.encrypted_refresh_token, expires_at: new Date(Date.now() + Number(fresh.expires_in || 2592000) * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('id', 'primary');
    if (updateError) throw updateError;
  }
  return access;
}
