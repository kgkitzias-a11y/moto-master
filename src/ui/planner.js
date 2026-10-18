import { h } from './dom.js';
export function planControls(ctx) {
 const p=ctx.progress,s=p.settings;
 return h('section',{class:'card'},h('h3',null,'Η εξέτασή σου'),h('div',{class:'plan-when'},
  h('div',null,h('label',{htmlFor:'exam-date'},'Ημερομηνία εξετάσεων'),h('input',{type:'date',id:'exam-date',value:s.examDate||'',onChange:e=>p.updateSettings({examDate:e.target.value||null})})),
  h('div',null,h('label',{htmlFor:'exam-time'},'Ώρα εξετάσεων'),h('input',{type:'time',id:'exam-time',step:300,value:s.examTime||'09:00',onChange:e=>{if(/^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value))p.updateSettings({examTime:e.target.value});}}))),
  h('label',{class:'plan-tentative'},h('input',{type:'checkbox',checked:!!s.examTentative,onChange:e=>p.updateSettings({examTentative:e.target.checked})}),' Προσωρινή ημερομηνία — περιμένω επιβεβαίωση'),
  h('p',{class:'small muted'},'Η ημερομηνία και η ώρα συγχρονίζονται στις συνδεδεμένες συσκευές. Το Mega τεστ διατηρεί τη θέση σου όσες παύσεις κι αν κάνεις.'));
}
