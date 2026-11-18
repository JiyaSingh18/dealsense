/**
 * Optional in-browser transformer sentiment (transformers.js, ONNX/WASM, runs on-device).
 * Loaded lazily from a CDN only when the user switches it on. The app never depends on it:
 * the lexicon scorer is always available, and if the download is slow or fails we stay on it.
 */
type Classifier = (text: string) => Promise<{ label: string; score: number }[]>
export type NeuralStatus = 'off' | 'loading' | 'ready' | 'failed'

const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5'
const MODEL_ID = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english'
let classifier: Classifier | null = null
let loading: Promise<Classifier | null> | null = null

export function loadNeural(timeoutMs = 45000): Promise<Classifier | null> {
  if (classifier) return Promise.resolve(classifier)
  if (loading) return loading
  const load = (async () => {
    const mod = await import(/* @vite-ignore */ CDN)
    const pipe = await mod.pipeline('sentiment-analysis', MODEL_ID, { dtype: 'q8', device: 'wasm' })
    classifier = pipe as Classifier
    return classifier
  })()
  const timeout = new Promise<null>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
  loading = Promise.race([load, timeout]).catch(() => { loading = null; return null })
  return loading
}

/**
 * Returns sentiment in [-0.5, 0.5], or null if the model is not available.
 * SST-2 has no neutral class and is over-confident, so only near-certain predictions count.
 */
export async function neuralSentiment(text: string): Promise<number | null> {
  if (!classifier) return null
  try {
    const [r] = await classifier(text)
    const strength = Math.max(0, (r.score - 0.9) / 0.1) * 0.5
    return r.label === 'POSITIVE' ? strength : -strength
  } catch {
    return null
  }
}
