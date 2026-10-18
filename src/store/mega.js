import { mergePlans, sanitizePlans } from '../engine/mega.js';
const PLANS='mm.mega.plans',PENDING='mm.mega.pending',REVIEW='mm.mega.review';
const read=(key,fallback)=>{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;};
export const loadMegaPlans=()=>sanitizePlans(read(PLANS,[]));
export function saveMegaPlans(plans) { const merged=mergePlans(loadMegaPlans(),plans);localStorage.setItem(PLANS,JSON.stringify(merged));return merged; }
export const pendingMegaAnswer=()=>read(PENDING,null);
export const stageMegaAnswer=e=>localStorage.setItem(PENDING,JSON.stringify(e));
export const clearPendingMega=()=>localStorage.removeItem(PENDING);
export const megaReview=()=>read(REVIEW,null);
export const setMegaReview=(id,index)=>localStorage.setItem(REVIEW,JSON.stringify({id,index}));
export const clearMegaReview=()=>localStorage.removeItem(REVIEW);
