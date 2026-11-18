// Thin wrappers over the browser Web Speech APIs (Chrome / Edge). No audio leaves the browser via our code;
// note Chrome's recognition service itself is provided by the browser vendor.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function getRecognition(): any | null {
  const W = window as any
  const R = W.SpeechRecognition || W.webkitSpeechRecognition
  if (!R) return null
  const r = new R()
  r.lang = 'en-IN'
  r.continuous = true
  r.interimResults = true
  return r
}

let voices: SpeechSynthesisVoice[] = []
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const load = () => (voices = window.speechSynthesis.getVoices())
  load()
  window.speechSynthesis.onvoiceschanged = load
}

export function speak(text: string, speaker: 'agent' | 'buyer', rate: number): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve()
    const u = new SpeechSynthesisUtterance(text.replace(/₹/g, 'rupees '))
    const indian = voices.filter((v) => /en-IN|hi-IN/i.test(v.lang))
    const pool = indian.length ? indian : voices.filter((v) => /^en/i.test(v.lang))
    if (pool.length) u.voice = pool[speaker === 'agent' ? 0 : Math.min(1, pool.length - 1)]
    u.rate = Math.min(2, 0.95 * rate)
    u.pitch = speaker === 'agent' ? 1.1 : 0.9
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
    setTimeout(resolve, 20000)
  })
}
export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
