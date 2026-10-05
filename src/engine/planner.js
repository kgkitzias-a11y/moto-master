// Calendar-based coverage plan. The exam day is reserved for review; today's
// quotas use the start-of-day log, so answering cannot move the goalposts.
import { dayKey } from './time.js';
import { reduce, isMastered, inBin } from './reducer.js';

export function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const ts = Date.UTC(y, m - 1, d);
  return new Date(ts).toISOString().slice(0, 10) === value ? ts / 86400000 : null;
}

export function answersToday(progress, now = Date.now()) {
  const resetAt = latestReset(progress.events);
  return progress.events.filter((e) => e.k === 'answer' && e.t > resetAt && e.t <= now && dayKey(e.t) === dayKey(now)).length;
}

function latestReset(events) {
  return events.reduce((t, e) => e.k === 'reset' ? Math.max(t, e.t) : t, -Infinity);
}

export function studyPlan(questions, events, settings, now = Date.now()) {
  const today = dayKey(now);
  const exam = calendarDay(settings.examDate);
  const days = exam === null ? null : exam - calendarDay(today);
  const answerCount = answersToday({ events }, now);
  if (days === null || days < 0) {
    const target = Math.max(10, Math.min(400, Math.round(Number(settings.dailyGoal) || 40)));
    return { automatic: false, status: days === null ? 'unset' : 'past', days,
      target, done: Math.min(target, answerCount), remaining: Math.max(0, target - answerCount), answerCount };
  }

  const pool = questions.filter((q) => q.tier === 'booklet' || (settings.includeArchive && q.tier === 'archive'));
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const resetAt = latestReset(events);
  const active = events.filter((e) => e.t > resetAt && e.t <= now);
  const before = reduce(active.filter((e) => e.t < start.getTime()), questions);
  const answered = new Set(active.filter((e) => e.k === 'answer' && e.t >= start.getTime()).map((e) => e.q));
  const newAtStart = pool.filter((q) => !before.q[q.id]?.seen).map((q) => q.id);
  const unseen = newAtStart.filter((id) => !answered.has(id));
  const studyDays = Math.max(1, days);
  const newTarget = Math.ceil(newAtStart.length / studyDays);
  const newDone = newAtStart.length - unseen.length;
  const newRemaining = Math.max(0, newTarget - newDone);
  // One review per previously seen, not-yet-mastered question, each day.
  // Keep reviews separate: repeating familiar questions cannot replace coverage.
  const reviews = pool.filter((q) => before.q[q.id]?.seen && !isMastered(before.q[q.id]));
  reviews.sort((a, b) => Number(inBin(before.q[b.id])) - Number(inBin(before.q[a.id])) || a.id - b.id);
  const reviewRemainingIds = reviews.filter((q) => !answered.has(q.id)).map((q) => q.id);
  const reviewTarget = reviews.length;
  const reviewDone = reviewTarget - reviewRemainingIds.length;
  const target = newTarget + reviewTarget;
  const remaining = newRemaining + reviewRemainingIds.length;
  return { automatic: true, status: days === 0 ? 'today' : 'scheduled', days, studyDays,
    target, done: Math.min(newDone, newTarget) + reviewDone, remaining, answerCount,
    newTarget, newDone, newRemaining, reviewTarget, reviewDone,
    unseen: unseen.length, total: pool.length,
    // New questions first to protect the deadline; mistakes lead the review section.
    queue: [...unseen.slice(0, newRemaining), ...reviewRemainingIds] };
}
