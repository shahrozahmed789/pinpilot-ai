import { NextRequest, NextResponse } from 'next/server';
import { encryptToken, supabase } from '@/lib/server';
export const runtime = 'nodejs';
export async function GET(req:NextRequest){
 const code=req.nextUrl.searchParams.get('code');const state=req.nextUrl.searchParams.get('state');const expected=req.cookies.get('pinterest_oauth_state')?.value;
 if(!code||!state||!expected||state!==expected)return NextResponse.json({error:'OAuth state mismatch or missing authorization code. Please reconnect.'},{status:400});
 const id=process.env.PINTEREST_CLIENT_ID,secret=process.env.PINTEREST_CLIENT_SECRET,redirect=process.env.PINTEREST_REDIRECT_URI;
 if(!id||!secret||!redirect)return NextResponse.json({error:'Pinterest OAuth environment variables are incomplete.'},{status:500});
 const basic=Buffer.from(`${id}:${secret}`).toString('base64');const tokenRes=await fetch('https://api.pinterest.com/v5/oauth/token',{method:'POST',headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirect})});const token=await tokenRes.json();
 if(!tokenRes.ok)return NextResponse.json({error:`Pinterest token exchange failed (${tokenRes.status}). Check app approval and redirect URI.`},{status:tokenRes.status});
 try{const db=supabase();const {error}=await db.from('account_tokens').upsert({id:'primary',encrypted_access_token:encryptToken(token.access_token),encrypted_refresh_token:token.refresh_token?encryptToken(token.refresh_token):null,expires_at:new Date(Date.now()+Number(token.expires_in||2592000)*1000).toISOString(),updated_at:new Date().toISOString()});if(error)throw error;}catch(e){return NextResponse.json({error:`Token received but secure storage failed: ${e instanceof Error?e.message:'unknown error'}`},{status:500});}
 const res=NextResponse.redirect(new URL('/',req.url));res.cookies.delete('pinterest_oauth_state');return res;
}
