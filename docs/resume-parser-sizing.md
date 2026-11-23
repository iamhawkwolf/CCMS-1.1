# Resume reader: what it does and what server it needs

Code: `src/lib/resume/`. Endpoint: `POST /api/resumes/parse` (staff only, PDF or .docx up to 5 MB). Nothing is stored by the endpoint; it returns fields for the "Submit a profile" form plus any candidate already on file with the same phone or email.

## How it works

1. **Read the file.** The type is decided from the file's first bytes. PDF text via `unpdf`, Word via `mammoth`; both are pure JavaScript, so no system packages. A PDF with no text layer (a scan) is rejected with a clear message: **OCR is not built**.
2. **Extract fields.** Chosen by `RESUME_EXTRACTOR`:
   - `rules` (default): built-in rules. Reliable for email and phone; name, company, title and experience are heuristics.
   - `ollama`: a model on our own server, constrained to a JSON schema. Rules fill anything the model leaves empty.
   - `claude`: hosted API. Refused (falls back to rules) whenever the caller says `allowThirdParty: false`, which is how a client who keeps files in their own storage stays out of any third-party AI.
3. **Check the model's answer.** Output is validated against a schema, and email, phone, name and company are dropped unless they literally appear in the resume text. Resume text is treated as untrusted (prompt-injection safe by construction: the model can only fill fields, never act).
4. The consultant reviews and corrects before anything is submitted.

## Measured here (rules path only)

On a small sandbox, a one-page PDF and a one-page .docx each parsed in **110 to 180 ms**, and a bare Node process that had parsed all four test files sat at about **150 MB RAM**. That is CPU on one core for a fraction of a second, so the rules path adds no server of its own.

Real resumes are messier than the two test files. **Accuracy on real Indian resumes has not been measured**; collect 50 to 100 real ones (with consent) and score the fields before relying on it.

## Server sizing

Figures for the AI rows are **estimates from how quantised open models generally behave on CPU, not measurements**. Test on the server you actually pick before committing.

| Option | Server | Per resume | Throughput | Extra cost |
|---|---|---|---|---|
| **Rules only** | Same box as the app. 2 vCPU, 4 GB RAM runs app + Postgres + parser | about 0.2 s | thousands per hour | none |
| **Self-hosted small model** (about 3B parameters, e.g. Qwen2.5-3B or Gemma-3-4B, 4-bit) | Its own **4 vCPU, 8 GB RAM**. The model takes about 2 to 3 GB resident; the rest is the OS and context | roughly 20 to 60 s on CPU | about 60 to 180 per hour, one at a time | server rental only |
| **Self-hosted mid model** (7 to 8B, 4-bit) | **8 vCPU, 16 GB RAM**, or a GPU box with 12 to 24 GB VRAM | 1 to 2 min on CPU; a few seconds on GPU | CPU: about 30 to 60 per hour | GPU servers cost many times a plain VPS |
| **Hosted Claude** | No extra server | 2 to 5 s | limited by API rate limits | per-resume API fee (see current pricing); needs a privacy-policy line |

### What this means for a consultancy

- Day to day (tens of resumes a day, uploaded one by one): the **small CPU model is enough**, or just rules.
- Bulk import (say 1,000 old resumes): rules finish in a few minutes; a small CPU model takes **roughly 6 to 17 hours**; a GPU or hosted API takes minutes. Run bulk imports through the job queue overnight, or use rules for the first pass.
- `OLLAMA_CONCURRENCY` defaults to 1. Raising it on a CPU box only makes every resume slower; it needs more RAM and cores, not just a setting.
- Keep the model loaded (`OLLAMA_KEEP_ALIVE`, default 30 m). A cold start adds 10 to 30 s.

### Recommendation

1. **Start with `rules` on the single app server** (2 vCPU / 4 GB, Mumbai region). Cost: nothing extra.
2. Measure accuracy on real resumes. If names, companies or experience are wrong often enough to annoy, add **one 4 vCPU / 8 GB server running Ollama** (private network only, never exposed publicly) and set `RESUME_EXTRACTOR=ollama`.
3. Use `claude` only for clients who have agreed to it, or if volume or accuracy makes self-hosting not worth the upkeep.

Do not run the model on the same small box as Postgres and the app: a model load can push the machine into swap and stall everything else.

## Not built yet

- Scanned-image resumes (OCR or an image-reading model).
- The upload button and pre-filled form on the profile screen (the endpoint returns fields shaped like `ProfileInput`).
- Storing the original file (storage layer in the roadmap) and the masked profile sheet.
- A background queue for bulk imports; the endpoint is one resume per request.
- Rate limiting on the endpoint, and an audit log entry per parse (DPDP access logging).
