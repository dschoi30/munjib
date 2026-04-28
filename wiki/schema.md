---
id: schema-main
title: Wiki Schema
type: concept
status: active
summary: Munjib markdown wiki의 page metadata, link, manifest 유지 규칙.
created: 2026-04-29
updated: 2026-04-29
source_count: 1
tags:
  - schema
  - munjib
links:
  - "[[Wiki Index]]"
  - "[[Munjib]]"
  - "[[Local Development Workflow]]"
  - "[[Wiki Log]]"
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
  - "[[Wiki Index]]"
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

링크 target은 page의 `title`과 정확히 맞아야 한다. 예를 들어 `title: Document Editing Workflow`인 page는 `[[Document Editing Workflow]]`로 연결한다.

## 유지보수 규칙

Wiki page를 추가, 삭제, rename, frontmatter 수정한 뒤에는 다음 명령을 실행한다.

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

새로 발견한 durable knowledge는 관련 page, [[Wiki Index]], [[Wiki Log]], `wiki/manifest.json`을 함께 갱신한다.

`raw/sources/` 아래 파일은 source evidence로 취급하고 wiki maintenance 중 수정하지 않는다.
