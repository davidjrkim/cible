# Larissa Schneider

Backend / data-pipeline engineer, 8 years. Munich.
larissa.s@example.com · github.com/lschneider

## Experience

### Senior Engineer, Datadog (Logs Pipeline) (2021 — present)

- Operate our Kafka-backed log ingestion path; pipeline ingests ~9PB/day across regions
- Built a token-bucket-per-customer-per-organization rate limiter that fixed a recurring head-of-line blocking incident; p99 customer-perceived latency dropped from 3.2s to 280ms during high-cardinality bursts
- Wrote our cardinality-control service (Python on top of Redis ZSET sketches); rejects high-cardinality tag explosions before they reach storage
- Co-authored the engineering blog post "How we cap a noisy neighbor at 50M events/min"

### Software Engineer, NewRelic (2017 — 2021)

- Worked on the metrics ingestion pipeline (Scala on top of Kafka Streams)
- Built the schema-registry compatibility checker that catches breaking Avro changes pre-deploy

## Skills

Python, Rust (production exposure, ~12 months), Scala, Kafka (Streams, plain consumers, producers), Redis, Postgres, Prometheus, back-pressure / quota design, p99 tail analysis

## Education

M.Sc. Informatik, RWTH Aachen, 2017
