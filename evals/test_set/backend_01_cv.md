# Priya Subramanian

Backend & data infrastructure engineer, 7 years experience. NYC.
priya.s@example.com · linkedin.com/in/priyasub

## Experience

### Staff Engineer, Data Infrastructure, Brex (2021 — present)

- Owned the rebuild of Brex's transaction ingestion path from a single Python monolith to a Kafka + Flink pipeline; brought p99 webhook → ledger latency from 14s to 1.8s
- Designed the exactly-once delivery contract between our card-network adapters and the ledger writer using Kafka transactions and idempotent producer keys
- Operated a 40-node Flink cluster, on-call rotation 1-in-6; led 3 major incident retros, including a 4-hour outage caused by a Flink savepoint corruption that I root-caused and wrote the postmortem for
- Migrated 2.5B historical card events from MySQL to Snowflake using Debezium logical decoding, with zero downtime and no double-counting

### Senior Software Engineer, Stripe (2018 — 2021)

- Backend engineer on Stripe's Radar (fraud) team
- Built the Go service that joins real-time card events with merchant features for the live risk model; held p99 < 80ms at 10k QPS
- Wrote the backfill tool that reprocesses historical events when risk features change

### Software Engineer, Bloomberg (2017 — 2018)

- Two years on the market-data ingestion team, mostly C++ (not relevant for this app)

## Skills

Go, Python, Kafka, Flink, Postgres (logical decoding, replication slots), Snowflake, Debezium, gRPC, Terraform, Datadog, Grafana, PagerDuty

## Education

M.Sc. Computer Science, Carnegie Mellon, 2017
