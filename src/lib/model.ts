import modelJson from '../data/model.json'
import type { FeatureName, Features } from './types'

export const MODEL = modelJson as unknown as {
  features: FeatureName[]; labels: Record<FeatureName, string>; mean: number[]; scale: number[]; coef: number[]
  intercept: number; threshold: number; gb_importance: Record<FeatureName, number>
  metrics: Record<'lr' | 'gb', Record<string, number | string>>
  roc: { fpr: number; tpr: number }[]; roc_gb: { fpr: number; tpr: number }[]
  calibration: { predicted: number; observed: number }[]; confusion: number[][]
  gains: { pct: number; captured: number }[]
  dataset: { rows: number; train: number; test: number; positive_rate: number; top20_conversion: number }
}

export interface Contribution { feature: FeatureName; label: string; value: number; contribution: number }
export interface Score { probability: number; logit: number; contributions: Contribution[]; evidence: number }

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

const BASE_LOGIT = (() => { const r = (modelJson as { dataset: { positive_rate: number } }).dataset.positive_rate; return Math.log(r / (1 - r)) })()

/**
 * Exact re-implementation of sklearn's StandardScaler + LogisticRegression.predict_proba.
 * `evidence` (0..1) handles cold start during a live call: count features (signals, questions, plan mentions)
 * are naturally zero in the first seconds, so the logit is shrunk toward the base-rate logit until the
 * buyer has spoken enough. evidence = 1 gives the exact sklearn probability.
 */
export function score(x: Features, evidence = 1): Score {
  let logit = MODEL.intercept * evidence + BASE_LOGIT * (1 - evidence)
  const contributions: Contribution[] = MODEL.features.map((f, i) => {
    const z = (x[f] - MODEL.mean[i]) / MODEL.scale[i]
    const c = MODEL.coef[i] * z * evidence // contribution relative to an "average" lead (z = 0)
    logit += c
    return { feature: f, label: MODEL.labels[f], value: x[f], contribution: c }
  })
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  return { probability: sigmoid(logit), logit, contributions, evidence }
}

export const BASE_RATE = MODEL.dataset.positive_rate

/** Evidence weight for a live call: full weight after six buyer turns. */
export const evidenceFor = (buyerTurns: number) => Math.min(1, buyerTurns / 6)
