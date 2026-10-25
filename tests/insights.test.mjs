import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarioLimits,curveSimilarity } from '../lib/insights.mjs';
test('scenario clamps residual share in each UF, including 0 and 100',()=>{
  const p={available:true,validVotes:1000,lulaPercent:100,states:[{remainingValidVotes:900,lulaPercent:100}]};
  assert.deepEqual(scenarioLimits(p,3),{low:97.3,high:100});
  assert.deepEqual(scenarioLimits({...p,lulaPercent:0,states:[{remainingValidVotes:900,lulaPercent:0}]},3),{low:0,high:2.7});
  assert.deepEqual(scenarioLimits({...p,lulaPercent:50,states:[{remainingValidVotes:450,lulaPercent:0},{remainingValidVotes:450,lulaPercent:100}]},3),{low:48.65,high:51.35});
});
test('no scenario without a usable projection; final votes have no residual uncertainty',()=>{
  assert.deepEqual(scenarioLimits(null,3),{low:null,high:null});
  assert.deepEqual(scenarioLimits({available:false},3),{low:null,high:null});
  assert.deepEqual(scenarioLimits({available:true,validVotes:1000,lulaPercent:52,states:[{remainingValidVotes:0,lulaPercent:52}]},10),{low:52,high:52});
});
test('similarity requires five distinct progress values and compares matching advances',()=>{
  const old=Array.from({length:10},(_,i)=>({progress:i+1,lula:45+i/10}));
  assert.equal(curveSimilarity(old.slice(0,4),old),null);
  assert.equal(curveSimilarity(Array(10).fill(old[0]),old),null);
  assert.equal(curveSimilarity(old,old).rmse,0);
  assert.equal(curveSimilarity(old.map(x=>({...x,lula:x.lula+3})),old).label,'Trajetória distante de 2022');
});

test('turnaround cannot combine equal national totals with divergent candidate counts',async()=>{
  const {nationalAndStatesMatch}=await import('../lib/insights.mjs');
  const state={validVotes:100,lulaVotes:60,bolsonaroVotes:40};
  const states=Array.from({length:27},()=>({...state}));
  const snapshot={national:{validVotes:2800,lulaVotes:1680,bolsonaroVotes:1120},states,overseas:{...state}};
  assert.equal(nationalAndStatesMatch(snapshot),true);
  assert.equal(nationalAndStatesMatch({...snapshot,national:{validVotes:2800,lulaVotes:1681,bolsonaroVotes:1119}}),false);
  assert.equal(nationalAndStatesMatch({...snapshot,states:states.slice(1)}),false);
  assert.equal(nationalAndStatesMatch({...snapshot,overseas:null}),false);
});
