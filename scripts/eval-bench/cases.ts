/**
 * cases.ts - Benchmark URLs for the events/communities evaluator.
 *
 * Each case has a URL, the expected verdict (`accept` or `reject`), a category
 * tag describing why, and a short rationale that explains what a human would
 * see on the page. The goal is for the evaluator's verdict to match `expected`
 * for every case.
 *
 * Coverage:
 *   accept — real, active, on-topic AI safety events/communities
 *   reject — dead sites, shell pages with no activity, off-topic / corporate
 *           marketing dressed up with AI keywords, content that drifts away
 *           from AI safety and into general rationality / business / ethics.
 */

export type ExpectedVerdict = 'accept' | 'reject';

export type Category =
  | 'good-event'
  | 'good-community'
  | 'good-campaign'
  | 'corporate-marketing'
  | 'off-topic-relevant-keyword'
  | 'shell-no-activity'
  | 'dead-site'
  | 'rationality-not-safety';

export interface BenchmarkCase {
  url: string;
  expected: ExpectedVerdict;
  category: Category;
  /** Which pipeline path to run this through. */
  pipelineCategory: 'event' | 'community';
  rationale: string;
}

export const CASES: BenchmarkCase[] = [
  // ─── ACCEPT ──────────────────────────────────────────────

  {
    url: 'https://luma.com/ais-contenthack',
    expected: 'accept',
    category: 'good-event',
    pipelineCategory: 'event',
    rationale:
      'Real BlueDot Impact event (AI Risk Content Hackathon) at LISA, London. Active host, clear AI-safety topic.',
  },
  {
    url: 'https://stoptherace.ai',
    expected: 'accept',
    category: 'good-campaign',
    pipelineCategory: 'community',
    rationale:
      'Live "Stop The Race" campaign with a concrete upcoming march in SF on June 27 2026. Clearly on-topic for AI safety / pause AI.',
  },
  {
    url: 'https://moxsf.com',
    expected: 'accept',
    category: 'good-community',
    pipelineCategory: 'community',
    rationale:
      'Mox SF — active research-focused coworking space at 1680 Mission St. Tenants include MIRI, FAR.AI, Redwood, ARC. ~196 members listed.',
  },
  {
    url: 'https://bluedot.org',
    expected: 'accept',
    category: 'good-community',
    pipelineCategory: 'community',
    rationale:
      'BlueDot Impact — leading AI safety education org. 7,000+ alumni, $35M raised, multiple active programs. Currently mismarked dead in our DB.',
  },
  {
    url: 'https://lu.ma/9bmte6qy',
    expected: 'accept',
    category: 'good-event',
    pipelineCategory: 'event',
    rationale:
      'AI Safety Awareness Project NYC workshop on "Superintelligent AI and Loss of Control" with concrete date 2026-05-02. On-topic and active.',
  },

  // ─── REJECT ──────────────────────────────────────────────

  {
    url: 'https://www.eventbrite.com/e/beyond-policy-designing-ethical-ai-products-tickets-1988247929078',
    expected: 'reject',
    category: 'corporate-marketing',
    pipelineCategory: 'event',
    rationale:
      'Corporate AI-ethics design webinar. Organized by AI Governance Collective for "product designers and practitioners". Does not address AI x-risk, alignment, or safety research — it is a UX/governance practitioner session that uses the AI keyword.',
  },
  {
    url: 'https://lu.ma/96nrl7hu',
    expected: 'reject',
    category: 'corporate-marketing',
    pipelineCategory: 'event',
    rationale:
      'AI Game Changers Club Zurich — "Human-AI Synergy and AI Governance for Business Growth". This is a business / networking event using AI governance vocabulary, not an AI safety event.',
  },
  {
    url: 'https://aisafety-cn.com',
    expected: 'accept',
    category: 'good-community',
    pipelineCategory: 'community',
    rationale:
      'Open Community for AI Safety China. Looks shell-y in static HTML (Loading events..., 0+ counters) because numbers are JS-populated, but the rendered page shows 199+ Community / 9,951+ Extended Reach / 19+ Core Team and recent past lectures (Feb–Apr 2026). A human seeing the rendered page would call it active. This case exists to make sure the pipeline relies on rendered-page judgment, not static HTML.',
  },
  {
    url: 'https://aiscol.org',
    expected: 'reject',
    category: 'dead-site',
    pipelineCategory: 'community',
    rationale:
      'AI Safety Colombia — domain returns ECONNREFUSED. Site is dead.',
  },
  {
    url: 'https://munich-ai-alignment.org',
    expected: 'reject',
    category: 'dead-site',
    pipelineCategory: 'community',
    rationale:
      'Munich AI Alignment — domain returns ECONNREFUSED. Site is dead.',
  },
  {
    url: 'https://www.eaeindhoven.nl/ai-safety-team',
    expected: 'reject',
    category: 'dead-site',
    pipelineCategory: 'community',
    rationale:
      'EA Eindhoven AI Safety Team — page returns HTTP 404. Subpage of a real domain, but the safety-team page itself is gone. Tests the HTTP-error short-circuit (different from ECONNREFUSED).',
  },
];
