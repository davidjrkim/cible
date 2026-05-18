# Hannah Becker

Full-stack engineer, 6 years. Hamburg.
hannah@example.com · github.com/hbecker

## Experience

### Senior Engineer, Postmark (ActiveCampaign) (2022 — present)

- Own the customer-facing dashboard (Next.js + tRPC + Postgres). Shipped the bounce-and-suppression UI rebuild after we noticed customers were filing tickets to read data we already had
- Built the inbound webhook firehose — Node consumer of an internal Kafka topic, ingests ~80M events/day, dedupes on message-id + provider-id
- Wrote our internal SPF/DKIM/DMARC alignment checker; surfaced as a feature ("why is my domain failing?") in the dashboard

### Software Engineer, Mailgun (2019 — 2022)

- Worked on the SMTP relay edge — operated our Haraka-based MTA in production, including the day we ran out of file descriptors on a Sunday
- Built React components for the events explorer; introduced our shared component library that's still in use

## Skills

TypeScript, React, Next.js, tRPC, Postgres, Kafka, SPF / DKIM / DMARC, Haraka, Nodemailer, MJML, React Email (familiar), Datadog

## Open source

- Contributor to Nodemailer (3 merged PRs around DKIM signing edge cases)

## Education

B.Sc. Informatik, TU München, 2019
