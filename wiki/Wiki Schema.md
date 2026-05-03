---
id: schema-main
title: Wiki Schema
type: concept
status: active
summary: Munjib markdown wiki의 page metadata, link, manifest 유지 규칙.
created: 2026-04-29
updated: 2026-05-03
source_count: 2
tags:
  - schema
  - munjib
links:
  - "[[index|Wiki Index]]"
  - "[[Munjib]]"
  - "[[Local Development Workflow]]"
  - "[[Wiki Maintenance Automation]]"
  - "[[log|Wiki Log]]"
---

# Wiki Schema

Munjib wiki는 repository 안의 markdown-first 지식 베이스다. 모든 page는 YAML frontmatter로 시작해야 하며, `pnpm wiki:manifest`가 이 frontmatter를 읽어 `wiki/manifest.json`을 생성한다.

## 필수 frontmatter

```yaml
---
id: concept-example
title: Example Page
type: concept
status: active
summary: One-sentence page summary.
created: 2026-04-29
updated: 2026-04-29
source_count: 1
tags:
  - munjib
links:
  - "[[index|Wiki Index]]"
---
```

## 허용 type

```text
source | concept | entity | workflow | decision | question | index | log
```

## 허용 status

```text
active | stale | draft | superseded
```

## 링크 규칙

Wiki page 사이의 링크는 Obsidian-style `[[Wiki Link]]`를 사용한다. Code path, root source note, 외부 URL은 일반 markdown link 또는 inline code path를 사용한다.

Obsidian에서 바로 열리도록 일반 page 파일명은 link target과 맞춘다. 예를 들어 `title: Document Editing Workflow`인 page는 `wiki/Document Editing Workflow.md`에 두고 `[[Document Editing Workflow]]`로 연결한다.

운영 호환성 때문에 파일명을 유지해야 하는 `wiki/index.md`, `wiki/log.md`는 alias 링크를 쓴다.

```markdown
[[index|Wiki Index]]
[[log|Wiki Log]]
```

## 유지보수 규칙

Wiki page를 추가, 삭제, rename, frontmatter 수정한 뒤에는 다음 명령을 실행한다.

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

새로 발견한 durable knowledge는 관련 page, [[index|Wiki Index]], [[log|Wiki Log]], `wiki/manifest.json`을 함께 갱신한다.

`raw/sources/` 아래 파일은 source evidence로 취급하고 wiki maintenance 중 수정하지 않는다.

## 커밋 전 sync 규칙

Source file을 커밋하기 전에는 [[Wiki Maintenance Automation]]의 sync loop를 따른다.

```bash
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

`wiki:sync-plan`은 변경 파일을 기준으로 후보 page를 제안한다. `wiki:sync-check`는 staged source change가 있는데 `wiki/` 또는 `AGENTS.md` 변경이 없을 때 실패해 wiki maintenance 누락을 드러낸다.
