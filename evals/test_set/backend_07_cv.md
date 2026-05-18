# Ravi Kapoor

ML infrastructure engineer, 7 years. Bangalore.
ravi.k@example.com · github.com/rkapoor

## Experience

### Senior Engineer, Modal Labs (2022 — present)

- Cut cold-start latency for our largest LLM customer by 71% (from 4 minutes to 70 seconds) by pre-warming a custom CRIU-based checkpoint of the model+CUDA-context
- Built the GPU scheduler placement logic in Go that handles A100, H100, and L40S across two clouds. Wrote the spot-reclaim handler that reduced job-restart count by ~40%
- Maintained our OCI image layer cache — wrote an internal CLI that strips and re-packs Python wheels to reduce image pull time
- Debugged a multi-week NCCL hang traced to a kernel driver bug on H100; coordinated with NVIDIA support to ship the fix

### ML Engineer, Determined AI (HPE) (2019 — 2022)

- Worked on the distributed training scheduler in Go
- Wrote the Python SDK that ML engineers use to launch experiments

## Skills

Python, Go, CUDA (intermediate — read the docs, debug kernel issues), Docker / OCI, Kubernetes, NCCL, NVIDIA driver internals (operator level, not kernel), vLLM (contributor)

## Open source

- 4 merged PRs to vLLM
- 2 merged PRs to NCCL test suite

## Education

M.Tech. CSE, IIT Madras, 2018
