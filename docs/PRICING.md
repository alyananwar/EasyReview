# EasyReview Pricing Strategy

The short version: price at **$49/mo per location, no contract, no setup fee**. Here's why,
and what to do if that turns out to be wrong.

## Where the market actually sits (2026)

Researched via Gemini + public sources. Prices marked \* are best-effort — the big players
don't publish real pricing anymore, they force you into a sales call.

| Product                 | Entry price/mo | What you get                                                         | Confidence                       |
| ----------------------- | -------------- | -------------------------------------------------------------------- | -------------------------------- |
| Podium                  | ~$399–$499\*   | Reviews + inbox + webchat + payments + SMS marketing (full platform) | Low — sales-quote only           |
| Birdeye                 | ~$299–$350\*   | Reviews AI + Listings AI + Messaging AI                              | Low — configurator only          |
| NiceJob                 | $75            | Review requests, monitoring, AI replies, social proof widgets        | High                             |
| Reviewshake             | $29            | 1 location, 3 sources, 250 email invites/mo                          | High                             |
| GatherUp                | $99            | 300 SMS + 3,000 email, NPS surveys, widgets                          | High                             |
| Grade.us                | ~$110\*        | Review funnel, agency-oriented                                       | Low                              |
| Housecall Pro (Reviews) | $59 base plan  | Bundled inside the full field-service CRM                            | High — but you buy the whole CRM |
| ServiceTitan (Reviews)  | $200–$500+\*   | Bundled inside trade CRM, quote-only                                 | Low                              |
| Swell CX                | ?              | Reviews + messaging, per-location                                    | Low — no public pricing          |
| Trustpilot SMB          | ~$259–$399\*   | Invites, widgets, brand profile — B2C-focused                        | Low                              |

Two honest caveats: Podium and Birdeye prices are quote-only and move a lot; verify with a
live demo before citing them to a customer. NiceJob, Reviewshake, and GatherUp are the only
three with truly public pricing.

## The two real complaints customers have about competitors

From scanning Trustpilot, G2, and small-business Reddit threads:

1. **The cancellation trap.** Podium and Birdeye auto-renewal and cancellation behavior
   shows up in review after review. "Called, emailed, and chatted multiple times" is a
   phrase that repeats. Billing continues after cancellation requests, support goes silent,
   customer ends up doing a chargeback.
2. **Forced bundling.** A one-location auto shop does not want a chatbot, a payment
   terminal, a social inbox, and an AI agent. They want: "when I close an invoice in QBO,
   text that customer a Google review link." Every big competitor makes you buy the whole
   platform to get the one feature you actually want.

These are your two selling points, in that order. They are worth more than any feature.

## The EasyReview pitch

> "You close out a work order in QuickBooks. Two minutes later the customer gets a friendly
> text with a link to your Google review page. That's it. $49 a month, cancel anytime,
> we'll be gone from your card within the hour."

If the prospect asks what else it does, the correct answer is "nothing else, on purpose."

## Recommended pricing

| Plan      | Price/mo | What's in it                                                                 | Who it's for                                          |
| --------- | -------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Solo**  | **$49**  | 1 location, up to 40 texts/day, Google review link, QBO sync, live dashboard | A single shop (the default)                           |
| **Multi** | **$89**  | Up to 3 locations, 80 texts/day per location                                 | Owners with a second shop                             |
| **Shop+** | **$149** | Single location, 100 texts/day, custom follow-up message, priority support   | High-volume shops (e.g. bigger salons, used car lots) |

All month-to-month. No setup fee. No annual lock-in. No "talk to sales."

### Why $49 and not $29 or $79

- **$29 triggers "is this even real"** doubt from owners used to paying hundreds. Also makes
  the unit economics unforgiving once you factor in a Google Voice number per shop, occasional
  manual intervention when a session expires, and a few hours of setup time.
- **$79+** stops being a clear win over NiceJob ($75) and starts feeling comparable to
  Podium's sales pitch even though you do one thing. You lose the "obviously cheaper"
  positioning.
- **$49** is below NiceJob/GatherUp, well above the "fake" threshold, and the rough mental
  math for an owner is "one review a month pays for it" — which for an auto shop is true.

### Add-ons to offer only after year 1

Resist these until a customer asks twice:

- One-time setup-done-for-you: $99. Remote setup only — connect QB OAuth, configure Twilio, verify first run.
  This is mostly a signal, not a profit center.
- Second review destination (Yelp, Facebook): +$10/mo. Low effort on your side if you build
  it — easy upsell.
- Branded SMS short code: don't. You'd need a separate short code registration on top of A2P 10DLC.
  Not worth it at this scale.

## Sales anti-pitches (use these verbatim)

When a prospect brings up a competitor, you don't fight on features. You fight on:

- **Contract length.** "Podium is a 12-month contract. We're month to month. You can
  cancel by emailing me."
- **Setup speed.** "Podium takes a week of onboarding calls. We're 20 minutes."
- **Scope.** "Podium will try to sell you five tools. We do one thing. If you need the other
  four, Podium is honestly fine — they're just expensive for what you need."

Do not badmouth competitors beyond factual points. Shop owners talk to each other.

## When to raise prices

The signals you're underpriced:

- Conversion rate above 60% on qualified prospects (you're leaving money on the table).
- Prospects asking "what's the catch" more than twice in the first two weeks.
- Your second and third customer both add a second location within 90 days.

The signals you're correctly priced:

- Conversion around 30–45%.
- Prospects compare you to NiceJob specifically, not Podium.
- Occasional "too much" pushback that resolves when you demo.

## What NOT to do

- **Don't offer a free trial longer than 14 days.** A 30-day free trial is just a free
  month, and setup cost per customer is real for this product (Google Voice session, QBO
  OAuth, optional box at the shop).
- **Don't bundle per-text overages.** Owners hate metered bills. The $49 tier includes the
  daily cap hard-limited at 40, which is enough for any shop under ~400 invoices/week.
  Instead, push high-volume shops up to Shop+ or Multi.
- **Don't price per-user.** You're replacing a task nobody was doing, not a seat.
- **Don't undercut to win deals in the first 6 months.** The unit cost of support is high
  early. Cheap customers are your most expensive customers.
- **Don't sell to franchises yet.** Corporate procurement will eat three months of your life
  for a $400 contract.

## Sanity check

If you close 20 shops at $49 each, that's ~$12K/year ARR — enough to justify the work, not
enough to retire on, which is correct for year one. The goal at this stage is signal (does
any of this work, does churn stay under 5%/mo), not revenue.
