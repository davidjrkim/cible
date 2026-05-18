# Backend Engineer — Replicate

**Company:** Replicate
**Location:** Remote
**About:** Replicate runs ML models in the cloud. You give us a model and a `cog.yaml`, we give you an HTTP endpoint.

## What you'd do

- Work on our cold-start optimization: ML models take time to load (sometimes 5+ minutes). Cutting that is a major source of customer value.
- Build internal tooling around our GPU scheduler (Go) that places jobs across our heterogeneous GPU fleet (A100, H100, L40S)
- Improve the public API (Python and Node SDKs)
- Investigate weird CUDA / driver / NCCL issues. Yes, you will read NVIDIA changelogs.

## Requirements

- 4+ years backend engineering
- Strong Python and Go (or willingness to learn Go quickly)
- Comfort with containers — image layers, OCI, registry plumbing
- You have at least one battle scar from CUDA / NVIDIA driver / cuDNN version mismatch

## Bonus

- You've operated a GPU fleet
- You've contributed to an inference engine (vLLM, TGI, MLC, llama.cpp, etc.)
