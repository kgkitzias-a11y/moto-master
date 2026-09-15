// Feedback effects: short synthesized sounds (no assets), haptics, confetti, theme.
// All effects are opt-out in Settings and respect prefers-reduced-motion.
let audioCtx = null;
function ctxAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}
function tone(freq, ms, { type = 'sine', gain = 0.06, at = 0 } = {}) {
  const ac = ctxAudio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = ac.currentTime + at;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + ms / 1000 + 0.02);
}
export const sfx = {
  correct(combo = 1) { tone(660, 90); tone(990, 120, { at: 0.07 }); if (combo >= 5) tone(1320, 140, { at: 0.15, gain: 0.05 }); },
  wrong() { tone(220, 160, { type: 'triangle', gain: 0.07 }); tone(160, 220, { type: 'triangle', at: 0.12, gain: 0.05 }); },
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 140, { at: i * 0.08, gain: 0.05 })); },
  tick() { tone(1200, 30, { gain: 0.03 }); },
  fanfare() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 220, { at: i * 0.11, gain: 0.06 })); },
};
export function haptic(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {} }

export function confetti(container, n = 60) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#ff7a1a', '#ffd166', '#2ee36a', '#4cc9ff', '#b388ff', '#ff4d5e'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i'); p.className = 'confetti';
    p.style.left = `${Math.random() * 100}%`; p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 0.6}s`; p.style.animationDuration = `${1.4 + Math.random()}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(p); setTimeout(() => p.remove(), 2600);
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  const resolved = theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : (theme || 'dark');
  root.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = resolved === 'light' ? '#ffffff' : '#0a0f1c';
}

// Warm, specific praise beats generic "good job" (variable, non-repetitive reinforcement).
const PRAISE = ['Καθαρά.', 'Ακριβώς.', 'Αυτό είναι.', 'Σταθερός.', 'Έτσι μπράβο.', 'Χωρίς δισταγμό.', 'Καρφί.', 'Το ’χεις.'];
const PRAISE_FAST = ['Αστραπή ⚡', 'Αντανακλαστικό.', 'Πριν καν το σκεφτείς.'];
export function praise(ms, combo) {
  if (combo >= 10) return `×${combo} — σε φόρμα εξετάσεων.`;
  if (ms < 2500) return PRAISE_FAST[Math.floor(Math.random() * PRAISE_FAST.length)];
  return PRAISE[Math.floor(Math.random() * PRAISE.length)];
}
