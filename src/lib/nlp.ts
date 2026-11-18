import { PLAYBOOK } from './playbook'
import type { Features, Line, ObjectionId } from './types'

/**
 * Lightweight, deterministic call-understanding layer (English + Hinglish).
 * Runs in < 1 ms per line so scoring feels live; an optional transformer model can refine sentiment.
 */
const POS = [
  /perfect|great|interesting|manageable|love|wonderful|excellent|reassur|relief|makes sense|that helps|helps/i,
  /badiya|badhiya|bilkul|kaafi interest|interest hai|let'?s do it|chalo|abhi kar deta|abhi kar deti|wait kar/i,
  /sounds good|i like|happy|theek hai|samajh (gaya|gayi)|pasand|sahi hai|acha laga|achha laga|sure,? i was hoping|less than my rent|isse zyada hai/i,
]
const NEG = [
  /busy|tough|worr(y|ied|ies)|tension|darr|doubt|not convinced|not sure|pakka nahi|horror|catch/i,
  /too far|bahut door|too small|chhota|expensive|mehenga|mushkil|bhaari|difficult|isn'?t great|kam hai/i,
  /i'?ll pass|leave it|chhod|rehne dete|not for me|nahi hai mere liye|mere liye nahi|not (really )?in my budget|budget mein nahi/i,
  /just clicked an ad|bas ad pe/i,
]
const BUY_SIGNALS = /regist(er|ration)|registration ka link|send me the link|link bhej|book (the|karte)|let'?s do it|next step|price lock|which floors|kaunse floors|walkthrough|kar deta hoon|kar deti hoon/i
const PLAN = /1\s?%|one percent|payment plan|monthly|per month|9\.9|down payment|emi/i
const RESOLVED = /makes sense|reassuring|that helps|alright|theek hai|samajh (gaya|gayi)|relief|ye badiya|okay,? that|ok,? ye/i
const UNRESOLVED = /still not|not convinced|still worries|abhi bhi|pakka nahi|doubt hai/i
const QUESTION = /\?|\b(kya|kaise|kitna|kitne|kab|kaunse|how|what|when|which|can i|is it|will)\b/i

export interface Fields {
  bhk?: string; budget?: string; budgetLakh?: number; timeline?: string; financing?: string
  location: string[]; planMentions: string[]; nextStep?: string
}
export interface ObjectionEvent { id: ObjectionId; t: number; line: number; status: 'open' | 'resolved'; quote: string }
export interface AgentChecklist { pitchedPlan: boolean; buyback: boolean; warranty: boolean; askedNeeds: boolean; nextStep: boolean }
export interface TimelinePoint { t: number; idx: number; probability?: number; sentiment?: number; intent?: number; label?: string }
export interface CallState {
  features: Features; fields: Fields; objections: ObjectionEvent[]; checklist: AgentChecklist
  sentiments: number[]; lineSentiment: (number | null)[]; positives: number; negatives: number
}

export const PRICE_LAKH: Record<number, number> = { 1: 34.99, 2: 52.99 }

function count(res: RegExp[], text: string) {
  return res.reduce((n, r) => n + (r.test(text) ? 1 : 0), 0)
}

export function lexiconSentiment(text: string) {
  const p = count(POS, text), n = count(NEG, text)
  if (p === 0 && n === 0) return 0
  return Math.tanh((p - n) * 0.9)
}

function parseBudget(text: string): { label: string; value: number } | null {
  const m = text.match(/(\d{2}(?:\.\d+)?)\s*(?:-|to|se|–)?\s*(\d{2}(?:\.\d+)?)?\s*(lakh|lac|lakhs|l\b)/i)
  if (!m) return null
  const a = parseFloat(m[1]), b = m[2] ? parseFloat(m[2]) : undefined
  return { label: b ? `₹${a}–${b}L` : `₹${a}L`, value: b ?? a }
}

export function initialState(isReferral = false): CallState {
  return {
    features: {
      budget_fit: 0, timeline_urgency: 1, financing_ready: 0, plan_interest: 0, registration_intent: 0,
      objections_raised: 0, open_objections: 0, positive_signals: 0, negative_signals: 0,
      buyer_sentiment: 0, buyer_questions: 0, is_referral: isReferral ? 1 : 0,
    },
    fields: { location: [], planMentions: [] }, objections: [], sentiments: [], lineSentiment: [],
    checklist: { pitchedPlan: false, buyback: false, warranty: false, askedNeeds: false, nextStep: false },
    positives: 0, negatives: 0,
  }
}

/** Pure reducer: fold one transcript line into the running call state. */
export function step(prev: CallState, line: Line, idx: number, sentimentOverride?: number): CallState {
  const s: CallState = structuredClone(prev)
  const text = line.text
  const f = s.features
  if (line.speaker === 'agent') {
    if (PLAN.test(text) && /999|9\.9|1\s?%/.test(text)) s.checklist.pitchedPlan = true
    if (/buy ?back/i.test(text)) s.checklist.buyback = true
    if (/warranty/i.test(text)) s.checklist.warranty = true
    if (/bhk|budget/i.test(text) && QUESTION.test(text)) s.checklist.askedNeeds = true
    if (/link|whatsapp|call you|call karti|call karta|hold|block/i.test(text)) s.checklist.nextStep = true
    s.lineSentiment[idx] = null
    return s
  }
  // ---- buyer line ----
  const sent = sentimentOverride ?? lexiconSentiment(text)
  s.lineSentiment[idx] = sent
  s.sentiments.push(sent)
  f.buyer_sentiment = s.sentiments.reduce((a, b) => a + b, 0) / s.sentiments.length
  if (QUESTION.test(text)) f.buyer_questions += 1
  const pos = count(POS, text), neg = count(NEG, text)
  f.positive_signals = Math.min(9, f.positive_signals + pos + (BUY_SIGNALS.test(text) ? 1 : 0))
  f.negative_signals = Math.min(7, f.negative_signals + neg)

  // fields
  const bhk = text.match(/\b([12])\s?bhk\b|\b(ek|one|do|two)\s?(bhk|bedroom)/i)
  if (bhk) {
    const n = bhk[1] ? +bhk[1] : /ek|one/i.test(bhk[2]) ? 1 : 2
    s.fields.bhk = `${n}BHK`
  }
  const budget = parseBudget(text)
  if (budget) { s.fields.budget = budget.label; s.fields.budgetLakh = budget.value }
  if (s.fields.budgetLakh) {
    const price = PRICE_LAKH[s.fields.bhk === '2BHK' ? 2 : 1]
    f.budget_fit = s.fields.budgetLakh >= price * 0.97 ? 1 : -1
  }
  if (/this month|is mahine|immediately|right away|three months|teen mahine|lease ends|agreement khatam|jaldi decide/i.test(text)) {
    f.timeline_urgency = 3; s.fields.timeline = 'Within 3 months'
  } else if (/3 to 6 months|six months|6 months|4-5 mahine|next few months|within six/i.test(text)) {
    f.timeline_urgency = 2; s.fields.timeline = '3–6 months'
  } else if (/within a year|next year|ek saal mein|no hurry|koi jaldi nahi|still early|abhi shuru/i.test(text)) {
    f.timeline_urgency = 1; s.fields.timeline = '6–12 months'
  } else if (/just (looking|exploring)|no plans|not buying/i.test(text)) {
    f.timeline_urgency = 0; s.fields.timeline = 'Just exploring'
  }
  if (/pre-?approv|self-?funded|savings|saving for|cash ready/i.test(text)) {
    f.financing_ready = 1
    s.fields.financing = /pre-?approv/i.test(text) ? 'Loan pre-approved' : 'Self-funded'
  } else if (/cibil|self-employed|loan milega ya nahi|won'?t get a loan|loan (is my|approval ka)|loan.{0,20}(worry|darr|tension)/i.test(text)) {
    f.financing_ready = -1; s.fields.financing = 'Loan risk (needs help)'
  } else if (/thought about that|socha nahi|probably a loan|shayad loan/i.test(text)) {
    f.financing_ready = 0; s.fields.financing = 'Undecided'
  }
  const loc = text.match(/too far|bahut door|commute|andheri|lower parel|travel|station|connectivity/gi)
  if (loc) for (const l of loc) if (!s.fields.location.includes(l.toLowerCase())) s.fields.location.push(l.toLowerCase())
  if (PLAN.test(text)) {
    s.fields.planMentions.push(text)
    if (sent >= 0) f.plan_interest = Math.min(3, f.plan_interest + 1)
  }
  if (BUY_SIGNALS.test(text)) { f.registration_intent = 1; s.fields.nextStep = text }

  // objections: resolution of the most recent open one, then new ones
  const open = [...s.objections].reverse().find((o) => o.status === 'open' && o.line < idx)
  if (open && RESOLVED.test(text) && !UNRESOLVED.test(text)) open.status = 'resolved'
  for (const p of PLAYBOOK) {
    if (p.pattern.test(text) && !s.objections.some((o) => o.id === p.id)) {
      s.objections.push({ id: p.id, t: line.t, line: idx, status: 'open', quote: text })
    }
  }
  f.objections_raised = Math.min(5, s.objections.length)
  f.open_objections = Math.min(5, s.objections.filter((o) => o.status === 'open').length)
  return s
}

export function analyse(lines: Line[], isReferral = false, overrides: Record<number, number> = {}) {
  let st = initialState(isReferral)
  for (let i = 0; i < lines.length; i++) st = step(st, lines[i], i, overrides[i])
  return st
}
