import { NextResponse } from 'next/server';
import { pinterest } from '@/lib/pinterest';
export const runtime='nodejs';
export async function GET(){try{const data=await pinterest('/boards?page_size=100');return NextResponse.json({items:(data.items||[]).map((b:any)=>({id:b.id,name:b.name,description:b.description||''})),message:'Pinterest boards loaded.'});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to load boards'},{status:500});}}
