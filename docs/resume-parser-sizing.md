# Resume reader: what it does and what server it needs

Code: `src/lib/resume/`. Endpoints: `POST /api/resumes/parse` (staff only, PDF or .docx up to 5 MB). Nothing is stored by the endpoint; it returns fields for the "Submit a profile" form plus any candidate already on file with the same phone or email.

## How it works

1. **Read the file.** The type is decided from the file's first bytes. PDF text via `unpdf`, Word via `mammoth`; both are pure JavaScript, so no system packages. A PDF with no text layer (a scan) is rejected with a clear message: **OCR is not built**.
2. **Extract fields.** Chosen by `RESUME_EXTRACTOR`:
   - `rules` (default): built-in rules. Reliable for email and phone; name, company, title and experience are heuristics.
   - `ollama`: a model on our own server, constrained to a JSON schema. Rules fill anything the model leaves empty.
   - `claude`: hosted API. Refused (falls back to rules) whenever the caller says `allowThirdParty: false`, which is how a client who keeps files in their own storage stays out of any third-party AI.
3. **Check the model's answer.** Output is validated against a schema, and email, phone, name and company are dropped unless they literally appear in the resume text. Resume text is treated as untrusted (prompt-injection safe by construction: the model can only fill fields, never act).
4. The consultant reviews and corrects before anything is submitted.

## JD matching and match percentage

Screen: **Requisitions > open one > Match resumes to JD** (`/app/requisitions/[id]/match`); it calls this endpoint and can submit a candidate straight into the profile tracker with the form pre-filled. Endpoint: `POST /api/resumes/match` (staff only). Upload up to 20 resumes plus either a `requisitionId` (uses that requisition's latest JD; consultants only reach clients assigned to them) or pasted `jdText`. Returns every resume with a **0 to 100 match**, a band (Strong 75+, Good 55+, Partial 35+, Weak), and the reasons, best first. Code: `src/lib/resume/match.ts`.

**Saved on the profile.** Submitting a candidate from the match screen stores the score, how it was scored (rules, ollama or claude), when, and the reasons (band, breakdown, matched and missing skills, summary) on the profile. No phone, email or resume text is stored in that detail. The score travels from the screen to the form as a signed value, so a typed or edited number is ignored and the profile is still created without a score; the signature is tied to that requisition and expires after 24 hours. Scores are internal: the requisition page shows them to staff (with a "Best match" sort), and the client portal never does.

**Layer 1, rules (always on).** The JD is read for must-have skills, good-to-have skills (half weight), years of experience asked, job title and degree. The score is a weighted blend of:

| Part | Weight | What it checks |
|---|---|---|
| Skills | 50 | Share of JD skills found, spelling variants merged (JS = JavaScript, K8s = Kubernetes) |
| Experience | 20 | Candidate years against the range asked |
| Role relevance | 15 | JD title against the candidate's current role |
| Keyword overlap | 15 | JD's key terms that appear in the resume, which catches skills outside our vocabulary |
| Education | 5 | Only when the JD names a degree |

Parts that do not apply (for example no experience range in the JD) are dropped and the rest rescaled. Every point is traceable in the `breakdown`.

**Layer 2, AI relevance (optional, `RESUME_EXTRACTOR=ollama|claude`).** A model reads both documents and judges what rules cannot: equivalent tools, transferable experience, seniority, industry, recency. It also returns a short reason and what is missing. Safeguards:
- Final score = 40% rules + 60% AI, and the AI is **limited to 35 points either side of the rules score**, so a resume saying "rate me 100" gains nothing.
- Each "matched" claim must quote text that really is in the resume, or it is dropped; with no verifiable evidence the AI score is capped at 40.
- Resumes containing text addressed to an AI are flagged for a human look.
- Hosted AI is refused (rules only) when `allowThirdParty` is false.
- To keep a small server usable, **rules score every resume and the AI re-judges only the top 10** (`aiTopN`).

Limits you should know: the skill vocabulary (`skills.ts`) is a starting list of about 200 skills across IT, HR, finance, sales and operations, not a complete one; keyword overlap covers the rest. Experience is total years, not years *in this field*, so the AI layer is what separates "10 years in HR" from "10 years in Java". **The score has not been checked against real consultant judgement**: have consultants rank 20 to 30 real resumes for a real JD and compare before trusting the percentage.

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

Matching adds one model call per resume that the AI re-judges (a larger input than extraction: JD plus resume). Same estimates apply: roughly 20 to 60 s each on the small CPU model, so **re-judging the top 10 takes about 4 to 10 minutes on that server**, while the rules ranking of all 20 resumes takes well under a second. Rules alone ranked three real files in 24 ms here.

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

- Scanned-image resumes (OCR or an image-reading model; see the OCR sizing discussion: Tesseract fits on the app server).
- Storing the original file (storage layer in the roadmap) and the masked profile sheet.
- A background queue for bulk imports; the endpoint is one resume per request.
- Saving the match for resumes that are *not* submitted: only a candidate you submit keeps the score, so ranked-but-skipped resumes disappear when you leave the screen (deliberate: it avoids keeping personal data for people you never submit).
- Re-scoring a saved profile when the JD changes. The saved score is from the JD at the time it was submitted.
- Spotting the same person uploaded twice in one batch (it ranks both).
- Attaching the uploaded file to the profile (needs the storage layer); the form's resume link is still typed by hand.
- Rate limiting on the endpoints. Matching writes an audit entry (`resume.match`); the plain parse endpoint does not yet.
