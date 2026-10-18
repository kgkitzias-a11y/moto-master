// One durable preparation run. No inferred probability, invented questions, or history migration.
import { mulberry32, shuffleArray, shuffleOptions, uuid } from './shuffle.js';
export const MEGA_PASSES = 4;
export const REVIEW_GAP = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizePlans(plans) {
  if (!Array.isArray(plans)) return [];
  return plans.filter(p => p && p.v === 1 && UUID.test(p.id) && Number.isFinite(p.t)
    && p.t >= Date.UTC(2020,0,1) && p.t <= Date.now() + 86400000
    && Number.isInteger(p.seed) && p.seed >= 0 && p.seed <= 0xffffffff
    && Array.isArray(p.queue) && p.queue.length >= 500 && p.queue.length <= 2000
    && p.queue.every(q => Number.isInteger(q) && q >= 0))
    .map(p => ({v:1,id:p.id.toLowerCase(),t:p.t,seed:p.seed,queue:[...p.queue]}));
}
export function mergePlans(a, b) {
  const map = new Map();
  // Plans are immutable. Deterministic tie-break also converges after malformed duplicate ids.
  for (const p of sanitizePlans([...a, ...b])) {
    const old = map.get(p.id);
    if (!old || JSON.stringify(p) < JSON.stringify(old)) map.set(p.id,p);
  }
  return [...map.values()].sort((a,b)=>a.t-b.t || a.id.localeCompare(b.id));
}
export function activePlan(plans, resetAt = null) {
  return plans.filter(p => resetAt === null || p.t > resetAt).at(-1) || null;
}
export function createMegaPlan(questions, state, {id=uuid(), t=Date.now(), seed=Math.floor(Math.random()*4294967296)}={}) {
  const bank = questions.filter(q=>q.tier==='booklet');
  const rnd = mulberry32(seed), queue=[];
  const priority = q => {
    const s = state.q[q.id];
    if (!s?.seen) return 100;
    return (s.lastOk === false ? 80 : 0) + (s.bin ? 30 : 0) + 40*s.wrong/s.seen
      + Math.min(10,s.wrong) + ((q.twins||[]).length ? 3 : 0);
  };
  const passes = Math.max(MEGA_PASSES, Math.ceil(500/Math.max(1,bank.length)));
  for (let pass=0;pass<passes;pass++) {
    let ordered=shuffleArray(bank,rnd);
    if (pass===0 || pass===2) ordered.sort((a,b)=>priority(b)-priority(a));
    else {
      // Interleave the official groups; every pass still includes every question exactly once.
      const groups=new Map();
      for(const q of ordered) { const g=q.group||0; if(!groups.has(g))groups.set(g,[]); groups.get(g).push(q); }
      ordered=[];
      while([...groups.values()].some(g=>g.length)) for(const group of shuffleArray([...groups.values()],rnd)) if(group.length)ordered.push(group.pop());
    }
    queue.push(...ordered.map(q=>q.id));
  }
  if(!bank.length) throw new Error('Δεν βρέθηκαν ερωτήσεις βιβλίου.');
  return {v:1,id,t,seed,queue};
}

// Replay answer slots, not a mutable cursor. A committed answer is its own checkpoint.
// Duplicate simultaneous device answers occupy one slot; all raw history remains intact.
export function megaState(plan, events, questions) {
  const bank = new Map(questions.filter(q=>q.tier==='booklet').map(q=>[q.id,q]));
  if (!plan || plan.queue.some(id=>!bank.has(id))) return null;
  const size=bank.size;
  const queue=plan.queue.map((qid,i)=>({qid,pass:Math.floor(i/size),review:false}));
  const slots=new Map();
  for(const e of [...events].sort((a,b)=>a.t-b.t||a.id.localeCompare(b.id))) {
    if(e.k!=='answer'||e.m!=='mega'||!e.s?.startsWith(plan.id+':')||e.t<plan.t)continue;
    const text=e.s.slice(plan.id.length+1); if(!/^\d{1,6}$/.test(text))continue;
    const i=Number(text); if(!slots.has(i))slots.set(i,[]); slots.get(i).push(e);
  }
  const answers=[],pending=new Map(),seen=new Set(),lastAttempt=new Map();
  let coreDone=0,correct=0,coreCorrect=0;
  for(let i=0;i<queue.length;i++) {
    const item=queue[i],q=bank.get(item.qid);
    const e=slots.get(i)?.find(e=>e.q===q.id && Number.isInteger(e.ch) && e.ch>=0 && e.ch<q.options.length && e.ok===(e.ch===q.correct));
    if(!e)break;
    answers.push(e);seen.add(q.id);
    if(e.ok)correct++;
    if(!item.review){coreDone++;if(e.ok)coreCorrect++;}
    if(!e.ok)pending.set(q.id,0);
    else if(pending.has(q.id) && i-(lastAttempt.get(q.id)??-Infinity)>REVIEW_GAP) { const n=pending.get(q.id)+1; if(n>=2)pending.delete(q.id);else pending.set(q.id,n); }
    lastAttempt.set(q.id,i);
    if(pending.has(q.id)) {
      // Retest after eight intervening questions where possible. At the end, fill the gap
      // with other verified questions, so a correction never counts as immediate recall.
      while(queue.length<i+REVIEW_GAP+1) {
        const candidates=[...bank.keys()].filter(id=>id!==q.id);
        if(!candidates.length)break;
        queue.push({qid:candidates[(queue.length+plan.seed)%candidates.length],pass:item.pass,review:true});
      }
      queue.splice(Math.min(i+REVIEW_GAP+1,queue.length),0,{qid:q.id,pass:item.pass,review:true});
    }
  }
  return {plan,queue,answers,index:answers.length,coreDone,coreCorrect,correct,
    pending:[...pending.keys()],seen:seen.size,done:answers.length===queue.length,
    current:queue[answers.length]||null,total:queue.length};
}
export function megaQuestion(plan,item,index,questions) {
  const q=questions.find(q=>q.id===item.qid);
  const exam=!!q.exam && (item.pass%2===1 || item.review);
  const view=exam?q.exam:q;
  return {q,text:view.text||q.text,options:view.options,exam,
    order:shuffleOptions(view.options,mulberry32((plan.seed ^ Math.imul(index+1,2654435761))>>>0))};
}
