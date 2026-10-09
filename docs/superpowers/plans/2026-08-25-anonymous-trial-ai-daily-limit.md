# 익명 Trial AI 일일 사용 제한 구현 계획

> **에이전트 작업자 필수 조건:** 이 계획은 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`로 task별 실행한다. 진행 상태는 체크박스로 관리한다.

**목표:** 가입 없는 격리형 Trial에서 Ask AI와 Workspace AI 합산 사용량을 익명 기기별 KST 하루 3회로 제한하고, 네트워크·동시성·전체 비용 우회 방어를 추가한다.

**아키텍처:** 서버 인증 visitor token과 일일 network HMAC으로 익명 Trial actor를 만들고, PostgreSQL transaction 기반 공통 admission service가 visitor/network/global counter와 lease를 원자적으로 처리한다. 두 AI route는 권한·입력 검증 뒤 모델 또는 stream 작업 전에 이 service를 호출한다.

**기술 스택:** Next.js 15 App Router, NextAuth v4, Prisma 6/PostgreSQL, React 19, Vitest, Playwright, Cloudflare Turnstile

**Spec:** `docs/superpowers/specs/2026-08-25-anonymous-trial-ai-daily-limit-design.md`

## 전역 제약

- 기존 `trial@example.invalid` 계정, production seed, 기존 Trial provider를 재활성화하지 않는다.
- 일반 로그인 사용자의 AI 동작과 quota는 변경하지 않는다.
- visitor/network 원문, IP, 질문, prompt, context, 답변, challenge token을 DB·log·telemetry에 저장하지 않는다.
- 모든 limit/config/storage 오류는 모델 호출 전에 fail closed한다.
- Ask AI와 Workspace AI는 visitor 기준 KST 하루 3회를 공유한다.
- network limit은 KST 하루 15회, visitor 동시 실행은 1회다.
- 전체 Trial 일일 한도는 production에서 명시된 양의 정수가 없으면 closed다.
- Workspace AI quota 오류는 NDJSON stream 시작 전 JSON 429로 반환한다.

---

## 실행 전 저장소 준비

구현을 시작하는 세션에서 다음 명령으로 GitHub issue와 feature branch를 먼저 만든다.

```bash
pnpm wiki:feature-start "Anonymous Trial AI daily limit"
```

예상 결과: GitHub issue가 생성되고 `main`에서 실행했다면 `issue-<번호>-anonymous-trial-ai-daily-limit` branch로 전환된다. GitHub 인증이 없으면 출력된 issue template으로 issue를 만든 뒤 구현을 시작한다.

### Task 1: visitor token과 일일 network key 순수 계약

**파일:**
- 생성: `lib/auth/trial-visitor.ts`
- 생성: `lib/security/trial-network-bucket.ts`
- 생성: `tests/auth/trial-visitor.test.ts`
- 생성: `tests/security/trial-network-bucket.test.ts`

**인터페이스:**
- 생성: `issueTrialVisitorToken()`, `verifyTrialVisitorToken()`, `deriveTrialVisitorDigest()`
- 생성: `deriveTrialNetworkBucket()`과 `resolveKstUsageWindow()`
- 출력에는 raw visitor id와 raw network input이 포함되지 않는다.

- [ ] **Step 1: 실패 테스트 작성**

visitor token round-trip, tamper/expiry/key-rotation 거부, IPv4 `/24`, IPv6 `/56`, 날짜별 다른 HMAC, KST 자정 경계를 검증한다.

```ts
expect(verifyTrialVisitorToken(tampered, keys)).toEqual({ ok: false });
expect(deriveTrialNetworkBucket("203.0.113.41", day, key)).toEqual(
  deriveTrialNetworkBucket("203.0.113.99", day, key),
);
expect(deriveTrialNetworkBucket("203.0.113.41", nextDay, key)).not.toEqual(firstDay);
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm exec vitest run tests/auth/trial-visitor.test.ts tests/security/trial-network-bucket.test.ts
```

예상: 모듈이 없어 FAIL.

- [ ] **Step 3: 최소 구현**

Node `randomBytes`, HMAC-SHA-256, constant-time 검증, canonical base64url, `Intl.DateTimeFormat`의 `Asia/Seoul` 날짜 계산을 구현한다. token payload는 version, random subject, issued-at, expires-at만 포함한다.

- [ ] **Step 4: 통과 확인 및 커밋**

```bash
pnpm exec vitest run tests/auth/trial-visitor.test.ts tests/security/trial-network-bucket.test.ts
git add lib/auth/trial-visitor.ts lib/security/trial-network-bucket.ts tests/auth/trial-visitor.test.ts tests/security/trial-network-bucket.test.ts
git commit -m "feat(auth): add anonymous trial identity primitives"
```

### Task 2: PostgreSQL usage ledger와 원자적 admission

**파일:**
- 수정: `prisma/schema.prisma`
- 생성: `prisma/migrations/20260825010000_anonymous_trial_ai_admission/migration.sql`
- 생성: `lib/rag/trial-ai-admission.ts`
- 생성: `tests/rag/trial-ai-admission.test.ts`

**인터페이스:**
- 입력/출력은 spec의 `TrialAiAdmissionInput`과 `TrialAiAdmission`을 그대로 사용한다.
- 생성: `admitTrialAiRequest(input, deps)`와 `releaseTrialAiLease(leaseId, deps)`

- [ ] **Step 1: schema와 concurrency 실패 테스트 작성**

visitor/network/global 날짜별 unique row, 활성 lease, 세 번째 성공/네 번째 429, 동시 4개 중 정확히 3개 admission, 일반 사용자 `not-applicable`, DB 오류 503을 검증한다.

```ts
const results = await Promise.all(
  Array.from({ length: 4 }, () => admitTrialAiRequest(input, deps)),
);
expect(results.filter((result) => result.kind === "admitted")).toHaveLength(3);
expect(results.filter((result) => result.kind === "denied")).toHaveLength(1);
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm exec vitest run tests/rag/trial-ai-admission.test.ts
```

- [ ] **Step 3: migration과 transaction 구현**

Prisma model은 visitor daily usage, network daily usage, global daily usage, active lease로 분리한다. transaction 안에서 날짜 row를 upsert한 뒤 고정 순서로 잠그고, 모든 ceiling과 lease를 확인한 다음 세 counter와 lease를 함께 기록한다. lease release는 counter를 감소시키지 않는다.

- [ ] **Step 4: 검증 및 커밋**

```bash
pnpm run db:generate
pnpm exec vitest run tests/rag/trial-ai-admission.test.ts
git add prisma/schema.prisma prisma/migrations lib/rag/trial-ai-admission.ts tests/rag/trial-ai-admission.test.ts
git commit -m "feat(ai): add atomic trial admission ledger"
```

### Task 3: 격리형 Trial actor와 entitlement endpoint

**파일:**
- 수정: `lib/auth/config.ts`
- 수정: `lib/auth/session.ts`
- 생성: `lib/auth/trial-entitlement.ts`
- 생성: `app/api/trial/entitlement/route.ts`
- 생성: `tests/auth/trial-entitlement.test.ts`
- 생성: `tests/auth/trial-session.test.ts`

**인터페이스:**
- 생성: `resolveAnonymousTrialCapability()`와 `requireAiActor()`
- entitlement 응답: `{ remaining: number; limit: 3; resetsAt: string; challengeRequired?: true }`
- cookie 이름과 attribute는 `trial-visitor.ts` 한 곳에서만 정의한다.

- [ ] **Step 1: 실패 테스트 작성**

production 기본 closed, 유효 capability에서만 actor 발급, legacy Trial email 미조회, 위조 token fail closed, entitlement에 식별자 미노출, 반복 신규 발급의 Turnstile 요구를 검증한다.

- [ ] **Step 2: 실패 확인**

```bash
pnpm exec vitest run tests/auth/trial-entitlement.test.ts tests/auth/trial-session.test.ts
```

- [ ] **Step 3: 최소 구현**

기존 development-only Trial provider는 production activation에 사용하지 않는다. 새 익명 Trial actor는 capability, token, trusted network evidence를 모두 검증하고 일반 `User.id`와 다른 discriminated actor로 route에 전달한다. Turnstile 검증에는 bounded timeout과 exact hostname/action 검증을 적용한다.

- [ ] **Step 4: 검증 및 커밋**

```bash
pnpm exec vitest run tests/auth/trial-entitlement.test.ts tests/auth/trial-session.test.ts tests/auth/config.test.ts
git add lib/auth/config.ts lib/auth/session.ts lib/auth/trial-entitlement.ts app/api/trial/entitlement/route.ts tests/auth
git commit -m "feat(auth): add isolated anonymous trial actor"
```

### Task 4: Ask AI 공통 한도 연결

**파일:**
- 수정: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`
- 수정: `tests/rag/ask-route.test.ts`

**인터페이스:**
- `requireAiActor()` 결과와 권한 확인 뒤 `admitTrialAiRequest()`를 호출한다.
- 성공 응답에 `trialAi: { remaining, resetsAt }`를 선택적으로 포함한다.

- [ ] **Step 1: route 실패 테스트 작성**

validation/auth/404/authorization은 미차감, admission 거부는 no-store 429, admission 성공 후 provider 503은 차감, 일반 사용자는 admission 비적용을 검증한다.

- [ ] **Step 2: 실패 확인**

```bash
pnpm exec vitest run tests/rag/ask-route.test.ts
```

- [ ] **Step 3: route 연결 및 검증**

```bash
pnpm exec vitest run tests/rag/ask-route.test.ts tests/rag/ask.test.ts
git add 'app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts' tests/rag/ask-route.test.ts
git commit -m "feat(ai): enforce trial quota on ask ai"
```

### Task 5: Workspace AI stream 전 한도 연결

**파일:**
- 수정: `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`
- 수정: `app/api/workspaces/[workspaceSlug]/assistant/error-response.ts`
- 수정: `tests/rag/workspace-chat-route.test.ts`

- [ ] **Step 1: stream 경계 실패 테스트 작성**

429가 JSON이며 `application/x-ndjson`이 아닌지, 거부 시 thread/message row와 provider 호출이 없는지, 성공 시 최초 `start` event에 잔여 횟수가 있는지, stream 실패와 abort는 이미 차감되는지 검증한다.

- [ ] **Step 2: 실패 확인**

```bash
pnpm exec vitest run tests/rag/workspace-chat-route.test.ts
```

- [ ] **Step 3: stream 생성 전 admission 구현 및 커밋**

```bash
pnpm exec vitest run tests/rag/workspace-chat-route.test.ts tests/rag/workspace-chat.test.ts
git add 'app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts' 'app/api/workspaces/[workspaceSlug]/assistant/error-response.ts' tests/rag/workspace-chat-route.test.ts
git commit -m "feat(ai): enforce trial quota before workspace stream"
```

### Task 6: Trial 잔여 횟수 UI

**파일:**
- 수정: `components/document-editor/ai-assistant-panel.tsx`
- 수정: `components/workspace-chatbot.tsx`
- 수정: `components/workspace-chatbot-stream.ts`
- 수정: `lib/i18n/messages.ts`
- 수정: `tests/components/document-editor-preview.test.tsx`
- 수정: `tests/components/workspace-chatbot.test.tsx`

- [ ] **Step 1: UI 실패 테스트 작성**

Trial actor에서만 한국어/영어 잔여 횟수 표시, 두 surface의 authoritative count 동기화, 429 후 양쪽 composer 비활성화, KST reset 안내, 일반 사용자 UI 불변을 검증한다.

- [ ] **Step 2: 실패 확인**

```bash
pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/components/workspace-chatbot.test.tsx
```

- [ ] **Step 3: 최소 UI 구현 및 커밋**

client는 entitlement와 route response만 표시하고 localStorage를 권한 근거로 사용하지 않는다.

```bash
pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/components/workspace-chatbot.test.tsx tests/i18n/messages.test.ts
git add components lib/i18n/messages.ts tests/components tests/i18n/messages.test.ts
git commit -m "feat(ui): show anonymous trial ai allowance"
```

### Task 7: 개인정보·E2E·rollout 문서와 전체 검증

**파일:**
- 생성: `tests/e2e/anonymous-trial-ai-limit.spec.ts`
- 생성: `tests/security/trial-ai-privacy.test.ts`
- 수정: `wiki/Auth And Permissions Workflow.md`
- 수정: `wiki/RAG Process Workflow.md`
- 수정: `wiki/CI CD And Monitoring Workflow.md`
- 수정: `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`

- [ ] **Step 0: 실제 가입 없는 Trial 진입 연결**

기존 development-only `signIn("trial")`/`trial@example.invalid` provider를 제거하고, 로그인 버튼을 익명 entitlement 발급과 정확한 demo workspace 이동에 연결한다. workspace 화면은 별도 anonymous viewer projection으로 exact workspace ID/slug, active document, explicit-permission exclusion을 적용하며 `WorkspaceMember`, USER grant, shared `User`, mutation/account UI를 사용하지 않는다. capability가 없으면 UI와 API가 모두 fail closed한다.

- [ ] **Step 1: production-like E2E와 source-contract 테스트 작성**

가입 없는 Trial 진입, 합산 3회, 새 세션에서도 유지, 네 번째 429, legacy Trial 계정 닫힘, raw token/IP/AI content 비기록, capability 제거 rollback을 검증한다.

- [ ] **Step 2: 전체 검증**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm run test:e2e -- tests/e2e/anonymous-trial-ai-limit.spec.ts
```

- [ ] **Step 3: wiki sync와 staged 검증**

```bash
git add app components lib prisma tests docs wiki
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
git add wiki/manifest.json
pnpm wiki:sync-check --staged
```

- [ ] **Step 4: 최종 커밋·push·PR review workflow**

```bash
git commit -m "docs: record anonymous trial ai rollout"
git push -u origin HEAD
gh pr create --fill
gh pr ready
```

PR 생성 뒤 최소 5분을 기다리고 CI, review submission, unresolved thread, inline comment를 다시 확인한다. 실패나 actionable feedback이 있으면 같은 branch에서 수정·재검증·push하고 다시 확인한다. production capability 활성화는 이 PR 범위 밖의 별도 운영 승인으로 유지한다.
