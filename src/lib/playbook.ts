import type { ObjectionId } from './types'

export interface PlaybookEntry {
  id: ObjectionId; title: string; worry: string; response: string; proof: string[]; severity: 'high' | 'medium' | 'low'
  pattern: RegExp
}

// Objection playbook. Patterns are matched against BUYER lines only (English + Hinglish).
export const PLAYBOOK: PlaybookEntry[] = [
  {
    id: 'refund_999', title: 'Is the ₹999 refundable?', severity: 'medium',
    worry: 'Buyer is afraid of losing the registration fee.',
    response: 'Yes, the ₹999 is fully refundable. It only locks your priority in the allotment, there is no obligation to book.',
    proof: ['Refund within 7 working days', 'Priority allotment by registration time'],
    pattern: /(999|registration|token).{0,40}(refund|wapas|return|money back)|refundable/i,
  },
  {
    id: 'possession_delay', title: 'Possession delay risk', severity: 'high',
    worry: 'Buyer has heard of stalled projects and fears a late handover.',
    response: 'The project is RERA-registered with a committed possession date. With 1% a month, your payments move in step with construction, so you are never far ahead of progress.',
    proof: ['RERA registration number on every document', 'Construction-linked 1%/month plan', 'Monthly progress videos'],
    pattern: /possession.{0,30}(delay|late)|delay(ed)?|late ho|stalled/i,
  },
  {
    id: 'no_sample_flat', title: 'No sample flat / site office', severity: 'medium',
    worry: 'Fully digital sale, buyer cannot physically see the home.',
    response: 'Offer the 3D walkthrough and a live video site tour today, and remind them of the one-year buyback guarantee as a safety net.',
    proof: ['3D walkthrough link', 'Live video tour on demand', '1-year buyback guarantee'],
    pattern: /sample flat|site office|show flat|how do i know what|kaise pata chalega|dekh(a|ne) nahi/i,
  },
  {
    id: 'loan_approval', title: 'Home-loan approval worry', severity: 'high',
    worry: 'Low CIBIL score, self-employed income or general fear of rejection.',
    response: 'The project is approved with all major banks. Our loan desk checks eligibility for free before you pay anything beyond ₹999.',
    proof: ['Pre-approved with major banks', 'Free eligibility check', 'Co-applicant options'],
    pattern: /loan(?!\s*(is\s+)?pre-?approv)(?! pre)[^.]{0,40}(approv|milega|dega|reject|worry|tension|darr)|cibil|self.employed|bank.{0,30}(approve|loan dega)/i,
  },
  {
    id: 'resale_value', title: 'Resale value / appreciation', severity: 'medium',
    worry: 'Buyer doubts the micro-market will appreciate.',
    response: 'Talk about upcoming infrastructure on the corridor and use the one-year buyback guarantee to de-risk the decision.',
    proof: ['Upcoming multimodal corridor', 'Rail upgrades on the Western line', 'Buyback guarantee'],
    pattern: /resale|re-sale|appreciat|future value|hot market/i,
  },
  {
    id: 'location_connectivity', title: 'Location & commute', severity: 'medium',
    worry: 'Naigaon feels far from the buyer\'s office.',
    response: 'Share the door-to-station time and typical commute to Andheri/Lower Parel, plus upcoming road links that reduce travel time.',
    proof: ['Station proximity map', 'Commute times by train', 'Upcoming road links'],
    pattern: /too far|bahut door|door lagta|commute|travel ka|connectivity|far from|distance/i,
  },
  {
    id: 'builder_trust', title: 'Trust in an online sale', severity: 'high',
    worry: 'Buyer is unsure who stands behind a fully digital launch.',
    response: 'Explain the developer group\'s delivery track record and that every payment goes into a RERA escrow account.',
    proof: ['Listed group, decades of delivery', 'RERA escrow account', 'Digital agreement with e-stamp'],
    pattern: /trust|developer kaun|who is the developer|fraud|scam|genuine/i,
  },
  {
    id: 'carpet_area', title: '323 sq ft feels small', severity: 'low',
    worry: 'Buyer thinks the 1BHK carpet area is too small for the family.',
    response: 'Show the efficient layout (no wasted corridors) and offer the 2BHK if they need more room.',
    proof: ['Efficiency-optimised floor plan', '2BHK from ₹52.99L'],
    pattern: /too small|really small|chhota|space kam|323 (sq|square)/i,
  },
  {
    id: 'maintenance_charges', title: 'Monthly maintenance', severity: 'low',
    worry: 'Buyer wants to know recurring costs.',
    response: 'Give the per-sq-ft maintenance estimate and mention that the first year is covered in the package.',
    proof: ['First-year maintenance included', 'Transparent per-sq-ft rate'],
    pattern: /maintenance/i,
  },
  {
    id: 'buyback_terms', title: 'Buyback guarantee terms', severity: 'medium',
    worry: 'Buyer suspects a catch in the buyback guarantee.',
    response: 'No catch: within the first year the developer buys the home back at the price paid, and it\'s written into the agreement.',
    proof: ['Clause in the agreement for sale', 'Buyback at the purchase price'],
    pattern: /buy ?back|what'?s the catch|catch kya/i,
  },
]
export const PLAYBOOK_BY_ID = Object.fromEntries(PLAYBOOK.map((p) => [p.id, p])) as Record<ObjectionId, PlaybookEntry>
