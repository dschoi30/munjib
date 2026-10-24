> Implementation tracking: issue #248. The approved plan below is preserved as the design baseline; see `docs/runbooks/rag-quality-evaluation.md` for implemented commands and verified limits. Current main has since fixed topic-switch retrieval and now fails closed on index backfill errors.

# RAG 답변 품질 평가 체계 구현 계획

작성일: 2026-10-24 KST
상태: 검토용 계획. 평가 코드·서비스 변경·GitHub issue/PR·배포는 아직 수행하지 않았다.

## 1. 목표와 범위

문집의 실제 Ask AI / Workspace AI 경로에 고정된 평가 질문을 실행하고, 검색 재현율·근거 충실도·질문 적합도·근거 부족 대응을 반복 측정한다. Langfuse는 실험/점수 비교에 사용하고, 원본 평가 자료와 판정 근거는 로컬 보고서로 보존한다.

첫 버전은 공개·합성 데이터와 전용 PostgreSQL/pgvector DB를 사용하는 오프라인 평가 CLI다. 운영 요청에서 평가 모델을 호출하거나 운영 본문을 수집하는 기능은 후속 범위다. 이 작업에서 검색 알고리즘·프롬프트·모델을 동시에 개선하지 않고 먼저 현재 버전의 기준선을 만든다. DB schema migration과 제품 평가 UI는 필요하지 않다.

## 2. 확인한 현재 구조

| 경로/파일 | 현재 동작 | 계획에 주는 제약 |
| --- | --- | --- |
| `lib/rag/ask.ts` | `prepareAskDocumentQuestion()` → `answerPreparedAskDocumentQuestion()` | 실제 인가와 저장 Markdown 문맥 구성을 재사용한다. |
| `lib/rag/document-context.ts` | 질문 기반 문맥 선별, 기본 8,000 token 추정 예산, 긴 문서 부분 포함 | Ask AI에는 벡터 검색 재현율 대신 선택 문맥의 근거 포함률을 적용한다. |
| `lib/rag/workspace-chat.ts` | preflight → 이력/요약 → 색인 보완 → query embedding → global/선택 문서 검색 → merge/우선순위/cap → prompt → 생성 → 인용 정규화/저장 | 원래 질문, 이력이 포함된 검색 질문, 검색 후보, 최종 문맥을 각각 관찰해야 한다. |
| 같은 파일의 상수/내부 함수 | global 후보 60개, 선택 문서 후보 최대 12개, 최종 문맥 최대 12개·문서당 3개, backfill 후보 최대 8개 | global top-60, 최종 prompt 근거 포함률을 분리한다. merge 결과를 단순 top-k 순위로 부르면 안 된다. |
| `lib/rag/vector-store.ts` | 1024차원 cosine distance 검색, readable document ID 제한, `sourceUpdatedAt = Document.updatedAt` 조건 | 실제 DB 검색 평가가 필요하다. 오래된 chunk 제외를 회귀 사례에 포함한다. |
| `lib/rag/chunk-markdown.ts` | heading/block 청킹, 기본 추정 1,000 token/overlap 120, content hash | DB chunk UUID를 gold label로 고정하지 않는다. |
| `lib/rag/prompt.ts` | 외부 지식 금지, 근거 부족 명시 지시, `[n]` 인용·정규화 | 부족 대응은 기존 지시 준수의 평가다. 거절 문구 검색만으로 채점하지 않는다. |
| `lib/rag/ai-observation.ts` | private OTel provider, 본문/식별자를 제외한 metadata allowlist, 단계 관측·usage | 평가 본문을 이 exporter의 metadata에 추가하지 않는다. 현재 `AiObservation`에는 공개 trace ID 접근자가 없다. |
| `lib/rag/langfuse.ts` / `package.json` | opt-in full callback, `@langfuse/langchain`/`@langfuse/otel` 5.x, 평가 CLI script·client 직접 의존성 없음 | 평가 전용 client adapter가 필요하며 최신 SDK 예제를 그대로 복사하면 안 된다. |
| `tests/rag/workspace-chat.test.ts` | DB fixture와 service 테스트가 있지만 embedding/search/generation은 mock | 이 테스트 통과를 실제 검색 재현율/모델 품질 측정으로 보고하지 않는다. |
| `.github/workflows/ci-cd.yml` | GitHub-hosted CI에 pgvector PostgreSQL 있음 | 기존 CI에는 무비용 결정적 검증을 먼저 넣고 외부 모델 평가는 별도 실행한다. |

Workspace AI의 실제 선별은 위 서비스 내부 함수들을 따른다. `lib/rag/retriever.ts`의 별도 scope/rerank 함수를 이 경로에 새로 끼워 넣거나 현재 경로로 오인하지 않는다.

기존 Wiki 진단에는 이력 때문에 backfill 후보가 밀리는 사례, `safeIndexSavedDocument()`의 false를 호출자가 무시하는 경로, embedding 오류 뒤 생성이 계속되는 사례가 기록돼 있다. 이들은 평가 시나리오의 근거이며, 이번 계획에서 새로 운영 장애를 재현하거나 원인을 확정한 것은 아니다.

## 3. 제안 구조

```text
버전 고정 corpus + 질문/gold label
  → 전용 평가 DB에 사용자·권한·저장 문서 seed
  → 실제 청킹·색인·서비스 실행
  → 평가 전용 수집기: 질문/이력, 후보, 최종 문맥, 답변, 단계 상태
  → 결정적 recall 계산 + 별도 judge + 사람 검수
  → 로컬 JSON/Markdown 보고서
  → 선택적 Langfuse experiment/score 업로드
```

평가 수집기는 운영 telemetry와 독립된 서버 내부 타입/명시적 의존성으로 주입한다. HTTP request parameter나 브라우저 설정으로 활성화할 수 없게 한다. 기본값은 미수집이며 raw snapshot을 OTel attribute, Sentry, console에 전달하지 않는다. 운영 route에는 수집기를 연결하지 않는다.

## 4. 지표의 정확한 정의

### 4.1 검색 재현율

Gold는 `documentKey + evidenceId + source quote/range + corpusVersion`으로 표현한다. 관련 근거가 여러 군데 있으면 대체 가능한 구간을 한 evidence group으로 묶는다. 필요한 근거가 서로 다르면 별도 group으로 라벨링한다. hash는 문서 버전 확인에 사용하고, 청킹 변경에도 유지되는 원문 근거 구간을 기준으로 매칭한다.

`recall = 포함된 필수 evidence group 수 / 전체 필수 evidence group 수`

- `retrieval_recall_at_5`, `_at_12`, `_at_60`: Workspace global cosine 검색 순위에서 계산한다. 후보가 k보다 적으면 있는 후보 전체로 계산하며 분모를 줄이지 않는다.
- `merged_evidence_recall`: global + 선택 문서 후보의 합집합에서 계산한다. 전체 순위가 재정렬된 결과가 아니므로 `@k`라고 부르지 않는다.
- `prompt_evidence_recall`: 우선순위·문서별 제한을 적용한 실제 최종 문맥에서 계산한다.
- Ask AI는 `context_evidence_recall`만 계산하고 retrieval 지표는 `not_applicable`로 둔다.
- 한 evidence group이 여러 chunk로 나뉘면 필요한 구간의 합집합을 확인한다. 같은 근거가 overlap chunk에 반복돼도 한 번만 센다. heading/문서 ID 일치만으로 hit를 주지 않는다.
- 충분한 gold 근거가 없는 label은 `unscorable`로 처리한다. 답이 원래 없는 사례에는 recall을 0/1로 만들지 않는다.
- corpus에 정답이 있지만 검색 실패로 문맥이 비면 recall은 0이고, 이후 올바른 부족 응답 여부는 별도 평가한다.

문서 단위 hit는 진단 보조 지표로만 제공한다. 정답 문서의 엉뚱한 chunk가 잡힌 경우를 성공으로 세지 않기 위해서다.

### 4.2 근거 충실도 `faithfulness`

평가 입력은 **모델에 실제 제공된 문맥과 최종 정규화된 답변**이다. 전체 corpus나 기대 답안을 judge에게 제공해 제공되지 않은 근거를 보충하지 않는다. 이력에서 온 사실은 saved document 근거를 대신하지 않는다.

답변의 검증 가능한 주장을 나누고 각 주장에 `supported / unsupported / contradicted`와 제공 문맥의 근거 구간을 반환한다. `supported / 전체 검증 가능한 주장`을 0~1로 계산한다. 인용 번호가 있다는 이유로 supported를 주지 않는다. 인사·순수 부족 안내처럼 사실 주장이 없으면 `not_applicable`로 두고 부족 대응 점수로 평가한다. 빈 답변은 정상 거절로 처리하지 않는다.

Judge가 인용한 evidence ID/quote가 실제 입력에 존재하는지 코드로 검증한다. 본문은 평가 대상 데이터로 구분해 넣고 문서 안의 지시를 실행하지 말라는 rubric을 사용한다. Judge의 판정도 오류 가능성이 있으므로 사람 검수로 보정한다.

### 4.3 질문 적합도 `answer_relevance`

원래 최신 사용자 질문을 주 평가 대상으로 하고, 해석에 필요한 이력/선택 문서 정보만 보조로 준다. 이력과 합쳐진 retrieval query만을 기준으로 채점하지 않는다.

- `1`: 요청한 범위·형식·세부 질문에 직접 대응한다.
- `0.5`: 일부만 답하거나 불필요한 내용 때문에 핵심이 흐린다.
- `0`: 다른 주제/이전 질문에 답하거나 핵심 요청을 놓친다.

근거가 부족한 상황에서 범위를 설명하는 적절한 응답도 관련성 1을 받을 수 있다. 정확성/충실도와 같은 점수로 합치지 않는다. 정답이 있는 질문에 습관적으로 거절하는 경우는 별도의 부족 대응 판정에서 실패한다.

### 4.4 근거 부족 대응 `insufficient_evidence_handling`

두 label을 분리한다: `corpusAnswerability`(권한 내 전체 문서의 답변 가능성)와 `contextSufficiency`(실제로 제공한 문맥의 충분성). 첫 label은 사람이 작성하고, 두 번째는 gold evidence coverage와 사례별 필수 사실로 판정하며 애매하면 검수 대상으로 보낸다.

| 실제 문맥 | 기대 행동 | 실패 예 |
| --- | --- | --- |
| 충분 | 근거에 따라 답변 | 불필요하게 답변을 거절 |
| 부분 근거 | 확인되는 부분만 답하고 부족한 범위를 명시 | 없는 수치/원인을 채워 넣음 |
| 근거 없음 | 근거 부족을 명시하고 필요한 자료/질문을 안내 | 외부 지식이나 이전 대화로 답을 지어냄 |
| 질문 모호 | 필요한 사항을 구체적으로 되묻거나 조건을 명시 | 임의의 대상을 정해 단정 |

기대 행동 준수 1, 위반 0으로 기록하고 `answered / partial / abstained / clarified / fabricated` 분류를 함께 남긴다. `unsupported_answer_rate`와 충분 문맥 사례의 `false_abstention_rate`를 따로 집계한다. 항상 거절하는 모델이 높은 점수를 받지 않게 충분 문맥 사례도 분모에 넣는다.

### 4.5 실패와 집계

- `case_status`: `completed / pipeline_error / judge_error / timed_out / aborted`; `indexing_status`: `complete / degraded / failed / not_applicable`을 별도로 기록한다.
- 서비스가 indexing 실패 후에도 답했다면 completed+degraded로 남기고 그 문맥 기준 품질도 채점한다. 데이터 준비 자체 실패로 실행할 수 없으면 pipeline_error다.
- 모델 호출 실패·judge JSON 파싱 실패·N/A를 품질 점수 0 또는 만점으로 대체하지 않는다. 유효 점수 수, N/A 수, 오류 수, 실행 완료율을 함께 공개한다.
- 완료 사례 평균만 좋아지는 생존 편향을 막기 위해 오류 증가 또는 평가 coverage 감소는 비교 보고서에서 별도 실패 조건으로 다룬다.

## 5. 평가 데이터

첫 corpus는 라이선스가 명확한 자체 합성 한국어 문서로 만들고, 초기 40문항을 권장한다: Workspace 30 / Ask 10. 카테고리는 단일 문서, 다중 문서 종합, 주제 전환/이력, 현재 문서 지칭, 답 없음/부분 근거/모호한 질문, 긴 문서 문맥 누락, 문서 수정/권한 제한을 포함한다. 카테고리는 중복 태깅할 수 있다.

각 case는 `id`, `surface`, `category`, `question`, `selectedDocumentKey`, `history`, `readableDocumentKeys`, `expectedEvidenceGroups`, `requiredFacts`, `corpusAnswerability`, `expectedBehavior`, `language`를 가진다. actor/workspace/document DB UUID는 seed 결과에서 매핑한다.

금지 문서에는 답이 있고 읽을 수 있는 문서에는 답이 없는 사례를 반드시 둔다. 기대 recall 분모는 읽을 수 있는 근거만 사용하고 권한 밖 근거 노출은 별도 hard failure로 처리한다. 원본 전체 corpus를 모델이나 judge의 허용 문맥에 몰래 넣지 않는다.

Judge 보정용 10개와 고정 회귀용 30개를 구분해 rubric 튜닝이 전체 평가셋에 과적합되지 않게 한다. 권한/누출 같은 결정적 hard-failure 사례는 별도 fixture도 둔다.

## 6. 실제 서비스 연결과 실행 모드

### 수집 지점

- Workspace preparation: 원래 질문/검색 질문, backfill 후보와 성공/실패, global/selected 후보, merge 결과, 최종 prompt chunk 및 순서.
- Workspace generation/finalization: 실제 prompt, 모델 raw answer와 인용 정규화 후 최종 answer/citations. 평가 대상은 최종 answer이며 raw answer는 인용 문제 진단용이다.
- Ask preparation/finalization: `buildCurrentDocumentContext()`의 실제 선택 문맥, partial flag, 최종 prompt/answer.
- collector가 없을 때 본문 복사/직렬화 비용을 만들지 않는다. 수집기 예외는 일반 서비스 동작을 바꾸지 않되 평가 runner에는 수집 실패를 알려 coverage 누락을 숨기지 않는다.

현재 private 함수들을 통째로 public export하지 않는다. 우선 서버 내부에서만 optional collector를 전달하는 작은 seam을 추가한다. 평가 snapshot을 얻기 위해 prompt 문자열을 역파싱하거나 검색 로직을 runner에서 복제하지 않는다. `safeIndexSavedDocument()`의 결과를 collector에 전달하는 최소 변경은 가능하지만 서비스의 fallback 정책 변경은 별도 개선 작업으로 둔다.

### 두 실행 트랙

1. `retrieval`: 실제 embedding + pgvector + 최종 문맥 선별만 실행한다. 모델 생성/judge 없이 recall을 계산하고 열린 observation을 종료한다. Workspace preparation 중 이력 요약이 필요한 사례는 명시적 model 예산을 허용하거나 고정된 fixture summary를 사용해 비용/의미를 기록한다.
2. `e2e`: 같은 서비스 preparation → 실제 답변 생성 → 정규화 → judge를 실행한다. Workspace는 제품에서 쓰는 streaming 경로를 기본으로 사용하고 실제 최종 저장 payload를 평가한다. case별 독립 사용자/thread로 시작하며 다중 turn 사례만 명시적으로 이력을 이어간다.

기본 baseline은 corpus를 모두 색인한 `warm` 모드로 만들어 retrieval 자체를 비교한다. 별도의 `cold/backfill`, `stale-index`, embedding 실패 주입 모드로 실제 요청 중 색인 보완/복원력도 측정한다. warm 색인이 모두 끝나지 않으면 warm run으로 표시하지 않는다. failure injection 결과는 실 provider 품질 측정과 구분한다.

## 7. 제안 파일과 CLI

다음은 구현 예정 경로이며 아직 생성하지 않는다.

| 위치 | 책임 |
| --- | --- |
| `lib/rag/evaluation-snapshot.ts` | 서버 내부 collector 타입, 불변 snapshot contract |
| `lib/rag/evaluation/{schema,evidence,metrics,judge,report,langfuse}.ts` | dataset 검증, 근거 매칭, 점수, judge adapter, 보고서, 업로드 |
| `scripts/rag/eval.ts` | 실행 모드·예산·DB 보호·provider 설정·종료 코드 |
| `scripts/rag/eval-seed.ts` | 전용 DB fixture와 key mapping, warm 색인, 소유 데이터만 정리 |
| `tests/fixtures/rag-eval/` | 공개/합성 corpus, case JSON, 사람 기준 판정, rubric 버전 |
| `tests/rag/evaluation/` | 결정적 metric/judge 검증, collector 동작·privacy, DB 통합 |
| `.github/workflows/rag-evaluation.yml` | 수동 실행용 실제 provider 평가, 선택적 정기 실행은 추후 결정 |

예정 명령:

```bash
pnpm rag:eval --mode retrieval --dataset core-ko-v1 --index warm
pnpm rag:eval --mode e2e --dataset core-ko-v1 --index warm --judge configured
pnpm rag:eval --mode e2e --dataset core-ko-v1 --publish-langfuse
pnpm rag:eval:compare --baseline <baseline.json> --candidate <candidate.json>
```

명령은 구현 시 `package.json`에 등록한다. `.env.local`의 운영/개발 DB를 자동 사용하지 않고 `RAG_EVAL_DATABASE_URL`과 평가용 provider 설정을 명시적으로 요구한다. 전용 DB 이름 allowlist, seed ownership marker, 비운영 환경 확인을 모두 적용하고 기본적으로 DB drop/reset을 하지 않는다. 정리 작업은 해당 run 소유 fixture만 대상으로 한다.

실행 시간·동시성·총 judge 호출 수·input/output token 예산을 제한한다. 가격이 검증된 모델에는 비용 상한도 적용하되 알 수 없는 비용을 0으로 계산하지 않는다. case 단위 취소와 전체 취소 시 DB/observation 정리를 보장한다. rate limit은 제한된 재시도만 허용한다.

## 8. Langfuse 연결과 데이터 경계

기존 운영 metadata exporter의 trace ID에 억지로 붙이지 않고 평가 전용 client가 독립된 experiment trace/root와 ID를 소유하게 한다. collector 결과를 해당 case의 출력/점수로 연결하고, 기존 telemetry trace와 이중 계측되는 경우 이름/프로젝트를 분리하거나 평가 과정에서는 기존 exporter를 끈다.

평가 전용 Langfuse project/key 사용을 권장한다. 첫 구현 시 설치된 5.x 패키지와 실제 Langfuse 서버 버전을 확인해 호환 client/API를 고정한다. 최신 문서에는 JS SDK v6에서 dataset run helper가 제거됐다는 안내가 있으므로 버전 간 API를 혼용하지 않는다. 신규 SDK가 필요해도 기존 callback/OTel을 일괄 업그레이드하지 않고 평가 adapter 안에서 격리한다.

- 기본 업로드: 합성 case ID, run ID, dataset/corpus/rubric/evaluator version, Git SHA/dirty diff hash, embedding/model/profile, chunk/prompt 구성 hash, 숫자 점수·상태·시간·usage.
- 원문 질문/문맥/답변·judge reason은 기본적으로 로컬에만 저장한다. 점수 comment에도 원문이나 quote를 넣지 않는다. 공개/합성 데이터의 본문 업로드는 별도 명시 옵션과 dataset 허용 표시가 모두 있을 때만 한다.
- 본문 없는 run은 내용 없는 custom experiment와 score 연결을 사용한다. Langfuse UI의 dataset replay/managed judge가 원문 없이 동작한다고 가정하지 않는다. 기본 judge는 로컬 runner가 실제 입력을 평가하고 점수만 보낸다.
- judge provider에는 선택 문맥/답변이 전송될 수 있으므로 별도 allowlist provider 설정을 사용한다. 실제 사용자 문서를 기본 dataset으로 가져오지 않는다.
- score ID를 `run + case + metric + rubricVersion` 기준으로 결정적으로 생성해 같은 run의 재전송을 중복 집계하지 않는다. 재실행은 새 run ID다.
- 업로드 실패는 로컬 평가 결과를 잃게 하지 않는다. 보고서에 `publish_failed`를 기록하고 필수 업로드 실행은 nonzero로 종료한다. 지원 API의 flush/ingestion 상태를 확인한 뒤 연결 성공을 보고한다.
- 로컬 보고서는 기본 `test-results/rag-eval/<runId>/`에 저장한다. 이미 gitignore 대상이며 키/접속 URL/raw exception은 기록하지 않는다. 외부 CI artifact도 공개 저장소 정책에 맞춰 합성 데이터 및 sanitized 요약만 업로드한다.

## 9. Judge 신뢰도와 비교 규칙

평가 모델은 생성 모델과 별도 설정으로 고정하고 낮은 temperature를 사용한다. 같은 모델 계열을 쓸 경우 자기 선호 편향 가능성을 보고서에 표시한다. structured JSON 응답의 범위·필드·근거 quote를 검증하며 파싱 오류/timeout은 judge_error다.

보정용 사람 판정 10개에서 rubric별 일치율과 불일치 사례를 확인한다. 초기 제안은 relevance/부족 대응 exact agreement 80% 이상이며, 미달하면 품질 gate로 사용하지 않는다. 작은 표본의 한계와 사람의 판정 근거도 남긴다. baseline/candidate 비교 시 같은 judge/rubric을 사용하고 경계·불일치 사례는 3회 재평가하여 분산을 확인한다. 모든 사례를 매번 3회 호출하는 것은 기본값으로 두지 않는다.

절대 점수 목표는 첫 실측 baseline과 label 검수를 마친 뒤 확정한다. 검토용 출발 목표는 prompt evidence recall 0.90, faithfulness 0.95, relevance 0.90, 부족 대응 0.90이다. 이는 현 성능이나 승인된 배포 기준이 아니다. 평균 외에 지표별 유효 N과 카테고리별 점수, unsupported/false-abstention rate, pipeline/judge 오류율을 함께 비교한다.

결정적 gate는 fixture 권한 밖 문서/본문 누출 0건, metric 계산·dataset 검증 통과다. 모델 품질은 초기에는 advisory로 두고 사람 보정/반복 실행 후 paired case 회귀와 통계 변동을 고려해 gate를 정한다. 작은 dataset에서 평균 1~2% 하락만으로 자동 차단하지 않는다. 실패한 후보 run을 재실행해서 좋은 결과만 baseline으로 고르는 것도 금지한다.

## 10. 단계별 구현과 완료 조건

| 단계 | 작업 | 검증/완료 조건 |
| --- | --- | --- |
| 0. 승인 후 시작 | `pnpm wiki:feature-start "RAG quality evaluation framework"`, 관련 issue 확인·연결 | 구현 전 issue 확보. 현재 feature branch는 사유 없이 변경하지 않는다. |
| 1. 데이터와 점수 contract | schema, 합성 corpus/40개 case 초안, evidence matcher, 결정적 metrics | overlap 중복·분할 근거·빈 gold·N/A·권한 외 근거 fixture 검증, label 사람 검토 |
| 2. 서비스 수집 seam | Ask/Workspace 단계별 collector, index 결과, 최종 답변 연결 | 기존 route/service/Trial·privacy tests 유지; 미연결 시 출력·telemetry·외부 호출 불변 |
| 3. 실제 retrieval CLI | 전용 DB seed/warm index, 실제 embedding/pgvector, 단계별 recall | 실 embedding+DB run 보고서 생성; mock 결과는 실측으로 표시하지 않음; warm/stale/cold 구분 |
| 4. e2e와 judge | streaming 최종 결과, 3개 judge metric, 예산/timeout/정리 | 사람 보정 사례, invalid JSON/주입 문서/모델 실패/거절 남용 검증; raw/정규화 답변 구분 |
| 5. Langfuse adapter | 전용 experiment/score upload, ID/retry/flush | 테스트 project의 실제 run과 case 점수 연결 확인; 본문 미업로드 검증; 실패 후 재전송 중복 없음 |
| 6. 회귀 비교/운영 가이드 | baseline 고정, 비교 CLI, 수동 CI, Wiki 반영 | 동일 corpus/config의 baseline/candidate 비교, 오류/coverage/카테고리 보고, 재현 명령 제공 |

각 단계의 변경은 리뷰 가능한 단위로 나누되 단계 2 이후의 실측 runner 검증 없이 ‘평가 체계 구축 완료’로 보고하지 않는다. 초기 필수 범위는 단계 1~6의 오프라인 체계다. 운영 실시간 judge·피드백 UI·프로덕션 자동 sampling은 후속이다.

검증 예정: 평가 Vitest suite, 기존 Ask/Workspace/Trial/observation privacy suite, `pnpm exec tsc --noEmit`, lint, 실제 전용 DB retrieval/e2e smoke, Langfuse 연동 smoke. full build는 서비스 변경 시 수행한다. 필수 체크와 Wiki sync를 통과한 뒤 commit/push/ready PR, 최소 5분 후 review threads/comments/check 재확인 및 수정 순환을 수행한다.

## 11. 초기 의사결정과 남은 확인

- 권장 기본값: 한국어 합성 corpus, Workspace 우선+Ask 포함, 오프라인 평가, score-only 업로드, 운영 metadata 정책 유지.
- 구현 착수 시 확인할 항목: 평가 DB/embedding endpoint 가용성, generation/judge 모델과 호출 예산, Langfuse 서버/client 버전 및 평가 project 권한. 비밀값은 문서/issue에 기록하지 않는다.
- 계획 검토 후 확정할 항목: 사람 검수 label, 충분/부분 근거의 사례별 기준, 첫 baseline 결과를 반영한 실제 회귀 임계값.

## 12. 근거

Repository source: `lib/rag/ask.ts`, `lib/rag/workspace-chat.ts`, `lib/rag/document-context.ts`, `lib/rag/chunk-markdown.ts`, `lib/rag/vector-store.ts`, `lib/rag/prompt.ts`, `lib/rag/answer-chain.ts`, `lib/rag/index-document.ts`, `lib/rag/ai-observation.ts`, `lib/rag/langfuse.ts`, `tests/rag/workspace-chat.test.ts`, `package.json`, `vitest.config.ts`, `.github/workflows/ci-cd.yml`.

Repository Wiki: [RAG Process Workflow](../../../wiki/RAG%20Process%20Workflow.md), [Production Observability Workflow](../../../wiki/Production%20Observability%20Workflow.md).

2026-10-24 확인한 공식 문서:

- [Langfuse Experiments via SDK](https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk): local/hosted dataset 실험, SDK major migration 주의.
- [Langfuse Scores via API/SDK](https://langfuse.com/docs/evaluation/evaluation-methods/scores-via-sdk): 외부 계산 점수 연결, trace/observation ID contract.
- [Langfuse LLM-as-a-Judge](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge): rubric/사람 보정, observation 평가의 입력 범위. 본 계획의 judge는 외부 실행이므로 managed evaluator의 sibling 조회에 의존하지 않는다.
