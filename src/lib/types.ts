export type Speaker = 'agent' | 'buyer'
export interface Line { speaker: Speaker; text: string; t: number }
export interface Call {
  id: string; buyer: string; agent: string; language: 'English' | 'Hinglish'; persona: string; bhk: number
  source: string; outcome: 'booked' | 'follow_up' | 'lost'; duration: number; lines: Line[]; synthetic: boolean
}
export type ObjectionId =
  | 'refund_999' | 'possession_delay' | 'no_sample_flat' | 'loan_approval' | 'resale_value'
  | 'location_connectivity' | 'builder_trust' | 'carpet_area' | 'maintenance_charges' | 'buyback_terms'
export type FeatureName =
  | 'budget_fit' | 'timeline_urgency' | 'financing_ready' | 'plan_interest' | 'registration_intent'
  | 'objections_raised' | 'open_objections' | 'positive_signals' | 'negative_signals'
  | 'buyer_sentiment' | 'buyer_questions' | 'is_referral'
export type Features = Record<FeatureName, number>
