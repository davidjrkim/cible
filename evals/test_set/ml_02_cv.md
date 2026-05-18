# Wei Tan

ML engineer, 5 years. Singapore / remote.
wei.t@example.com · github.com/wtan · huggingface.co/wtan

## Experience

### ML Engineer, Together AI (2022 — present)

- Ported three open-weights models from raw paper code to a `transformers`-compatible implementation (a 7B MoE, a 13B multimodal, an 8B speech model)
- Wrote a fused paged-attention Triton kernel that improved our inference throughput on H100 by 1.7x for prompts >4k tokens
- Contributed kv-cache management improvements upstream to vLLM and speculative-decoding hooks to `transformers`
- Authored two engineering blog posts ranked on the HF blog

### ML Engineer, Cohere (2020 — 2022)

- Worked on the embedding-model training pipeline using FSDP across 64x A100
- Debugged a multi-week ZeRO-3 hang traced to a NCCL allreduce ordering issue

## Skills

PyTorch (deep), Triton (kernel-author level), CUDA (intermediate), FSDP, DeepSpeed ZeRO-{1,2,3}, Megatron-LM (read-the-source), `transformers`, `accelerate`, vLLM, multimodal models (vision + text), MoE architectures

## Open source

- 18 merged PRs to `transformers`
- 6 merged PRs to vLLM (kv-cache management)

## Education

M.Sc. Machine Learning, NUS, 2020
