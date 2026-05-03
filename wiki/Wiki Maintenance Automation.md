---
id: workflow-wiki-maintenance-automation
title: Wiki Maintenance Automation
type: workflow
status: active
summary: 커밋 전 변경 파일을 기준으로 wiki 업데이트 후보를 만들고 누락을 감지하는 자동화 흐름.
created: 2026-05-03
updated: 2026-05-03
source_count: 5
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

Munjib wiki는 `llm-wiki.md`의 의도처럼 source change가 쌓일 때마다 durable knowledge를 wiki에 반영하는 운영 방식을 따른다. 완전 자동 작성 대신, 커밋 전 변경 파일을 분석해 LLM 작업자가 검토해야 할 wiki page 후보를 만들고 wiki maintenance 누락을 감지한다.

## 명령

```bash
pnpm wiki:sync-plan
pnpm wiki:sync-plan --staged
pnpm wiki:sync-plan --since HEAD~1
pnpm wiki:sync-check --staged
pnpm wiki:install-hooks
```

`wiki:sync-plan`은 변경된 source file과 이미 변경된 wiki maintenance file을 출력하고, 변경 경로 규칙에 따라 후보 wiki page를 제안한다. 추가, 복사, 수정, 이름변경뿐 아니라 삭제된 tracked source file도 후보 산정에 포함한다. `wiki:sync-check`는 source change가 있는데 `wiki/` 또는 `AGENTS.md` 변경이 없으면 실패한다.

`.githooks/pre-commit`은 `pnpm wiki:sync-check --staged`와 `pnpm wiki:lint`를 실행한다. `pnpm wiki:install-hooks`는 현재 checkout의 `core.hooksPath`를 `.githooks`로 설정해 커밋마다 이 검사를 자동 실행한다.

## 커밋 전 루프

1. Source 변경을 stage한다.
2. `pnpm wiki:sync-plan --staged`로 후보 page를 확인한다.
3. 후보 page를 먼저 읽고 durable knowledge가 생겼는지 판단한다.
4. 필요하면 관련 wiki page, `wiki/index.md`, `wiki/log.md`를 갱신한다.
5. `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`를 실행한다.

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
- `package.json`
