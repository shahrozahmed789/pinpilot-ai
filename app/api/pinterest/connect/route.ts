import { NextRequest, NextResponse } from 'next/server';
import { isAdminConfigured, isAdminRequest } from '@/lib/admin';
import { randomBytes } from 'node:crypto';
export const runtime = 'nodejs';
export async function GET(req: NextRequest){
 if (!isAdminConfigured()) return NextResponse.json({error:'Configure dashboard password protection before connecting a real Pinterest account.'},{status:503});
 if (!isAdminRequest(req)) return NextResponse.json({error:'Unlock the private dashboard first.'},{status:401});
 const id=process.env.PINTEREST_CLIENT_ID; const redirect=process.env.PINTEREST_REDIRECT_URI;
 if(!id||!redirect)return NextResponse.json({error:'Set PINTEREST_CLIENT_ID and PINTEREST_REDIRECT_URI first.'},{status:500});
 const state=randomBytes(24).toString('hex');
 const scopes=['boards:read','pins:read','pins:write','user_accounts:read'].join(',');
 const url=new URL('https://www.pinterest.com/oauth/');url.searchParams.set('client_id',id);url.searchParams.set('redirect_uri',redirect);url.searchParams.set('response_type','code');url.searchParams.set('scope',scopes);url.searchParams.set('state',state);
 const res=NextResponse.redirect(url);res.cookies.set('pinterest_oauth_state',state,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:600});return res;
}
