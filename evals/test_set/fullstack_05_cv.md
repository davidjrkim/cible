# Tomás Pereira

Full-stack / desktop engineer, 8 years experience. Brooklyn.
tomas@example.com · github.com/tpereira

## Experience

### Senior Engineer, Linear (2022 — present)

- Co-owner of the macOS desktop client (Electron + React). Shipped a refactor that cut idle CPU usage by 60% on the menubar minimap
- Tracked down a 30-second cold-start regression to a synchronous `fs.readFileSync` in our auth refresh path; documented the fix in our internal Electron playbook
- Wrote our Google Calendar two-way sync prototype (later shipped as Linear's calendar integration)

### Software Engineer, Superhuman (2019 — 2022)

- Worked on the calendar event composer. Got intimate with RFC 5545 recurrence rules; wrote our internal RRULE expander after `rrule.js` mis-handled a customer's edge case
- Shipped offline draft sync using a custom CRDT layer over IndexedDB; conflict rate dropped from ~3% to <0.1% during connectivity flaps
- Worked across Electron main and renderer processes; debugged event-loop-blocking issues on weekly basis

## Skills

TypeScript, React, Electron, Node, RFC 5545 (RRULE, VEVENT), Google Calendar API, Microsoft Graph, IndexedDB, CRDTs (Yjs and Automerge), Sentry

## Education

B.Sc. Engineering, IST Lisbon, 2017
