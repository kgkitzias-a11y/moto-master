import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMegaPlan,megaState,megaQuestion,sanitizePlans,mergePlans,activePlan} from '../../src/engine/mega.js';
import {reduce} from '../../src/engine/reducer.js';
import {sanitizeEvent} from '../../src/engine/events.js';
import {uuid} from '../../src/engine/shuffle.js';
const qs=JSON.parse(fs.readFileSync(new URL('../../data/questions.json',import.meta.url))).questions;
const start=Date.now()-60000;
const plan=()=>createMegaPlan(qs,reduce([],qs),{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',seed:42,t:start});
function answer(p,s,right=true) {const q=qs.find(q=>q.id===s.current.qid);return {id:uuid(),t:start+s.index+1,k:'answer',m:'mega',s:`${p.id}:${s.index}`,q:q.id,ch:right?q.correct:(q.correct+1)%q.options.length,ok:right,ms:2000,cf:null,sh:true,tl:null,hd:false,rc:false};}
test('560 core answers cover all 140 verified ids four times, not archive; deterministic and historical weaknesses first',()=>{
 const p=plan();assert.equal(p.queue.length,560);assert.equal(new Set(p.queue).size,140);
 for(let i=0;i<4;i++)assert.equal(new Set(p.queue.slice(i*140,(i+1)*140)).size,140);
 assert.deepEqual(p,plan());assert.equal(sanitizePlans([p]).length,1);
 const st=reduce([],qs);for(const q of qs)st.q[q.id]={seen:10,wrong:0,lastOk:true};st.q[1].lastOk=false;
 assert.equal(createMegaPlan(qs,st,{seed:1}).queue[0],1);
});
test('complete all 560 via real compatible answer events, with exact resume at each step',()=>{
 const p=plan(),events=[];let s=megaState(p,events,qs);
 for(let i=0;i<560;i++){assert.equal(s.index,i);assert.equal(s.done,false);const e=answer(p,s);assert.deepEqual(sanitizeEvent(e),e);events.push(e);s=megaState(p,events,qs);}
 assert.equal(s.done,true);assert.equal(s.coreDone,560);assert.equal(s.correct,560);assert.equal(s.seen,140);assert.deepEqual(s.pending,[]);
 assert.equal(reduce(events,qs).counts.answers,560);
});
test('wrong answers return after eight others and require two spaced correct answers',()=>{
 const p=plan(),ev=[];let s=megaState(p,ev,qs);const missed=s.current.qid;
 ev.push(answer(p,s,false));s=megaState(p,ev,qs);assert.equal(s.queue[9].qid,missed);assert.equal(s.total,561);
 for(let i=1;i<=9;i++){ev.push(answer(p,s));s=megaState(p,ev,qs);}
 assert.deepEqual(s.pending,[missed]);assert.equal(s.queue[18].qid,missed);
 while(s.index<=18){ev.push(answer(p,s));s=megaState(p,ev,qs);}
 assert.deepEqual(s.pending,[]);assert.equal(s.done,false);
});
test('a miss on the final core question extends the same run, including spacing and correction',()=>{
 const p=plan(),ev=[];let s=megaState(p,ev,qs);
 while(s.index<560){ev.push(answer(p,s,s.index!==559));s=megaState(p,ev,qs);}
 assert.equal(s.coreDone,560);assert.equal(s.done,false);assert.ok(s.total>=569);
 while(!s.done&&s.index<650){ev.push(answer(p,s));s=megaState(p,ev,qs);}
 assert.equal(s.done,true);assert.ok(s.index>560);assert.deepEqual(s.pending,[]);
});
test('duplicate/concurrent slots do not double advance; gaps and mismatching questions cannot skip work',()=>{
 const p=plan(),s=megaState(p,[],qs),a=answer(p,s),b={...a,id:uuid(),t:a.t+1};
 assert.equal(megaState(p,[b,a],qs).index,1);
 assert.equal(megaState(p,[{...a,s:p.id+':1'}],qs).index,0);
 assert.equal(megaState(p,[{...a,q:99999}],qs).index,0);
});
test('per-slot wording and shuffled option order survive JSON roundtrip; original answer indices preserved',()=>{
 const p=plan();for(let i=0;i<p.queue.length;i++){const item={qid:p.queue[i],pass:Math.floor(i/140),review:false};const v=megaQuestion(p,item,i,qs);assert.deepEqual(v,megaQuestion(JSON.parse(JSON.stringify(p)),item,i,qs));assert.equal(new Set(v.order).size,v.q.options.length);assert.equal(v.options.length,v.q.options.length);}
});
test('immutable plan merge converges and respects reset without changing old events or state',()=>{
 const a=plan(),b={...a,id:uuid(),t:start+1};assert.deepEqual(mergePlans([a],[b]),mergePlans([b],[a]));assert.equal(activePlan(mergePlans([a],[b])).id,b.id);assert.equal(activePlan([a],a.t),null);
 assert.deepEqual(sanitizePlans([{...a,queue:[1]}]),[]);
 const old=[answer(a,megaState(a,[],qs))];old[0].m='practice';const before=reduce(old,qs);createMegaPlan(qs,before);megaState(a,old,qs);assert.deepEqual(reduce(old,qs),before);
});
