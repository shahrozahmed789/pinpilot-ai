import 'server-only';
import { deflateSync } from 'node:zlib';
import type { PinIdea } from './ideas';

// A tiny dependency-free raster renderer keeps free-tier/serverless deployments simple.
// It creates original 2:3 PNG graphics with a bitmap typeface and decorative shapes.
const FONT: Record<string, number[]> = {
  ' ': [0,0,0,0,0,0,0], A:[14,17,17,31,17,17,17], B:[30,17,17,30,17,17,30], C:[14,17,16,16,16,17,14], D:[30,17,17,17,17,17,30], E:[31,16,16,30,16,16,31], F:[31,16,16,30,16,16,16], G:[14,17,16,23,17,17,15], H:[17,17,17,31,17,17,17], I:[14,4,4,4,4,4,14], J:[7,2,2,2,18,18,12], K:[17,18,20,24,20,18,17], L:[16,16,16,16,16,16,31], M:[17,27,21,21,17,17,17], N:[17,25,21,19,17,17,17], O:[14,17,17,17,17,17,14], P:[30,17,17,30,16,16,16], Q:[14,17,17,17,21,18,13], R:[30,17,17,30,20,18,17], S:[15,16,16,14,1,1,30], T:[31,4,4,4,4,4,4], U:[17,17,17,17,17,17,14], V:[17,17,17,17,17,10,4], W:[17,17,17,21,21,21,10], X:[17,17,10,4,10,17,17], Y:[17,17,10,4,4,4,4], Z:[31,1,2,4,8,16,31],
  '0':[14,17,19,21,25,17,14], '1':[4,12,4,4,4,4,14], '2':[14,17,1,2,4,8,31], '3':[30,1,1,14,1,1,30], '4':[2,6,10,18,31,2,2], '5':[31,16,16,30,1,1,30], '6':[14,16,16,30,17,17,14], '7':[31,1,2,4,8,8,8], '8':[14,17,17,14,17,17,14], '9':[14,17,17,15,1,1,14],
  ':':[0,4,4,0,4,4,0], ',':[0,0,0,0,0,4,8], '.':[0,0,0,0,0,12,12], '-':[0,0,0,31,0,0,0], '&':[12,18,20,8,21,18,13], '/':[1,2,2,4,8,8,16], '+':[0,4,4,31,4,4,0], '!':[4,4,4,4,4,0,4], '?':[14,17,1,2,4,0,4], '\'':[4,4,2,0,0,0,0], '"':[10,10,5,0,0,0,0], '·':[0,0,0,4,0,0,0], '|':[4,4,4,4,4,4,4], '(': [2,4,8,8,8,4,2], ')':[8,4,2,2,2,4,8], '%':[17,2,4,8,16,17,0]
};
type RGB = [number, number, number];
const palettes: Array<{ bg: RGB; end: RGB; ink: RGB; accent: RGB; soft: RGB }> = [
  { bg: [255,247,247], end: [255,223,229], ink: [16,26,45], accent: [239,35,69], soft: [255,212,219] },
  { bg: [248,243,235], end: [232,218,201], ink: [37,53,45], accent: [198,21,57], soft: [230,217,200] },
  { bg: [255,253,251], end: [245,226,230], ink: [24,24,37], accent: [241,38,70], soft: [243,229,231] },
  { bg: [246,247,245], end: [220,232,223], ink: [17,37,29], accent: [231,25,60], soft: [220,232,223] },
  { bg: [255,245,240], end: [245,212,210], ink: [32,21,36], accent: [235,22,58], soft: [244,209,207] },
];
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
function crc32(buf: Buffer) { let crc = 0xffffffff; for (const byte of buf) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1); } return (crc ^ 0xffffffff) >>> 0; }
function pngChunk(type: string, data: Buffer) { const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length, 0); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0); return Buffer.concat([length, name, data, crc]); }
function encodePng(width: number, height: number, pixels: Uint8Array) {
  const stride = width * 3; const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) { const offset = y * (stride + 1); raw[offset] = 0; Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, offset + 1); }
  const header = Buffer.alloc(13); header.writeUInt32BE(width,0); header.writeUInt32BE(height,4); header[8]=8; header[9]=2; header[10]=0; header[11]=0; header[12]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(raw,{level:8})),pngChunk('IEND',Buffer.alloc(0))]);
}
export function renderPinPng(idea: PinIdea, niche: string): Buffer {
  const width = 1000, height = 1500;
  const pixels = new Uint8Array(width * height * 3);
  const p = palettes[(idea.style || 0) % palettes.length];
  for (let y=0; y<height; y++) {
    const t = y / (height - 1);
    const row: RGB = [clamp(p.bg[0] + (p.end[0]-p.bg[0])*t), clamp(p.bg[1] + (p.end[1]-p.bg[1])*t), clamp(p.bg[2] + (p.end[2]-p.bg[2])*t)];
    for (let x=0; x<width; x++) { const i=(y*width+x)*3; pixels[i]=row[0];pixels[i+1]=row[1];pixels[i+2]=row[2]; }
  }
  const rect = (x:number,y:number,w:number,h:number,c:RGB) => { const x1=Math.max(0,x),y1=Math.max(0,y),x2=Math.min(width,x+w),y2=Math.min(height,y+h); for(let yy=y1;yy<y2;yy++)for(let xx=x1;xx<x2;xx++){const i=(yy*width+xx)*3;pixels[i]=c[0];pixels[i+1]=c[1];pixels[i+2]=c[2];} };
  const circle = (cx:number,cy:number,r:number,c:RGB) => { const rr=r*r; for(let y=Math.max(0,cy-r);y<Math.min(height,cy+r);y++)for(let x=Math.max(0,cx-r);x<Math.min(width,cx+r);x++){const dx=x-cx,dy=y-cy;if(dx*dx+dy*dy<=rr){const i=(y*width+x)*3;pixels[i]=c[0];pixels[i+1]=c[1];pixels[i+2]=c[2];}} };
  const text=(value:string,x:number,y:number,scale:number,c:RGB,maxWidth=850) => { let cursor=x; const chars=Array.from(value.toUpperCase()); for(const raw of chars){const ch=raw.charCodeAt(0)<128?raw:' ';const rows=FONT[ch] || FONT[' ']; if(cursor+5*scale>x+maxWidth)break; for(let gy=0;gy<7;gy++){const bits=rows[gy]||0;for(let gx=0;gx<5;gx++){if(bits & (1 << (4-gx)))rect(cursor+gx*scale,y+gy*scale,scale,scale,c);}} cursor += 6*scale; } return cursor-x; };
  // The design has a branded border, a vivid accent shape and clear text hierarchy.
  const white:RGB=[255,255,255];
  rect(32,32,936,1436,p.soft); rect(44,44,912,1412,p.bg);
  circle(842,175,142,p.soft); circle(852,176,87,p.accent); circle(852,176,41,p.ink);
  rect(78,111,9,57,p.accent); text('PINPILOT AI',106,115,4,p.accent,700);
  text(niche.slice(0,28),78,195,3,p.ink,590); rect(78,252,152,9,p.accent);
  const title = idea.title.toUpperCase().replace(/[^A-Z0-9 :,&!?%./()+\-]/g, ' ');
  const words=title.split(/\s+/); const lines:string[]=[];let line='';
  for(const word of words){if((line+' '+word).trim().length>18&&line){lines.push(line);line=word;}else line=(line+' '+word).trim();}
  if(line)lines.push(line);if(lines.length>5){lines.length=5;lines[4]=lines[4].slice(0,15)+'...';}
  lines.forEach((l,i)=>text(l,78,355+i*84,8,p.ink,850));
  text('SAVE THIS FOR YOUR NEXT PROJECT',78,868,4,p.accent,840);
  rect(78,968,844,336,p.ink); rect(110,1010,120,8,p.accent);
  text('A LITTLE INSPIRATION',110,1060,5,white,770); text('IDEAS  TIPS  DETAILS  GUIDES',110,1140,3,white,770);
  rect(110,1205,230,7,p.accent); text('ORIGINAL TEMPLATE DESIGN',78,1372,3,p.ink,820);
  return encodePng(width,height,pixels);
}
