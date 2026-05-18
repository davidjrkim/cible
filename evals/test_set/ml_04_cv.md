# Camille Dubois

ML research engineer, 5 years. Paris.
camille.d@example.com · github.com/cdubois · scholar.google.com/cdubois

## Experience

### Research Engineer, EleutherAI (2022 — present, part-time + Kyutai full-time)

- Co-led the pretraining of an internal 13B-parameter model from scratch on 1.4T tokens (Megatron-LM + DeepSpeed ZeRO-3 across 512x H100)
- Built the data-quality pipeline: language-id filtering, MinHash deduplication, perplexity-based quality scoring, mixture-ratio sweeps
- Ran a controlled study on data mixture (code vs. web vs. books) and presented findings internally; portions later in an EleutherAI blog post
- Co-authored a NeurIPS workshop paper on data-mixture scaling laws (2024)

### Research Engineer, Kyutai (2022 — present)

- Pretrained a speech-text multimodal model; led the streaming-tokenizer experiments
- Implemented a custom rotary-position-embedding variant for the speech encoder

### ML Engineer, Bloomberg AI (2020 — 2022)

- Worked on the BloombergGPT pretraining data pipeline
- Wrote the financial-domain quality classifier

## Skills

PyTorch (deep), Megatron-LM, DeepSpeed, FSDP, MinHash dedup at scale (Spark + Datasketch), MoE routing variants, attention variants (FlashAttention, paged, sliding-window), tensor + pipeline parallelism, scaling-law experiments

## Selected publications

- "Data mixture scaling laws under fixed compute" — NeurIPS DataPerf workshop 2024 (co-author)
- 2 other workshop papers in the pretraining-data space

## Education

M.Sc. Mathematics + Machine Learning, ENS Paris, 2020
