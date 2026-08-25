# Deliverability Monitoring Integration Contract

## Current implementation

FR-8.11 now has a server-only backend foundation:

- `src/lib/notifications/deliverability.ts` contains pure DNS assessment,
  provider-outcome aggregation, and health classification.
- `src/lib/notifications/deliverability-server.ts` resolves live DNS and reads
  aggregate inputs from `notification_jobs` through the service-role client.
- `src/lib/notifications/deliverability-access.ts` enforces the approved active
  `Audit Log View` boundary independently of role names.
- `/admin/deliverability` is the read-only aggregate consumer; the audit-log
  screen links to it for authorized security operators.
- `src/lib/notifications/deliverability.test.ts` covers authentication states,
  rate calculation, small-sample handling, warnings, critical limits, and
  configurable thresholds.
- `src/lib/notifications/deliverability-access.test.ts` covers allowed,
  unrelated-permission, pending, deactivated, and missing-user cases.

The authorization decision was approved on 22 August 2026: only active users
holding `Audit Log View` may view the aggregate deliverability report. This is
permission-based, not a hardcoded Admin role-name check. The service-role query
is institute-scoped before aggregation and selects no recipient-level columns.

## Server configuration

```dotenv
RESEND_FROM_EMAIL="PlacementOS Notifications <notifications@mail.iitiimcareers.in>"
RESEND_SENDING_DOMAIN=mail.iitiimcareers.in
RESEND_DKIM_SELECTOR=
```

`RESEND_SENDING_DOMAIN` is optional when the domain can be derived from
`RESEND_FROM_EMAIL`. `RESEND_DKIM_SELECTOR` must match the selector actually
published for the provider; it is never guessed.

## Monitoring semantics

### Authentication

- SPF fails when absent or when multiple `v=spf1` policies exist.
- DKIM accepts a provider TXT or CNAME record at the configured selector.
- DKIM is `unconfigured`, not falsely failed, when no selector was supplied.
- DMARC fails when absent or malformed, warns for monitoring-only `p=none`,
  and passes for `p=quarantine` or `p=reject`.
- Temporary resolver errors are reported separately from missing records.

### Provider outcomes

The trend calculator consumes current `notification_jobs` states and returns
daily plus summary totals for attempted, delivered, bounced, complained,
delayed, and failed deliveries. Queued, blocked, scheduled, cancelled, **and
failed** jobs do not enter the attempted denominator — bounce/complaint rate
is meant to reflect how recipients reacted to mail that actually reached
their provider, not our own send-pipeline success rate (a `failed` job may
never have reached Resend at all, or may have via the `email.failed` webhook;
either way it's a different signal from a delivered-then-bounced message).
`failed` is still counted and returned as its own metric — just not folded
into `attempted`. See `calculateDeliverabilityTrend`'s existing test
("computes summary and chronological daily provider outcomes") for the
exact expected split.

The default health classifier uses Resend's published account limits:

- Bounce critical at 4%; warning at 2%.
- Complaint critical at 0.08%; warning at 0.04%.
- No classification before 25 provider attempts.

The warning values and minimum sample are PlacementOS operational guardrails;
the critical values come from Resend. All thresholds are function parameters,
so a provider or policy change does not require rewriting aggregation logic.

Primary references checked 22 August 2026:

- Resend account limits: https://resend.com/docs/knowledge-base/account-quotas-and-limits
- Resend suppressions: https://resend.com/docs/dashboard/emails/email-suppressions
- Gmail sender requirements: https://support.google.com/mail/answer/81126

## Approved authorization contract

The approved viewer boundary is Admin/security users through the `Audit Log
View` Permission Set. The route must obtain `getCurrentUserContext()`, require
an active caller with that Permission Set before invoking the service-role
function, and return aggregates only—never recipient addresses, subjects,
bodies, provider identifiers, or individual job rows. `Reports & Export`,
`Reports - View Only`, and `CRM/Outreach` do not grant access by themselves.

## UI acceptance criteria

- Show the checked sending domain and timestamp.
- Show SPF, DKIM, and DMARC separately; do not reduce authentication to one
  unexplained green/red indicator.
- Distinguish missing DNS from resolver failure and missing selector.
- Show attempted sample size next to percentage rates.
- Label fewer than 25 attempts as insufficient data, not healthy.
- Explain that Gmail does not reliably emit complaint events through providers;
  the complaint rate is not a complete Gmail spam-rate substitute.
- Do not expose a button that changes DNS, Resend settings, suppressions, or
  notification jobs; this implementation is read-only monitoring.
- Never display secrets or raw DNS configuration environment values beyond the
  public domain and selector-derived record name.

## Remaining validation

1. Configure the actual Resend DKIM selector.
2. Run the live DNS assessment against the verified sending domain.
3. Validate rates against Resend's Metrics dashboard after a controlled pilot.
