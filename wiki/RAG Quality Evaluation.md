---
id: workflow-rag-quality-evaluation
title: RAG Quality Evaluation
type: workflow
status: active
summary: Issue 248의 합성 데이터 기반 오프라인 RAG 평가, 실제 서비스 수집, 네 품질 지표와 score-only Langfuse 실험.
created: 2026-10-24
updated: 2026-10-24
source_count: 9
tags:
  - munjib
  - rag
  - evaluation
  - langfuse
links:
  - "[[index|Wiki Index]]"
  - "[[RAG Process Workflow]]"
  - "[[Production Observability Workflow]]"
---

# RAG Quality Evaluation

Issue [#248](https://github.com/dschoi30/munjib/issues/248). 실행 절차와 환경 변수는 [runbook](../docs/runbooks/rag-quality-evaluation.md), 원래 승인 계획은 [implementation plan](../docs/superpowers/plans/2026-10-24-rag-quality-evaluation.md)을 참고한다.

## 실행과 판정

- `pnpm rag:eval --validate`는 40개 합성 문항을 검증한다. Workspace 30 / Ask 10, 사람 검수용 후보 10 / 회귀 30이며 사람 보정 완료를 주장하지 않는다.
- `pnpm rag:eval --mode retrieval`은 실제 embedding/pgvector/service로 global recall@5/12/60, merged/prompt evidence recall을 측정한다. Ask는 context evidence recall만 측정한다.
- `--mode e2e --judge configured`는 실제 생성과 별도 judge로 근거 충실도·질문 적합도·근거 부족 대응을 측정한다. judge의 근거 인용은 실제 제공 문맥에 존재해야 하며 파싱 실패/N/A를 점수로 대체하지 않는다.
- `rag:eval:compare`는 동일 case/corpus/rubric/mode/index 조건에서 변화와 coverage/오류 증가를 비교한다. `rag:eval:calibrate`는 실제 사람이 별도로 작성한 판정을 입력받는다.

## 데이터와 보안 경계

평가 DB 이름/환경을 명시적으로 검증하고 case 소유 fixture만 정리한다. AsyncLocalStorage 수집기는 평가 CLI에서만 열리며 운영 route/metadata allowlist는 변경하지 않는다. Raw snapshot과 judge reason은 gitignored 로컬 보고서에만 남는다.

`--publish-langfuse`는 평가 전용 private OTel provider와 고정 5.4.1 client로 합성 case ID·버전·점수만 전송한다. 기존 운영 project key를 자동 재사용하지 않는다. 결정적 trace/score ID로 재전송 중복을 막고 최신 observation/score API로 실제 조회 가능성을 확인한다. Langfuse dataset의 입력은 case ID이므로 UI에서 원문 replay는 지원하지 않는다.

## 한계와 확인 상태

- 품질 점수는 사람 보정 전까지 advisory다. 작은 합성 corpus에서 recall@60은 쉽게 포화되므로 실제 운영 품질의 대표 표본으로 해석하지 않는다.
- 현재 main은 주제 전환 검색어 분리와 색인 실패 시 중단을 이미 포함한다. 과거 계획의 색인 실패 무시 동작은 현재 평가 기준선이 아니다.
- 실행 로그/최종 baseline과 PR 검증 결과는 구현 검증 완료 시 아래에 기록한다. 운영 배포와 운영 답변 품질 개선은 이 harness 구축과 별개다.

## 근거

- `lib/rag/evaluation-snapshot.ts`
- `lib/rag/evaluation/`
- `scripts/rag/eval.ts`
- `scripts/rag/eval-seed.ts`
- `tests/fixtures/rag-eval/core-ko-v1.json`
- `tests/rag/evaluation/`
- `.github/workflows/rag-evaluation.yml`
- `docs/runbooks/rag-quality-evaluation.md`
- `https://github.com/dschoi30/munjib/issues/248`

## 2026-10-24 구현 검증

- 전체 테스트: 1,809 passed / 5 skipped. TypeScript 검사, production build, 변경 파일의 명시적 Next ESLint 검사, 전체 Wiki manifest/lint/sync-check를 검증한다. 기본 `pnpm lint`는 기존 ESLint 설정 부재로 대화형 설정을 열기 때문에 임시 Next 설정으로 변경 범위를 검사했다.
- 실측 run `1792832630805-1bf66475`: 실제 Ollama `bge-m3` + OpenAI-compatible `openai/gpt-4.1-mini` 생성/judge, 40/40 완료, 권한 밖 근거 0건. 같은 모델을 생성/judge에 사용한 한계가 있으며 사람 보정은 미완료다.
- 제안 label 기준: Workspace recall@5/12/60 및 prompt recall 1.00 (유효 N=27), Ask context recall 1.00 (N=9), judge faithfulness/relevance 1.00 (N=40), insufficient-evidence handling 0.90 (N=40). 이 점수는 작은 합성 corpus에 대한 계측 결과이며 운영 정확성이나 judge 타당성을 입증하지 않는다.
- `munjib-development` project의 `evaluation` environment에 score-only experiment를 전송했고, 최신 observation/score 조회 API로 40개 case의 trace와 점수 연결을 확인했다. 실제 본문은 해당 project에 업로드하지 않았다. 별도 평가 project 발급과 CI provider secrets 설정은 운영자가 선택할 후속 설정이다.

- Follow-up checks: actual cold/stale retrieval completed; deliberate unreachable embedding endpoint timed out with a nonzero exit and no fabricated quality score. Split-boundary whitespace matching now has a regression test. Re-uploading all 40 cases reused the same score IDs and was read-verified again.
