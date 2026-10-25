/** Clamp each UF residual separately; a global clamp gives incorrect scenario bounds. */
export function scenarioLimits(projection,swingPp){
  if(!projection?.available||!(projection.validVotes>0)||!Number.isFinite(projection.lulaPercent))return {low:null,high:null};
  const clamp=x=>Math.max(0,Math.min(100,x));
  let lowDelta=0,highDelta=0;
  for(const state of projection.states||[]){
    const {remainingValidVotes:n,lulaPercent:share}=state;
    if(!Number.isFinite(n)||!Number.isFinite(share))return {low:null,high:null};
    lowDelta+=n*(clamp(share-swingPp)-share)/100;
    highDelta+=n*(clamp(share+swingPp)-share)/100;
  }
  return {low:clamp(projection.lulaPercent+lowDelta/projection.validVotes*100),high:clamp(projection.lulaPercent+highDelta/projection.validVotes*100)};
}
/** Descriptive distance, not an election forecast; match by progress, never clock time. */
export function curveSimilarity(current,historical){
  if(!current?.length||!historical?.length)return null;
  const recent=current.filter(p=>Number.isFinite(p.lula)&&p.progress>=historical[0].progress&&p.progress<=historical.at(-1).progress).slice(-20);
  const distinct=[...new Map(recent.map(p=>[p.progress,p])).values()];
  if(distinct.length<5)return null;
  const differences=distinct.map(point=>{const old=historical.reduce((a,b)=>Math.abs(b.progress-point.progress)<Math.abs(a.progress-point.progress)?b:a);return point.lula-old.lula;});
  const rmse=Math.sqrt(differences.reduce((sum,x)=>sum+x*x,0)/differences.length);
  return {rmse,points:distinct.length,label:rmse<=0.5?'Trajetória semelhante':rmse<=2?'Trajetória com diferença moderada':'Trajetória distante de 2022'};
}
/** The national gap and residual UF forecast may be combined only on the same candidate counts. */
export function nationalAndStatesMatch(snapshot){
  if(!snapshot?.national||snapshot.states?.length!==27||!snapshot.overseas)return false;
  const all=[...snapshot.states,snapshot.overseas];
  return ['validVotes','lulaVotes','bolsonaroVotes'].every(field=>Number.isSafeInteger(snapshot.national[field])&&all.every(s=>Number.isSafeInteger(s[field]))&&all.reduce((n,s)=>n+s[field],0)===snapshot.national[field]);
}
