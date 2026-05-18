# Yusuf Demir

Distributed systems engineer, 8 years. Istanbul.
yusuf.d@example.com · github.com/ydemir

## Experience

### Senior Engineer, Trendyol (2021 — present)

- Built and operate our internal durable-workflow platform on top of Temporal (~12k workflows/sec across 4 clusters)
- Debugged a split-brain in our Cassandra ring after a network partition; root-caused to misconfigured `hinted_handoff_throttle_in_kb`. Wrote internal postmortem still used in onboarding
- Built an event-sourced order-state-machine service in Go; replaced the previous Kafka-Streams-based pipeline that was non-deterministic under replay

### Engineer, Hazelcast (2017 — 2021)

- Worked on Hazelcast's Raft implementation for the CP subsystem
- Wrote a Jepsen-style test suite for our linearizable map — caught two real bugs

## Skills

Go, Java, distributed systems (Raft, Paxos, vector clocks), Temporal (operator + contributor), Cassandra (operator), Kafka, etcd, gRPC, Prometheus, Jaeger / OpenTelemetry, Jepsen-style testing

## Open source

- 3 merged PRs to Temporal Go SDK
- 5 merged PRs to Hazelcast OSS

## Education

M.Sc. Computer Engineering, METU, 2017
