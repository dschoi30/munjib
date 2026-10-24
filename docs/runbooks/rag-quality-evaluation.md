# RAG quality evaluation

Issue #248 adds an **offline, synthetic-data evaluation harness** for the actual Ask AI and Workspace AI services. Production routes do not start evaluation capture or call a judge. Production Langfuse's metadata allowlist is unchanged.

## Prepare an isolated environment

Use Node 22, the repository's pnpm version, a migrated pgvector database **reserved exclusively for evaluation**, Ollama with `bge-m3` (1024 dimensions), and a configured generation provider. The CLI does not migrate or reset your database. Never point the evaluation or existing test suites at the same DB while they run concurrently.

```bash
pnpm install --frozen-lockfile
pnpm db:generate
export RAG_EVAL_ENVIRONMENT=evaluation
export NODE_ENV=test
export RAG_EVAL_DATABASE_URL='postgresql://evaluation:password@localhost:5432/munjib_rag_eval'
# Apply only to this dedicated DB; do not reuse a production DATABASE_URL.
DATABASE_URL="$RAG_EVAL_DATABASE_URL" pnpm exec prisma migrate deploy
DATABASE_URL="$RAG_EVAL_DATABASE_URL" pnpm db:rag:index

export RAG_EVAL_CHAT_PROVIDER=openai-compatible
export RAG_EVAL_CHAT_MODEL='your-generation-model'
export RAG_EVAL_EMBED_BASE_URL='http://localhost:11434'
export MUNJIB_OPENAI_COMPATIBLE_BASE_URL='https://your-provider.example/v1'
export MUNJIB_OPENAI_COMPATIBLE_API_KEY='your-generation-key'

export RAG_EVAL_JUDGE_PROVIDER=openai-compatible
export RAG_EVAL_JUDGE_MODEL='your-judge-model'
export RAG_EVAL_JUDGE_BASE_URL='https://your-judge.example/v1'
export RAG_EVAL_JUDGE_API_KEY='your-judge-key'
```

The DB name must be `munjib_rag_eval` or `munjib_rag_eval_<lowercase-alphanumeric>`, the schema must be public, and production NODE_ENV is rejected. Every case creates an ownership-marked organization, user, workspace and documents; cleanup deletes only that fixture. Existing data is never reset. Interrupted processes may leave ownership-marked fixtures for an operator to inspect; do not broadly delete data by prefix.

Use Ollama generation with `RAG_EVAL_CHAT_PROVIDER=ollama` and a model installed at the explicit embedding endpoint, or OpenAI with `RAG_EVAL_CHAT_PROVIDER=openai` plus the existing `MUNJIB_OPENAI_*` provider configuration. Judge supports Ollama and OpenAI-compatible endpoints. Configuration must be exported explicitly; the CLI does not load `.env.local`.

## Execute

```bash
pnpm rag:eval --validate
pnpm rag:eval --mode retrieval --dataset core-ko-v1 --index warm
pnpm rag:eval --mode e2e --dataset core-ko-v1 --index warm --judge configured
pnpm rag:eval --mode e2e --judge configured --case ko-26 --case ko-28
pnpm rag:eval --mode retrieval --index cold --case ko-01
pnpm rag:eval --mode retrieval --index stale --case ko-30
```

`warm` fully indexes readable documents before service preparation; source-identical embeddings are cached in-memory within the run. `cold` relies on real request backfill for readable documents. Authorization-probe documents are always pre-indexed independently of the evaluated principal so missing retrieval filters are detectable. `stale` warms the index and changes the selected document's saved timestamp before service preparation. These tracks are distinct and cannot be compared as the same index condition. Ask does not use embeddings.

The evaluator seeds authentic user membership and document grants and uses service authorization. Workspace uses the actual streaming service and final normalized answer; HTTP route admission/quota remains covered by the existing route tests rather than being bypassed via a special public evaluation endpoint.

The shipped synthetic corpus has 40 proposed labels: 30 Workspace and 10 Ask. Cases include topic switches, anaphora, selection, multiple documents, no/partial evidence, restricted documents, a prompt-injection document, and long direct context. First 10 are calibration candidates; no human calibration is claimed. A small corpus makes global recall@60 easy to saturate: inspect recall@5 and each case, and expand the labeled corpus before treating the mean as a production quality estimate.

## Scores and failure semantics

- `retrieval_recall_at_5/12/60`: gold evidence groups covered by global search. Overlap is deduplicated; split source intervals can cover a quote together.
- `merged_evidence_recall` and `prompt_evidence_recall`: evidence in merged candidates and actual capped prompt, respectively. Ask uses `context_evidence_recall` and marks vector metrics N/A.
- `faithfulness`: supported atomic claims / verifiable claims, using only actual saved context. Judge evidence IDs/quotes must exist in that context. No-claim refusals are N/A, not 1.
- `answer_relevance`: 0, 0.5 or 1 against the latest user question; history only resolves references.
- `insufficient_evidence_handling`: expected behavior for sufficient/partial/absent/ambiguous context. Unsupported assertions and refusing a sufficient context fail. Unsupported-answer and false-abstention rates are also recorded.

Generation/judge/timeout errors and N/A are not imputed as quality scores. Reports show valid N, errors, case completion, categories, and forbidden evidence. An index failure on current main aborts preparation and is recorded as a pipeline error; the pre-plan behavior that silently ignored indexing failure is no longer current.

Rubric v2 explicitly classifies lack-of-evidence notices as abstained (not answered) and excludes those notices from factual claims; requests for a missing referent are classified as clarified. Judge parsing/evidence validation has at most one corrective retry. Disagreement requires review; the judge is not ground truth. A separate judge model is recommended, and the report flags use of the same generation/judge model.

## Limits and reports

Defaults: sequential cases, 120 seconds per case, 30 minutes per run, 1,024 generated output tokens, at most two 2,048-token judge calls per case, 1,000,000 conservatively reserved input/output tokens. Override with `RAG_EVAL_CASE_TIMEOUT_MS`, `RAG_EVAL_RUN_TIMEOUT_MS`, `RAG_EVAL_MAX_OUTPUT_TOKENS`, and `RAG_EVAL_TOKEN_BUDGET` within the CLI bounds. Reservation uses one token per input character plus prompt/output overhead; it is a conservative cap, not a cost or provider-usage measurement. Unknown provider usage is left unknown. Monetary cost cannot be inferred without a verified pricing table.

`test-results/rag-eval/<runId>/report.json` contains local snapshots and judge reasons. `report.md` contains sanitized summaries. Both are gitignored. Git SHA, tracked diff hash, dataset/corpus/config/rubric identifiers make comparisons auditable. Commit source before producing a release baseline; an untracked source file is not covered by the tracked diff hash.

```bash
pnpm rag:eval:compare --baseline <baseline-report.json> --candidate <candidate-report.json>
pnpm rag:eval:calibrate --report <report.json> --labels <human-labels.json>
```

Comparisons require identical case sets, corpus, rubric, mode and index condition. Per-case regressions are advisory. Forbidden evidence, increased errors or lower valid coverage are hard failures. Model quality thresholds remain advisory until reviewed labels and repeated runs justify gating.

Human-label format:

```json
[{"caseId":"ko-01","relevance":1,"behavior":"answered","reason":"Human reviewer rationale"}]
```

Only calibration-split cases with judge outputs are accepted. The helper reports exact relevance/behavior agreement; fewer than 10 cases or agreement below 80% is not eligible for a gate. This does not validate faithfulness automatically; review claim/evidence judgments separately. Do not manufacture human labels from judge outputs.

## Langfuse score-only export

The evaluation adapter pins `@langfuse/client` 5.4.1 to match the existing 5.4.1 tracing packages. It uses an independent BasicTracerProvider with a scope allowlist and no global instrumentation. Raw question/context/answer/claim/reason text is never an API or OTel payload. Only synthetic case IDs, versions, status and numerical scores are exported.

```bash
export RAG_EVAL_LANGFUSE_BASE_URL='https://your-langfuse.example'
export RAG_EVAL_LANGFUSE_PUBLIC_KEY='your-evaluation-project-key'
export RAG_EVAL_LANGFUSE_SECRET_KEY='your-evaluation-project-secret'
pnpm rag:eval --mode e2e --judge configured --publish-langfuse
# Republish an existing local result without paying for model calls again:
pnpm rag:eval --publish-report test-results/rag-eval/<runId>/report.json
```

Use a separate evaluation project or the development project with the `evaluation` environment, never production project keys. Dataset items contain `caseId` only and cannot replay original questions in the UI. Use the local runner for evaluation. Score IDs and trace IDs are deterministic for run/case/metric/rubric; a retransmission updates the same logical results. A new evaluation execution gets a new run ID.

The adapter flushes, then checks observation and score read visibility through modern APIs. A transport acknowledgment alone is not called success. Failed upload preserves local results, marks publish_failed and exits nonzero. In Langfuse, open Datasets, select `munjib-rag-eval-<dataset>-<corpus-hash>` and the run name from the report; compare score columns and case IDs. Consult local snapshots for content.

## CI

The ordinary test job discovers deterministic evaluation tests through the existing Vitest pattern. `.github/workflows/rag-evaluation.yml` is a manual workflow with an ephemeral pgvector DB, explicit provider secrets, numeric case limit and optional publishing. It uploads only sanitized Markdown summaries, not raw report JSON. Provider secrets/variables listed in that workflow must be configured before dispatch; they are not installed by this PR. No scheduled evaluation or automatic deployment gate is enabled.

## Verification record

See the PR and `wiki/RAG Quality Evaluation.md` for the final test counts, synthetic baseline and real Langfuse verification. These measurements apply to the synthetic corpus and explicit models; they do not establish production answer accuracy.
