# howdoihelp.ai

A directory and recommender for things you can actually do about AI safety.

Live at [howdoihelp.ai](https://howdoihelp.ai).

## What this is

Lots of people now believe AI development carries serious risks but have no idea what to do about it. There are hundreds of communities, events, programs, and open letters working on this, scattered across the EA Forum, LessWrong, Luma, Eventbrite, Meetup, BlueDot, and dozens of organisation websites. Finding the one that fits you is hard.

howdoihelp.ai pulls those resources into one place, scores them, and matches them to you based on how much time you have, what you want from it, where you live, and (optionally) your background. There are three ways in:

- **Browse** the full list and filter
- **Quick questions** for a guided two-step flow
- **Tell us about you** to get personalised picks from your LinkedIn, GitHub, X, or website

If a 30-minute call with someone already in the field would help more than another article, the same flow can recommend a guide and book the call.

## How recommendations work

Each resource has a small set of admin-only scores: `ev_general` (expected value to an average person), `ev_positioned` (expected value to someone particularly well-suited), `friction` (zero is one click, one is life-changing), and `min_minutes`. Communities and events also carry an `activity_score` from a verification step that kills dead listings.

Ranking is a multiplicative score combining time fit, intent fit, location fit, position fit, activity, profile fit, the relevant `ev`, a friction penalty scaled to time commitment, and a deadline boost. A diversity penalty knocks down later picks that look too similar to earlier ones (same category, same org, same location, same time bucket). Nearby communities and events get pulled into a single collapsible "local card" so they don't crowd out global resources, with a remoteness bonus when the user has very few local options.

For the personalised flow, the top ~50 algorithmic picks (capped per category for diversity, plus any urgent deadlines or very high-activity items) are passed to Claude with the user's profile, answers, and location. Claude reranks, writes a short personalised description for each, and may also pick one guide. The active prompt is versioned in Postgres and editable from `/admin/prompt-tester`. See `src/lib/ranking.ts` and `src/app/api/recommend/route.ts`.

## Stack

- **Next.js 16** (App Router) and **React 19**
- **TypeScript**, **Tailwind v4**
- **Supabase** (Postgres, Auth, RLS) for data and users
- **Anthropic SDK** (Claude) for recommendations and for the resource-evaluator that runs on every scraped candidate; **OpenAI SDK** as a fallback
- **Bright Data** (with a custom Playwright-style scraper) for LinkedIn profile enrichment when a user pastes a profile URL
- **Perplexity** for web search when a user types just a name instead of a profile link; **Exa** and **Tavily** are wired in as switchable alternatives for testing
- **Resend** for guide-booking emails (request, approval, calendar link, follow-up) and magic-link sign-in
- **PostHog**, **Sentry**, **Vercel Analytics**
- Hosted on **Vercel**

## Running locally

```bash
npm install
cp .env.local.example .env.local   # then fill in the values below
npm run dev
```

Required env vars (see `.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

Optional but used by various features:

```
PERPLEXITY_API_KEY=                # web search for profile enrichment
NEXT_PUBLIC_POSTHOG_KEY=           # product analytics
NEXT_PUBLIC_POSTHOG_HOST=
NEXT_PUBLIC_SENTRY_DSN=            # error reporting
ADMIN_PASSWORD=                    # gates /admin
```

If Supabase is not configured, the app falls back to the seed list in `src/data/resources.ts` and most things still work.

To populate a fresh Supabase from the seed file:

```bash
npm run seed
```

## Project layout

```
src/
  app/
    page.tsx                # Three-card landing
    about/                  # About page
    browse/                 # The full filtered directory
    questions/              # Guided two-question flow
    profile/                # Profile-based personalised flow
    communities/            # Communities directory
    events/                 # Events directory
    programs/               # Programs (courses, fellowships, grants)
    letters/                # Open letters and pledges
    skolegang/              # Danish landing for skolegang.dk
    futurebriefing/         # Three-variant landing for @futurebriefing
    [slug]/                 # Creator pages (and referral fallback)
    developers/             # Public API documentation
    submit/                 # Submit a resource
    auth/                   # Magic-link and LinkedIn OAuth
    dashboard/              # Guide and creator dashboards
    admin/                  # Admin: resources, pipeline, prompts, costs
    api/
      recommend/            # POST: rank resources for a user with Claude
      v1/communities/       # Public REST: GET /api/v1/communities
      v1/events/            # Public REST: GET /api/v1/events
      pipeline/run/         # Manually trigger a sync from /admin
      cron/guide-followups/ # Daily Vercel cron
      enrich/               # Profile enrichment from a URL
      auth/                 # Magic-link, LinkedIn callback
      og-image/             # Dynamic OG images for guide profiles
      ...
  components/
    funnel/                 # The user-facing flow (questions, profile, results)
    results/                # Resource and guide cards
    public/                 # Browse and submit
    admin/                  # Resource editor, category pages
    providers/              # PostHog, auth context
    ui/                     # Shared primitives
  data/
    resources.ts            # Seed resources for dev / fallback
    questions.ts            # The two guided questions
  lib/
    ranking.ts              # Scoring and diversified selection
    prompts.ts              # Prompt templates and versioning
    llm.ts                  # Claude / OpenAI wrapper with usage logging
    enrich.ts               # Profile enrichment orchestration
    linkedin-scraper.ts     # LinkedIn via Bright Data + Playwright
    geo.ts, email.ts, ...
  types/index.ts            # Resource, Variant, UserAnswers, etc.

scripts/
  gatherers/                # One file per source: aisafety.com, BlueDot,
                            # EA Forum + LessWrong, Eventbrite, Luma, Meetup
  lib/                      # Pre-filter, candidate inserts, time estimation
  evaluate-event.ts         # LLM evaluator: candidate -> approve/reject
  evaluate-community.ts     # Same, for communities
  sync-events.ts            # Gather + evaluate + promote events
  sync-communities.ts       # Gather + evaluate + promote communities
  sync-programs.ts          # Programs from Airtable
  sync-all.ts               # Local "run everything" wrapper
  ...

supabase/migrations/        # SQL migrations, run in order
.github/workflows/
  sync-pipelines.yml        # Cron: re-runs scrapers every 2 days
```

## Pipelines

The directory keeps itself fresh through a set of scripts that run on GitHub Actions every two days (`.github/workflows/sync-pipelines.yml`):

1. **Gather** new candidates from each source (`scripts/gatherers/`)
2. **Pre-filter** with cheap heuristics (URL, language, obvious junk)
3. **Evaluate** each candidate with Claude Haiku, which returns approve/reject + extracted fields (location, time commitment, tags, dates)
4. **Promote** approvals into the `resources` table; reject duplicates and dead links
5. **Clean up**: standardise country names, penalise inactive items

Run the whole thing locally with:

```bash
npm run sync
```

A separate Vercel cron (`vercel.json`) runs `/api/cron/guide-followups` daily to nudge people who booked guide calls.

## Public API

`/api/v1/communities` and `/api/v1/events` return the full directory as JSON or CSV. No auth, 100 req/min/IP. Full docs (with a live playground) at [howdoihelp.ai/developers](https://howdoihelp.ai/developers).

```bash
curl https://howdoihelp.ai/api/v1/events?location=London
curl https://howdoihelp.ai/api/v1/communities?format=csv -o communities.csv
```

## Guides

Guides are people already working in AI safety who volunteer 30-minute video calls to help others entering the field. The recommender can surface a guide alongside resources when there's a strong fit on background, location, topics, or career stage.

Each guide controls how they appear:

- **Topics, best-for, not-a-good-fit** in their own words, used by the LLM matcher
- **Geographic preference**: anywhere, same country, same timezone, or same city
- **Availability**: unlimited, one call only, or a per-week / per-month cap (recommendations stop once they're at capacity)
- **Booking mode**: `direct` sends the requester straight to the guide's calendar link, or `approval_required` emails the guide first with the requester's profile and message; on approve the calendar link goes back to the requester

The flow uses Resend for the request notification, the calendar-link reply, and a daily Vercel cron (`/api/cron/guide-followups`) that nudges one-call-mode guides if they want to stay listed. See `src/app/api/recommend/route.ts` for matching, `src/app/api/guide-request/route.ts` for the booking flow, and `/auth/login` to sign up as a guide.

## Custom landing pages

Anyone signed in can build a landing page at `howdoihelp.ai/their-slug` with their own intro, custom questions, pinned or excluded resources, and choice between a ranked or browse-style results view. The page renders with the same recommender underneath, so creators don't have to maintain their own data. A few are running in production with creators we've collaborated with. See `src/app/[slug]/page.tsx` and `src/components/funnel/creator-flow.tsx`.

## Submitting a resource

Anyone can suggest a community, event, program, or letter at [howdoihelp.ai/submit](https://howdoihelp.ai/submit). Submissions land in `pending` status and are reviewed before going live.

## Contributing

Issues and pull requests welcome. The codebase is small enough to read end to end in an afternoon. Good places to start:

- Add a new gatherer in `scripts/gatherers/` for a source we're missing
- Improve the ranking heuristics in `src/lib/ranking.ts`
- Add a new question or position type in `src/data/questions.ts` and `src/types/index.ts`
- Sharpen the prompt at `/admin/prompt-tester` (changes are versioned in `prompt_versions`)

## License

MIT. Built by [Noah Lloyd Robson](https://noahlr.com). Questions: n@noahlr.com.
