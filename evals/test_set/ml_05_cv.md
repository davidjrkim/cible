# Brianna Walker

Applied ML engineer, 6 years. Austin.
brianna.w@example.com · github.com/bwalker

## Experience

### Senior ML Engineer, Observe.AI (2022 — present)

- Own the call-summarization model fine-tuning pipeline. LoRA on a 7B base with customer-redacted transcripts; replaced the previous prompt-only summarization that was hallucinating action items
- Built the streaming ASR pipeline on top of Distil-Whisper + custom biased decoding for customer-specific vocab (product names, account IDs). Word-error-rate on the customer-specific vocab subset dropped from 14% to 3.7%
- Built and operates the production eval harness — 800-call rolling window with weekly LM-graded scoring against ground-truth supervisor annotations. Wired into our deploy gate
- Carried the on-call rotation for the inference path (~25 weeks total)

### ML Engineer, Twilio (2019 — 2022)

- Worked on the AutoPilot intent-classification pipeline
- Built the dataset-labeling tooling used by ~10 customer-success engineers

## Skills

PyTorch, HuggingFace `transformers` + `peft`, LoRA / QLoRA / full SFT, Whisper / Distil-Whisper / Conformer, streaming inference, vLLM (production user), eval harnesses with LM judges, distribution-shift monitoring, Triton (inference server, not the kernel language)

## Education

M.Sc. Computer Science, UT Austin, 2019
