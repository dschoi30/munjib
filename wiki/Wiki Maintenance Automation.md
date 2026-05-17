---
id: workflow-wiki-maintenance-automation
title: Wiki Maintenance Automation
type: workflow
status: active
summary: Feature Start, Ingest, Query, Lint, commit-time sync를 통해 LLM이 Munjib wiki를 영속 지식층으로 유지하는 운영 흐름.
created: 2026-05-03
updated: 2026-05-17
source_count: 14
tags:
  - munjib
  - wiki
  - automation
  - workflow
links:
  - "[[Wiki Schema]]"
  - "[[Local Development Workflow]]"
  - "[[index|Wiki Index]]"
  - "[[log|Wiki Log]]"
---

# Wiki Maintenance Automation

Munjib wiki는 `llm-wiki.md`의 의도처럼 source change와 질문이 쌓일 때마다 durable knowledge를 wiki에 반영하는 운영 방식을 따른다. 목표는 질문할 때마다 원문을 다시 조합하는 것이 아니라, source evidence를 구조화된 markdown page network로 컴파일해 계속 갱신하는 것이다.

현재 자동화는 완전 자동 작성이 아니라 LLM 작업자가 사용할 guardrail이다. 커밋 전 변경 파일을 분석해 검토해야 할 후보 page를 제안하고, wiki maintenance 누락을 감지한다. 그 위에 Ingest, Query, Lint 루프를 운영 규칙으로 둔다.

## 명령

```bash
pnpm wiki:feature-start "<feature title>"
pnpm wiki:sync-plan
pnpm wiki:sync-plan --staged
pnpm wiki:sync-plan --since HEAD~1
pnpm wiki:sync-check --staged
pnpm wiki:install-hooks
```

`wiki:sync-plan`은 변경된 source file과 이미 변경된 wiki maintenance file을 출력하고, 변경 경로 규칙에 따라 후보 wiki page를 제안한다. 추가, 복사, 수정, 이름변경뿐 아니라 삭제된 tracked source file도 후보 산정에 포함한다. `wiki:sync-check`는 source change가 있는데 `wiki/` 또는 `AGENTS.md` 변경이 없으면 실패한다.

`.githooks/pre-commit`은 `pnpm wiki:sync-check --staged`와 `pnpm wiki:lint`를 실행한다. `pnpm wiki:install-hooks`는 현재 checkout의 `core.hooksPath`를 `.githooks`로 설정해 커밋마다 이 검사를 자동 실행한다.

## Feature Start 루프

신규 기능 구현은 source 변경 전에 GitHub issue를 먼저 만든다.

```bash
pnpm wiki:feature-start "<feature title>"
```

이 명령은 `gh issue create`를 우선 사용한다. GitHub CLI가 없거나 인증되지 않았거나 네트워크 문제로 실패하면 issue title/body template과 수동 branch guidance를 출력한다. 이 fallback은 구현 시작 허가가 아니라 수동으로 issue를 발행하라는 복구 경로다.

`gh issue create` 성공 출력은 GitHub Enterprise 같은 custom host에서도 `/issues/<number>` URL을 읽어 issue 번호와 URL을 보존한다. `gh` 또는 `git` command가 실패하면 가능한 경우 stderr를 사용자 메시지에 우선 표시해 인증 실패나 branch 생성 실패 이유를 바로 확인하게 한다.

현재 branch가 `main`이면 issue 번호 기반 `issue-<number>-<slug>` branch를 만들고 전환한다. 이미 feature branch나 worktree branch에 있으면 현재 branch를 유지한다. 이렇게 하면 기존 격리 작업공간을 방해하지 않으면서 `main`에서 바로 기능을 구현하는 실수를 줄인다.

현재 feature branch에 이미 다른 issue 작업이 있으면 새 기능을 그 branch에 섞지 않는다. `wiki:feature-start` 실행 전에 `git status --short --branch`와 `git worktree list`로 현재 작업공간을 확인하고, 필요한 경우 `git worktree add .worktrees/issue-<number>-<slug> main`으로 독립 checkout을 만든다. Issue #25 설계 작업에서 기존 issue #23 branch에 spec commit이 올라갔다가 `issue-25-markdown-heading-folding` branch로 분리한 사례처럼, feature branch 유지 규칙은 격리된 작업공간이 이미 있다는 전제에서만 안전하다.

## Ingest 루프

Ingest는 새 source를 wiki에 편입하는 작업이다. Source는 code commit, PR review, design artifact, PRD, runtime debugging 결과, raw source document가 될 수 있다.

1. Source evidence를 식별한다. `raw/sources/`는 수정하지 않는다.
2. `wiki/index.md`와 관련 후보 page를 먼저 읽는다.
3. 새 주장을 단일 summary page에만 넣지 않고, concept/workflow/decision/source/question page 중 영향을 받는 곳에 나눠 반영한다.
4. 새 page가 필요하면 [[Wiki Schema]]의 타입별 권장 섹션을 따른다.
5. 기존 주장과 충돌하면 덮어쓰지 말고 어떤 근거가 최신인지 적고, 필요하면 오래된 page나 section을 `stale`로 표시한다.
6. `wiki/index.md`를 갱신해 탐색 경로를 유지한다.
7. `wiki/log.md`에 source evidence, affected pages, verification을 남긴다.

Ingest entry는 가능하면 다음 정보를 포함한다.

- `Source evidence`: path, commit hash, issue/PR, raw source.
- `Affected pages`: 갱신한 wiki page 목록.
- `Claims added`: 새로 확인한 durable facts.
- `Claims changed`: 바뀐 기존 이해.
- `Open questions`: 아직 근거가 부족한 부분.

## Query 환류 루프

Query는 사용자의 질문에 답하는 과정이면서 지식을 생산하는 과정이다.

1. `pnpm wiki:find "<topic>"` 또는 `wiki/index.md`에서 시작한다.
2. wiki가 missing, stale, too broad, code-level verification 필요 상태일 때만 source search로 내려간다.
3. 답변이 재사용 가능한 결론, 비교, 설계 판단, 디버깅 원인, 운영 절차를 만든다면 wiki에 환류한다.
4. 짧은 보강은 기존 page section에 넣고, 독립 가치가 있으면 `question` page를 만든다.
5. 환류한 경우 `wiki/log.md`에 query-derived maintenance entry를 남긴다.

질문 답변은 일회성 채팅 결과로만 남기지 않는다. 같은 질문을 다시 받을 가능성이 높거나 다음 개발자가 읽어야 하는 내용이면 wiki가 source of navigation이 되게 만든다.

## Lint 루프

`pnpm wiki:lint`는 frontmatter, manifest, index coverage, unresolved wiki link를 검사한다. LLM maintenance에서는 여기에 의미론적 health check를 더한다.

- stale claims: code, tests, recent commits와 맞지 않는 현재형 설명.
- contradictions: 두 page가 같은 사실을 다르게 설명하는 경우.
- orphan pages: index나 관련 page에서 도달하기 어려운 page.
- missing concepts: 여러 page에서 반복되지만 독립 page가 없는 개념.
- missing evidence: 중요한 claim이 `## 근거` 없이 남아 있는 경우.
- source gaps: web/source/code 확인이 필요한데 추정으로 남은 내용.

Semantic lint 결과는 바로 고치거나 `question` page/open question으로 남긴다.

## 커밋 전 루프

1. Source 변경을 stage한다.
2. `pnpm wiki:sync-plan --staged`로 후보 page를 확인한다.
3. 후보 page를 먼저 읽고 durable knowledge가 생겼는지 판단한다.
4. 필요하면 관련 wiki page, `wiki/index.md`, `wiki/log.md`를 갱신한다.
5. `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`를 실행한다.

## Task 종료와 PR review 루프

작업자가 task를 완료할 때는 local verification과 commit-time wiki sync를 끝낸 뒤 자동으로 PR을 작성한다. 사용자가 push/PR 생성을 선택하면 review workflow 시작으로 간주하고, PR은 ready-for-review 상태로 전환하거나 review request를 보낸다.

PR 리뷰 요청 완료 후에는 최소 5분을 기다린 뒤 PR 상태를 다시 확인한다. 확인 대상은 review submission, unresolved review thread, inline comment, CI/check 결과다. Actionable feedback이나 실패 check가 있으면 같은 branch에서 수정하고, 검증과 wiki sync를 다시 수행한 뒤 추가 commit/push로 PR을 갱신하고 review 상태를 다시 확인한다. 리뷰가 아직 도착하지 않았거나 check가 대기 중이면 그 사실을 최종 상태에 명시한다. 인증, tooling, network 문제로 확인할 수 없는 항목은 조용히 건너뛰지 않고 blocker와 필요한 명령/권한을 남긴다.

## 판단 기준

Wiki 갱신이 필요한 변경:

- 데이터 모델, 문서 편집 흐름, 인증/권한, wiki link, attachment, versioning처럼 제품/아키텍처 이해에 영향을 주는 변경.
- 기능, 컴포넌트, 서비스, 스키마 파일 삭제처럼 기존 설명을 제거하거나 정리해야 할 수 있는 변경.
- 개발 명령, test/e2e, seed, 환경 변수, dependency, build 설정 변경.
- PRD, product naming, 디자인 산출물처럼 repository 탐색자가 나중에 다시 찾아야 할 결정.

Wiki 갱신이 필요 없을 수 있는 변경:

- 오타, 작은 스타일 조정, 테스트 fixture의 단순 이름 변경.
- 이미 wiki에 적힌 사실을 바꾸지 않는 내부 구현 정리.

필요 없다고 판단한 경우에도 `wiki/log.md`에 짧은 maintenance entry를 남기면 이후 작업자가 왜 wiki 본문 변경이 없었는지 이해하기 쉽다.

## 경로 매핑

자동화는 경로 기반으로 후보 page를 고른다.

- `lib/wiki/*`, `scripts/wiki/*`, `llm-wiki.md` -> [[Wiki Schema]], [[Local Development Workflow]]
- `lib/wiki-links/*`, `tests/wiki-links/*` -> [[Wiki Links And Backlinks]], [[Document Editing Workflow]]
- `lib/documents/*`, `components/document-*`, `app/workspaces/*` -> [[Document Editing Workflow]], [[Document Knowledge Model]]
- 인증, 권한, `middleware.ts` -> [[Auth And Permissions Workflow]], [[Document Knowledge Model]]
- `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `prisma/*`, e2e -> [[Local Development Workflow]]
- `prd.md`, `docs/*` -> [[Project PRD]], [[Munjib]]

## 근거

- `llm-wiki.md`
- `AGENTS.md`
- `.githooks/pre-commit`
- `lib/wiki/sync.ts`
- `lib/wiki/feature-start.ts`
- `scripts/wiki/feature-start.ts`
- `package.json`
- `wiki/Wiki Schema.md`
- `wiki/log.md`
- GitHub issue #25 branch separation recovery
- User workflow decision on automatic draft PR creation after every task
- User workflow decision to wait 5 minutes after PR review request and inspect review feedback
- `AGENTS.md` Task Completion and PR Review Workflow
