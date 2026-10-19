import { h, LETTERS } from './dom.js';
import { megaQuestion } from '../engine/mega.js';
import { uuid } from '../engine/shuffle.js';
import { megaReview, setMegaReview, clearMegaReview } from '../store/mega.js';
import { renderPassEstimate } from './pass-estimate.js';
const pct=(n,d)=>d?`${Math.round(100*n/d)}%`:'—';
const stat=(value,label)=>h('div',{class:'mega-stat'},h('b',null,value),h('span',null,label));
function progress(m,base=560) {
  const n=m?.coreDone||0,total=m?.plan.queue.length||base;
  return h('div',{class:'mega-progress'},h('div',{class:'row between'},h('strong',{id:'mega-count'},`${n} / ${total}`),h('span',{class:'small muted'},'βασικές απαντήσεις')),
    h('progress',{max:total,value:n,'aria-label':'Ολοκλήρωση βασικού τεστ'}));
}
export function renderMegaHome(ctx) {
  const p=ctx.progress,m=p.mega(),s=p.settings,bank=ctx.questions.filter(q=>q.tier==='booklet');
  const core=Math.max(4,Math.ceil(500/bank.length))*bank.length;
  const error=h('p',{class:'bad',role:'alert',hidden:true});
  const start=h('button',{class:'btn btn-primary btn-block mega-start',id:'mega-start',type:'button',onClick:async()=>{
    start.disabled=true;error.hidden=true;
    try {
      if(p.token&&navigator.onLine) {start.textContent='Έλεγχος αποθηκευμένου τεστ…';await p.syncNow('mega-open');}
      p.startMega();ctx.navigate('#/mega');p.syncNow('mega-start');
    } catch(e) {error.hidden=false;error.textContent='Δεν αποθηκεύτηκε το τεστ. Ελευθέρωσε χώρο και ξαναδοκίμασε.';start.disabled=false;start.textContent='Δοκίμασε ξανά';}
  }},m&&!m.done?'Συνέχισε το Mega τεστ →':m?.done?'Νέο Mega τεστ →':'Ξεκίνα το Mega τεστ →');
  return h('div',{class:'mega-home'},
    renderPassEstimate(ctx),
    h('header',{class:'mega-heading'},
      h('div',{class:'mega-ticket'},h('span',null,s.examTentative?'Προσωρινή ημερομηνία':'Η εξέτασή σου'),h('b',null,s.examDate?`${new Intl.DateTimeFormat('el-GR',{weekday:'long',day:'numeric',month:'long'}).format(new Date(s.examDate+'T12:00:00'))} · ${s.examTime||'09:00'}`:'Όρισε ημερομηνία στις Ρυθμίσεις'))),
    h('section',{class:'card mega-hero'},h('div',{class:'mega-title-row'},h('h2',null,'Mega προετοιμασία'),h('span',{class:'tag'},`${core}+ απαντήσεις`)),
      start,error,
      h('p',{class:'muted'},`${bank.length} διαφορετικές ερωτήσεις, τέσσερα πλήρη περάσματα. Οι νέες, οι αδύναμες και όσες έχεις χάσει μπαίνουν πρώτες. Κάθε λάθος επιστρέφει αργότερα, μέχρι να απαντηθεί σωστά δύο φορές στη σειρά.`),progress(m,core),
      h('div',{class:'mega-numbers'},stat(m?.index||0,'απαντήσεις στο Mega'),stat(m?.pending.length||0,'λάθη για διόρθωση'),stat(m?pct(m.correct,m.index):'—','ακρίβεια αυτού του τεστ')),
      h('p',{class:'small mega-save-note'},'✓ Αυτόματη αποθήκευση σε κάθε απάντηση. Παύση, κλείσιμο εφαρμογής, συνέχεια από εκεί που έμεινες.'),
      h('p',{class:'small muted'},p.token?'Για αλλαγή συσκευής: περίμενε «Συγχρονίστηκε» και άνοιξε την ενημερωμένη εφαρμογή στην άλλη συσκευή.':'Η αποθήκευση λειτουργεί σε αυτή τη συσκευή, και χωρίς σύνδεση.')),
    h('div',{class:'mega-info-grid'},h('section',{class:'card'},h('h3',null,'Όλα μέσα στο ίδιο τεστ'),h('ul',null,
      h('li',null,'Τέσσερις εμφανίσεις κάθε ερώτησης, με ανακατεμένες επιλογές.'),h('li',null,'Διατύπωση βιβλίου και εξετάσεων όπου διαφέρουν.'),
      h('li',null,'Επεξήγηση και σύγκριση με παρόμοιες ερωτήσεις μετά την απάντηση.'),h('li',null,'Πρόσθετες επαναλήψεις λαθών με τουλάχιστον 8 άλλες ερωτήσεις ανάμεσα.'))),
      h('section',{class:'card'},h('h3',null,'Μετράμε όσα έκανες'),h('p',null,'Βλέπεις κάλυψη, σωστές απαντήσεις και εκκρεμή λάθη. Η ολοκλήρωση του τεστ δεν είναι εγγύηση επιτυχίας.'),
        h('p',{class:'small muted'},'Χρησιμοποιούμε τις 140 ερωτήσεις της ελεγμένης βάσης. Οι 19 ερωτήσεις αρχείου παραμένουν στη βιβλιοθήκη ως «Εκτός ύλης».'),h('a',{href:'#/cards'},'Κάρτες υπενθύμισης →'))),
    m?.done?h('section',{class:'card'},h('h2',null,'Ολοκλήρωσες το Mega τεστ'),h('p',null,`${m.correct}/${m.index} σωστές · ${m.coreDone}/${m.plan.queue.length} βασικές απαντήσεις · κανένα εκκρεμές λάθος.`)):null);
}
export function renderMegaSession(ctx) {
  const p=ctx.progress,root=h('div',{id:'mega-session',class:'mega-session',tabIndex:-1});
  let busy=false,started=performance.now(),pendingEvent=null;
  const pause=()=>{if(busy)return;ctx.navigate('#/');p.syncNow('mega-pause');};
  function draw() {
    if(!root.isConnected&&root.childNodes.length)return;
    const m=p.mega();
    if(!m){root.replaceChildren(h('p',null,'Δεν υπάρχει αποθηκευμένο τεστ.'),h('a',{href:'#/'},'Αρχική'));return;}
    const r=megaReview(),review=r?.id===m.plan.id&&r.index===m.index-1&&m.answers[r.index]?r.index:null;
    if(m.done&&review===null){root.replaceChildren(h('section',{class:'card mega-complete'},h('div',{class:'eyebrow'},'MEGA / ΟΛΟΚΛΗΡΩΘΗΚΕ'),h('h1',null,'Όλη η ύλη. Όλα τα λάθη διορθωμένα.'),progress(m),
      h('div',{class:'mega-numbers'},stat(`${m.correct}/${m.index}`,'σωστές συνολικά'),stat(pct(m.coreCorrect,m.coreDone),'ακρίβεια στα βασικά'),stat(0,'εκκρεμή λάθη')),
      h('p',null,'Τα λάθη αυτού του τεστ απαντήθηκαν σωστά δύο φορές στη σειρά. Η πρόοδός σου έχει αποθηκευτεί στη συσκευή.'),h('a',{class:'btn btn-primary btn-block',href:'#/'},'Επιστροφή στην αρχική')));p.syncNow('mega-complete');return;}
    const index=review===null?m.index:review,item=m.queue[index],v=megaQuestion(m.plan,item,index,ctx.questions),answer=review===null?null:m.answers[index];
    root.dataset.cursor=String(index);root.dataset.qid=String(v.q.id);
    const save=h('p',{id:'mega-save',class:'small mega-save-note',role:'status'},answer?'✓ Η απάντηση αποθηκεύτηκε στη συσκευή.':'Η πρόοδος αποθηκεύεται μόλις απαντήσεις.');
    const error=h('p',{id:'mega-error',class:'bad',role:'alert',hidden:true});
    const pauseBtn=h('button',{class:'btn btn-sm',id:'mega-pause',type:'button',onClick:pause},'Παύση & αποθήκευση');
    const opts=h('div',{class:'options'},v.order.map((orig,i)=>h('button',{class:`opt ${answer?(orig===v.q.correct?'correct':orig===answer.ch?'wrong':'dim'):''}`,type:'button',disabled:!!answer,dataset:{orig},onClick:()=>submit(orig)},h('span',{class:'k'},LETTERS[i]+'.'),h('span',null,v.options[orig]))));
    const card=h('section',{class:'qcard'},h('div',{class:'qid'},h('span',null,`#${v.q.id} · Ομάδα ${v.q.group}`),h('span',null,item.review?'Επιστροφή λάθους':`Πέρασμα ${item.pass+1}/4`)),h('div',{class:'qtext'},v.text),
      v.q.image?h('img',{class:'qimg',src:v.q.image,alt:'Εικόνα ερώτησης'}):null,opts,save,error);
    async function submit(orig) {
      if(busy||answer)return;
      const current=p.mega();if(!current||current.plan.id!==m.plan.id||current.index!==index){draw();return;}
      busy=true;pauseBtn.disabled=true;opts.querySelectorAll('button').forEach(b=>b.disabled=true);save.textContent='Αποθήκευση…';
      try {
        const event=pendingEvent||{id:uuid(),t:Date.now(),k:'answer',q:v.q.id,ch:orig,ok:orig===v.q.correct,ms:Math.min(3600000,Math.max(0,Math.round(performance.now()-started))),m:'mega',s:`${m.plan.id}:${index}`,cf:null,sh:true,tl:null,hd:false,rc:false};
        pendingEvent=event;setMegaReview(m.plan.id,index);await p.answerMega(event);pendingEvent=null;busy=false;draw();root.querySelector('#mega-next')?.focus();
        if((index+1)%10===0)p.syncNow('mega-checkpoint');
      } catch(e) {busy=false;pauseBtn.disabled=false;save.textContent='Η αποθήκευση δεν ολοκληρώθηκε.';error.hidden=false;error.replaceChildren(h('span',null,'Η απάντηση δεν προχώρησε. Ελευθέρωσε χώρο και δοκίμασε ξανά. '),h('button',{class:'btn',type:'button',onClick:()=>submit(orig)},'Επανάληψη αποθήκευσης'));}
    }
    if(answer){const twin=ctx.questions.filter(q=>(v.q.twins||[]).includes(q.id)&&q.tier==='booklet');card.append(h('div',{class:`feedback ${answer.ok?'ok':'bad'}`},h('strong',{class:'verdict'},answer.ok?'Σωστή απάντηση':'Λάθος — θα το ξαναδούμε'),
      h('p',null,'Σωστή: ',h('b',null,v.options[v.q.correct])),v.q.explanation?h('div',{class:'explain'},v.q.explanation,h('span',{class:'small muted'},' · Βοηθητική επεξήγηση')):null,
      v.q.exam?h('p',{class:'small alt-wording'},v.exam?'Στο βιβλίο: ':'Στις εξετάσεις: ',v.exam?v.q.text:v.q.exam.text,' → ',v.exam?v.q.options[v.q.correct]:v.q.exam.options[v.q.correct]):null,
      twin.length?h('details',null,h('summary',null,'Πρόσεξε τις παρόμοιες ερωτήσεις'),twin.map(q=>h('p',{class:'small'},q.text,' → ',h('b',null,q.options[q.correct])))):null,
      h('button',{class:'btn btn-primary btn-block',id:'mega-next',type:'button',onClick:()=>{clearMegaReview();started=performance.now();draw();window.scrollTo(0,0);}},m.done?'Δες την ολοκλήρωση':'Επόμενη ερώτηση →')));}
    root.replaceChildren(h('div',{class:'mega-session-head'},h('div',null,h('b',null,'Mega προετοιμασία'),h('div',{class:'small muted',id:'mega-position'},`Απάντηση ${index+1} από ${m.total} · ${m.pending.length} λάθη για διόρθωση`)),pauseBtn),progress(m),card,
      ...(m.index>0&&m.index%20===0?[h('p',{class:'small muted'},'Μπορείς να κάνεις μια παύση. Η θέση σου έχει αποθηκευτεί.')]:[]));
  }
  root.addEventListener('keydown',e=>{if(e.key>='1'&&e.key<='5')root.querySelectorAll('button.opt')[Number(e.key)-1]?.click();if(e.key==='Enter')root.querySelector('#mega-next')?.click();});draw();return root;
}
