import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server';
export const runtime = 'nodejs';
export async function GET() {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.TOKEN_ENCRYPTION_KEY) return NextResponse.json({ connected: false, message: 'Pinterest connection is not configured yet.' });
    const { data, error } = await supabase().from('account_tokens').select('id,expires_at').eq('id', 'primary').maybeSingle();
    if (error) throw error;
    return NextResponse.json({ connected: Boolean(data), expiresAt: data?.expires_at || null });
  } catch { return NextResponse.json({ connected: false, message: 'Pinterest connection status is not available until Supabase and token encryption are configured.' }); }
}
