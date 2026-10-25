"use client";
import {memo,useMemo,useState} from "react";
import type {CurvePoint} from "../lib/ui-types";
const pct=(v:number)=>v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%";
export const Curve=memo(function Curve({historical,current,label,axis,benchmark}:{historical:CurvePoint[];current:CurvePoint[];label:string;axis:string;benchmark?:{lula:number;bolsonaro:number;label:string}|null}) {
  const [hover,setHover]=useState<number|null>(null);
  const W=960,H=310,L=48,R=28,T=22,B=38;
  const all=useMemo(()=>[...historical,...current,...(benchmark?[{at:"",progress:100,lula:benchmark.lula,bolsonaro:benchmark.bolsonaro}]:[])].filter(p=>Number.isFinite(p.lula)),[historical,current,benchmark]);
  const lo=Math.max(0,Math.floor(Math.min(40,...all.map(p=>Math.min(p.lula,p.bolsonaro)))/5)*5);
  const hi=Math.min(100,Math.ceil(Math.max(60,...all.map(p=>Math.max(p.lula,p.bolsonaro)))/5)*5);
  const x=(v:number)=>L+v/100*(W-L-R),y=(v:number)=>T+(hi-v)/(hi-lo)*(H-T-B);
  const path=(data:CurvePoint[],key:"lula"|"bolsonaro")=>{let parts:string[]=[];const step=Math.max(1,Math.floor(data.length/700));for(let i=0;i<data.length;i++){const p=data[i],previous=data[i-1];const gap=!!p.recordedAt&&!!previous?.recordedAt&&Date.parse(p.recordedAt)-Date.parse(previous.recordedAt)>180000;if(i===0||i===data.length-1||i%step===0||gap)parts.push(`${!i||gap?"M":"L"}${x(p.progress).toFixed(2)},${y(p[key]).toFixed(2)}`);}return parts.join(" ");};
  const nearest=(data:CurvePoint[])=>hover===null?null:data.reduce<CurvePoint|null>((a,b)=>!a||Math.abs(b.progress-hover)<Math.abs(a.progress-hover)?b:a,null);
  const hp=nearest(historical),candidatePoint=nearest(current),cp=candidatePoint&&hover!=null&&Math.abs(candidatePoint.progress-hover)<=2?candidatePoint:null,last=current.at(-1);
  return <div className="curve-wrap">
    <svg className="curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Curvas e referências de votação de ${label}, por ${axis}`} onMouseMove={e=>{const b=e.currentTarget.getBoundingClientRect();setHover(Math.max(0,Math.min(100,((e.clientX-b.left)/b.width*W-L)/(W-L-R)*100)));}} onMouseLeave={()=>setHover(null)}>
      {[0,1,2,3,4].map(i=>{const v=lo+(hi-lo)*i/4;return <g key={i}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} stroke={v===50?"#465165":"#202938"} strokeDasharray={v===50?"4 5":undefined}/><text x={L-11} y={y(v)+4} textAnchor="end">{v.toFixed(0)}%</text></g>;})}
      {[0,20,40,60,80,100].map(v=><g key={v}><line x1={x(v)} x2={x(v)} y1={T} y2={H-B} stroke="#18212d"/><text x={x(v)} y={H-12} textAnchor="middle">{v}%</text></g>)}
      <path d={path(historical,"lula")} fill="none" stroke="var(--lula)" strokeOpacity=".5" strokeWidth="2" strokeDasharray="5 5"/>
      <path d={path(historical,"bolsonaro")} fill="none" stroke="var(--bolsonaro)" strokeOpacity=".5" strokeWidth="2" strokeDasharray="5 5"/>
      {benchmark&&<g><line x1={L} x2={W-R} y1={y(benchmark.lula)} y2={y(benchmark.lula)} stroke="var(--lula)" strokeWidth="1.7" strokeOpacity=".85" strokeDasharray="2 7"/><line x1={L} x2={W-R} y1={y(benchmark.bolsonaro)} y2={y(benchmark.bolsonaro)} stroke="var(--bolsonaro)" strokeWidth="1.7" strokeOpacity=".85" strokeDasharray="2 7"/></g>}
      <path d={path(current,"lula")} fill="none" stroke="var(--lula)" strokeWidth="3.5"/>
      <path d={path(current,"bolsonaro")} fill="none" stroke="var(--bolsonaro)" strokeWidth="3.5"/>
      {current.map((p,i)=><g key={i}><circle cx={x(p.progress)} cy={y(p.lula)} r="1.7" fill="var(--lula)"/><circle cx={x(p.progress)} cy={y(p.bolsonaro)} r="1.7" fill="var(--bolsonaro)"/></g>)}
      {last&&<g><circle cx={x(last.progress)} cy={y(last.lula)} r="4" fill="var(--lula)"/><circle cx={x(last.progress)} cy={y(last.bolsonaro)} r="4" fill="var(--bolsonaro)"/></g>}
      {hover!==null&&<line x1={x(hover)} x2={x(hover)} y1={T} y2={H-B} stroke="#bcc5d4" strokeDasharray="3 3"/>}
    </svg>
    <div className="curve-axis">{axis} →</div>
    {hover!==null&&(hp||cp)&&<div className="chart-tooltip"><b>{hover.toFixed(1)}% de avanço · ponto observado mais próximo</b>{cp&&<span>Hoje ({pct(cp.progress)}): <em className="color-lula">Lula {pct(cp.lula)}</em> · <em className="color-bolsonaro">Flávio {pct(cp.bolsonaro)}</em></span>}{hp&&<span>2022 ({pct(hp.progress)}): <em className="color-lula">Lula {pct(hp.lula)}</em> · <em className="color-bolsonaro">Jair {pct(hp.bolsonaro)}</em></span>}</div>}
    {!current.length&&<div className="chart-wait"><span className="pulse-dot"/>A curva de 2026 aparece com os primeiros votos válidos.</div>}
    {!historical.length&&!benchmark&&<div className="chart-note">Série histórica indisponível para este recorte. Nenhum ponto foi inventado.</div>}
    <div className="chart-legend"><span><i className="legend-line"/>Hoje · 2º turno</span>{historical.length>0&&<span><i className="legend-line dashed"/>2022 · curva observada</span>}{benchmark&&<span><i className="legend-line dotted"/>{benchmark.label}</span>}<span className="color-lula">● Lula</span><span className="color-bolsonaro">● Bolsonaro</span></div>
  </div>;
});
