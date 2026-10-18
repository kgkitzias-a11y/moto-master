import { h, fmtDate } from './dom.js';
export function levelDots(level) {return h('span',{class:'level',title:`επίπεδο ${level}/5`},[0,1,2,3,4].map(i=>h('i',{class:i<level?'on':''})));}
export function renderStats(ctx) {
  const st=ctx.progress.state,qs=ctx.questions.filter(q=>q.tier==='booklet');
  const seen=qs.filter(q=>st.q[q.id]?.seen).length;
  const total=qs.reduce((a,q)=>a+(st.q[q.id]?.seen||0),0),correct=qs.reduce((a,q)=>a+(st.q[q.id]?.correct||0),0),m=ctx.progress.mega();
  return h('div',null,h('h1',null,'Η πρόοδός σου'),
    h('section',{class:'card'},h('h2',null,'Όλο το ιστορικό διατηρείται'),h('p',{id:'history-coverage'},`${seen}/${qs.length} ερωτήσεις που είδες`),
      h('p',{id:'history-accuracy'},`${correct}/${total} σωστές απαντήσεις${total?` · ${Math.round(100*correct/total)}%`:''}`),h('p',{class:'small muted'},'Μετρημένα αποτελέσματα εξάσκησης. Οι επαναλήψεις περιλαμβάνονται· δεν είναι πρόβλεψη επιτυχίας.')),
    m?h('section',{class:'card'},h('h2',null,'Το Mega τεστ σου'),h('p',null,`${m.coreDone}/${m.plan.queue.length} βασικές απαντήσεις · ${m.correct}/${m.index} σωστές συνολικά · ${m.pending.length} εκκρεμή λάθη`),h('a',{href:'#/mega',class:'btn'},'Άνοιξε το αποθηκευμένο τεστ')):null,
    h('h2',null,'Ανά ομάδα εξετάσεων'),h('div',{class:'card tight'},h('table',{id:'group-table'},h('thead',null,h('tr',null,h('th',null,'Ομάδα'),h('th',null,'Κάλυψη'),h('th',null,'Σωστές / απαντήσεις'))),
      h('tbody',null,[1,2,3,4,5,6,7,8,9,10].map(g=>{const group=qs.filter(q=>q.group===g);return h('tr',null,h('td',null,g),h('td',null,`${group.filter(q=>st.q[q.id]?.seen).length}/${group.length}`),h('td',null,`${group.reduce((a,q)=>a+(st.q[q.id]?.correct||0),0)} / ${group.reduce((a,q)=>a+(st.q[q.id]?.seen||0),0)}`));})))),
    h('h2',null,'Προηγούμενα ολοκληρωμένα τεστ'),h('p',{class:'small muted'},'Αρχείο αποτελεσμάτων. Τα προηγούμενα είδη τεστ έχουν αποσυρθεί.'),
    h('div',{class:'card tight'},h('table',null,h('thead',null,h('tr',null,h('th',null,'Πότε'),h('th',null,'Σωστές / σύνολο'))),h('tbody',null,[...st.sessions].reverse().slice(0,30).map(s=>h('tr',null,h('td',null,fmtDate(s.t)),h('td',null,`${s.correct}/${s.total}`)))))));
}
