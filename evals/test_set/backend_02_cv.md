# Karim Saleh

Backend / systems engineer, 9 years experience. Berlin.
karim.s@example.com · github.com/ksaleh

## Experience

### Staff Engineer, Hetzner Cloud (2021 — present)

- Co-author of our internal VM-orchestration control plane (Go on the API side, Rust on the on-host agent that manages QEMU + Cloud-Hypervisor instances)
- Built our Linux networking stack for VM east-west traffic — iptables → nftables migration across ~12k hypervisors with zero customer-visible incidents
- Used eBPF (bpftrace + custom tools) to diagnose a packet-drop regression that p99 spiked from 200µs to 12ms; traced it to a kernel RPS tunable
- Wrote four engineering blog posts; one ranked #1 on HN for a day

### Senior SRE, SoundCloud (2017 — 2021)

- Operated our Kubernetes fleet across 4 regions. Built the deploy tooling on top of Tekton + Argo
- Owned on-call for ~3 years across two teams; co-wrote the incident-response playbook

## Skills

Rust, Go, Elixir (familiar via personal projects), Linux networking (iptables, nftables, namespaces, BGP), eBPF (bpftrace, libbpf), Firecracker (read the source), QEMU, KVM, Postgres, etcd

## Open source

- Two merged patches in Firecracker (networking edge cases)

## Education

Diplôme d'Ingénieur, Télécom Paris, 2016
