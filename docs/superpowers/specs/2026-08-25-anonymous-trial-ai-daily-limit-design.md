# 익명 Trial AI 일일 사용 제한 설계

**상태:** 사용자 승인 완료

**목표:** 가입 없는 Trial 진입을 유지하면서 Ask AI와 Workspace AI 합산 사용량을 익명 기기별 한국 날짜 기준 하루 3회로 제한하고, 우회와 전체 비용도 함께 통제한다.

## 제품 계약

- 제한 대상은 새로 만드는 격리형 익명 Trial이다. 일반 로그인 사용자는 영향을 받지 않는다.
- Ask AI와 Workspace AI는 `Asia/Seoul` 날짜별 3회 한도를 공유한다.
- 본인 확인 없이 한 사람을 증명할 수 없으므로 UI에는 `이 기기에서 오늘 AI 체험 3회`라고 표시한다.
- 세션 재생성, 로그아웃, 브라우저 재시작은 유효한 방문자 토큰이 남아 있는 한 사용량을 초기화하지 않는다.
- 쿠키 삭제와 네트워크 변경을 함께 사용하는 우회는 완전히 막을 수 없다. 일일 네트워크 한도, CAPTCHA 승격, 동시 요청 제한, 전체 일일 한도로 우회 비용과 운영 비용을 제한한다.
- 기존 공유 계정 `legacy-account-2@example.invalid`은 재활성화하지 않으며 Issue #156 Trial 격리 방향을 유지한다.

## 익명 방문자 식별

최초 Trial 진입 시 서버가 안전한 256비트 `visitorId`를 생성한다. 브라우저에는 개인정보가 없는 opaque 토큰만 `Secure`, `HttpOnly`, `SameSite=Lax`, 경로 `/`, 유효기간 180일 쿠키로 전달한다.

DB에는 원본 `visitorId` 대신 도메인 분리 HMAC만 저장한다. 키 교체 시 현재 키와 직전 검증 키만 제한된 중첩 기간 동안 허용한다. 누락·위조·만료 토큰은 무제한 호출자가 아니라 신규 발급 시도로 처리한다.

Trial 세션에는 일반 `User.id`와 구분되는 서버 발급 `trialVisitorSubject`를 넣는다. password, Google, development 및 기존 Trial identity는 이 subject를 만들 수 없다.

## 개인정보 보호형 네트워크 버킷

신뢰된 edge/auth guard가 정규화한 네트워크 식별자를 제공한다. 애플리케이션은 IPv4를 `/24`, IPv6를 `/56`으로 축약한 뒤 KST 날짜와 일일 회전 키로 HMAC을 계산한다. DB에는 해당 날짜의 digest만 저장한다.

원본 IP, User-Agent, 브라우저 fingerprint, 질문, prompt, context, 답변은 사용량 테이블과 telemetry에 저장하지 않는다.

초기 제한값은 다음과 같다.

- 방문자: KST 기준 하루 3회
- 네트워크 구간: KST 기준 하루 15회
- 방문자 동시 실행: 1회
- 전체 Trial: 운영 설정의 양의 정수 한도. 누락되거나 잘못되면 Trial AI는 닫힌다.

네트워크 한도는 abuse ceiling이며 사용자에게 보장하는 개인 할당량이 아니다. 응답은 같은 네트워크의 다른 방문자가 사용했는지 노출하지 않는다.

## CAPTCHA 승격

유효한 기존 방문자 토큰과 여유 한도가 있으면 CAPTCHA를 요구하지 않는다. 이미 Trial traffic이 있었던 네트워크에서 새 토큰을 요구하면 서버가 검증하는 Cloudflare Turnstile을 요구한다.

Turnstile site key는 공개값으로 두고 secret은 production의 file-backed secret 패턴으로 읽는다. 성공한 challenge는 방문자 토큰 발급 시도 1회만 허가한다. AI 한도를 추가하거나 버킷을 초기화하거나 네트워크·전체 한도를 우회하지 않는다. provider 장애 시 의심스러운 재발급은 fail closed하고, 유효한 기존 방문자는 남은 한도 안에서 계속 사용할 수 있다.

## 공통 admission 흐름

두 AI route는 인증, JSON/body 검증, workspace/document 권한 확인, provider/model 검증을 마친 뒤 채팅 row 생성, indexing, NDJSON 응답 시작, embedding/chat provider 호출 전에 공통 `admitTrialAiRequest()`를 호출한다.

```ts
type TrialAiAdmissionInput = Readonly<{
  actor: Readonly<{
    kind: "authenticated-user" | "anonymous-trial";
    userId?: string;
    trialVisitorSubject?: string;
  }>;
  surface: "ask_document" | "workspace_chat";
  workspaceId: string;
  kstDate: string;
  networkBucketDigest?: string;
}>;

type TrialAiAdmission =
  | Readonly<{ kind: "not-applicable" }>
  | Readonly<{ kind: "admitted"; leaseId: string; remaining: 0 | 1 | 2; resetsAt: string }>
  | Readonly<{
      kind: "denied";
      code:
        | "TRIAL_AI_DAILY_LIMIT_REACHED"
        | "TRIAL_AI_NETWORK_LIMIT_REACHED"
        | "TRIAL_AI_GLOBAL_LIMIT_REACHED"
        | "TRIAL_AI_REQUEST_IN_PROGRESS"
        | "TRIAL_AI_ADMISSION_UNAVAILABLE";
      resetsAt?: string;
    }>;
```

일반 로그인 사용자는 `not-applicable`을 받는다. 유효한 visitor subject가 없는 익명 Trial은 일반 사용자로 통과시키지 않고 닫는다.

하나의 PostgreSQL transaction이 다음 작업을 원자적으로 수행한다.

1. 해당 KST 날짜의 방문자·네트워크·전체 row를 생성하거나 잠근다.
2. 소진된 한도가 있으면 거부한다.
3. 동일 방문자의 활성 lease가 있으면 거부한다.
4. 세 admitted counter를 모두 증가시킨다.
5. 짧은 수명의 lease를 생성한다.
6. 방문자 잔여 횟수와 다음 KST 자정을 반환한다.

unique constraint는 `(visitorDigest, kstDate)`, `(networkDigest, kstDate)`, 전체 row의 `kstDate`에 둔다. lease 만료는 DB 시간을 사용하고, KST 날짜는 공통 helper 하나에서만 계산한다. 저장소 오류는 `TRIAL_AI_ADMISSION_UNAVAILABLE`을 반환하며 제한 없는 모델 호출을 허용하지 않는다.

## 차감과 실패 규칙

- 잘못된 JSON, 빈 질문, 잘못된 provider/model, 미인증, 없는 workspace/document, 권한 거부는 admission 전에 반환하며 차감하지 않는다.
- admission 성공 후에는 embedding, retrieval, 생성, 저장, streaming, client 연결, provider 오류가 나도 차감한다.
- admission 이후 client abort도 차감한다.
- 요청 종료 또는 DB 시간 기준 만료 시 lease만 해제한다. admitted counter는 감소시키지 않는다.
- Workspace AI는 NDJSON 응답을 시작하기 전에 admission한다. 한도 오류는 stream event가 아니라 일반 JSON 429 응답이다.

일일 한도 거부는 HTTP 429, `Cache-Control: private, no-store`, 안정된 공개 code, KST 자정까지의 `Retry-After`를 사용한다. admission 인프라 장애는 HTTP 503과 `TRIAL_AI_ADMISSION_UNAVAILABLE`을 사용한다.

## UI

- Trial의 Ask AI와 Workspace AI에 `오늘 AI 체험 N회 남음`을 표시한다.
- 초기 값은 인증된 Trial entitlement endpoint가 반환하는 `remaining`, `limit`, `resetsAt`만 사용한다. visitor/network 식별자는 반환하지 않는다.
- Ask AI 성공 응답과 Workspace AI 최초 NDJSON `start` event에 authoritative 잔여 횟수를 포함한다.
- 429를 받으면 두 composer를 비활성화하고 한국 시간 자정에 초기화됨을 안내한다.
- localStorage 계산값이나 optimistic decrement를 권한의 source of truth로 사용하지 않는다.

## 보존과 관측성

- 방문자 일일 사용량은 keyed visitor digest, KST 날짜, counter, 제한된 timestamp만 35일 보존한다.
- 일일 네트워크·전체 row는 8일 보존한다.
- 만료 lease는 24시간 뒤 멱등하게 삭제하며 현재 날짜 counter를 바꾸지 않는다.
- 운영 event에는 surface, 공개 결과 code, 잔여 횟수 구간, 익명 Trial 여부만 허용한다.
- visitor/network digest, raw token, raw IP, 질문, prompt, context, 답변, 문서 내용, provider response, challenge token은 응답과 telemetry에서 금지한다.

## 파일과 책임 경계

- `lib/auth/trial-visitor.ts`: 토큰 생성·검증, subject 파생, cookie 계약
- `lib/security/trial-network-bucket.ts`: 신뢰된 네트워크 입력 축약과 일일 HMAC
- `lib/rag/trial-ai-admission.ts`: 공통 admission service와 오류 code
- `app/api/trial/entitlement/route.ts`: 잔여 횟수 projection과 challenge 기반 토큰 재발급
- `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`: 권한 확인 후 Ask AI 작업 전 admission
- `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`: 권한 확인 후 stream 준비·응답 전 admission
- `components/document-editor/ai-assistant-panel.tsx`, `components/workspace-chatbot.tsx`: 잔여 횟수와 거부 UX
- `prisma/schema.prisma`와 migration 1개: 방문자·네트워크·전체 일일 counter와 lease
- unit, route, concurrency, privacy, Playwright Trial 테스트

admission module은 model provider, prompt builder, UI를 import하지 않는다. 각 AI service는 자체 counter를 만들지 않는다. Trial identity 코드는 `legacy-account-2@example.invalid`을 조회하거나 재활성화하지 않는다.

## 검증과 rollout

테스트는 다음을 증명해야 한다.

- Ask AI와 Workspace AI가 합산 3회 한도를 공유한다.
- 동일 visitor token의 새 NextAuth 세션은 사용량을 유지한다.
- 동시 네 번째 요청이나 중복 요청으로 3회를 초과하지 못한다.
- 잘못된 입력과 권한 거부는 차감하지 않는다.
- admission 후 provider 실패와 client abort는 차감한다.
- 네트워크·전체 한도가 방문자 잔여량보다 우선하며 다른 방문자 정보를 노출하지 않는다.
- 위조 토큰, 신뢰된 네트워크 식별자 누락, DB 장애, 잘못된 설정은 fail closed한다.
- 일반 로그인 사용자는 기존 동작을 유지한다.
- token, IP/network digest, AI 내용이 응답·telemetry에 들어가지 않는다.
- 기존 Trial 계정은 production에서 계속 닫혀 있다.

rollout 기본값은 closed다. schema와 코드를 비활성 상태로 먼저 배포하고 migration·거부 경로를 확인한 후, 전체 한도와 엄격한 challenge/network secret을 설정하고 synthetic smoke test를 통과해야 capability를 연다. capability 제거만으로 일반 사용자 AI에 영향을 주지 않고 익명 Trial AI를 즉시 닫을 수 있어야 한다.

## 제외 범위

- 로그인 없이 유일한 사람을 증명하는 기능
- 브라우저 fingerprint 또는 날짜를 넘는 영구 IP 추적
- 기존 공유 Trial 사용자나 production seed 재활성화
- 일반 사용자 billing/quota 변경
- Trial 쓰기, custom model/provider 선택, 임의 workspace 접근
