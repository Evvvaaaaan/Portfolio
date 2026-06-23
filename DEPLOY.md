# 배포 가이드 — Vercel + .com 도메인 + 서버리스

## 해야 할 일 체크리스트

### 1. Supabase 설정

- Supabase 프로젝트를 생성합니다.
- Supabase Dashboard → SQL Editor에서 `supabase.sql` 파일 내용을 실행합니다.
- `contact_messages` 테이블이 생성되었는지 확인합니다.
- `resume_requests` 테이블이 생성되었는지 확인합니다.
- Project Settings → API에서 `Project URL`을 복사합니다.
- Project Settings → API에서 `service_role` key를 복사합니다.
- `service_role` key는 절대 프론트엔드 코드나 공개 저장소에 넣지 않습니다.

https://supabase.com/dashboard/project/rwirgphjphjhqaalseak/settings/api-keys

### 2. Resend 설정

- Resend 계정을 생성합니다.
- API Key를 생성합니다.
- 테스트 단계에서는 `onboarding@resend.dev`를 발신 주소로 사용할 수 있습니다.
- 실제 도메인 메일을 쓰려면 Resend에서 도메인을 인증합니다.
- 수신할 관리자 이메일 주소를 정합니다.

### 3. Vercel 프로젝트 설정

- 프로젝트를 GitHub 저장소에 올립니다.
- Vercel에서 해당 GitHub 저장소를 
Import합니다.
- Framework Preset이 `Vite`인지 확인합니다.
- Build Command가 `npm run build`인지 확인합니다.
- Output Directory가 `build`인지 확인합니다.
- Vercel Environment Variables에 아래 값을 등록합니다.

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=Portfolio <hello@yourdomain.com>
CONTACT_TO_EMAIL=your@email.com
```

### 4. 배포 후 기능 확인

- Contact 폼을 제출합니다.
- Supabase `contact_messages` 테이블에 데이터가 저장되는지 확인합니다.
- 관리자 이메일로 Contact 알림이 오는지 확인합니다.
- Resume request 폼을 제출합니다.
- Supabase `resume_requests` 테이블에 데이터가 저장되는지 확인합니다.
- 관리자 이메일로 Resume request 알림이 오는지 확인합니다.
- 실패 상황에서 화면에 에러 메시지가 표시되는지 확인합니다.

### 5. 커스텀 도메인 연결

- `.com` 도메인을 구매합니다.
- Vercel Project → Settings → Domains에서 도메인을 추가합니다.
- 도메인 구매처 DNS에 Vercel이 안내하는 레코드를 등록합니다.
- 루트 도메인과 `www` 도메인 모두 접속되는지 확인합니다.
- HTTPS 인증서가 정상 발급되었는지 확인합니다.

### 6. 최종 점검

- 데스크톱 화면을 확인합니다.
- 모바일 화면을 확인합니다.
- Contact/Resume API가 배포 환경에서 동작하는지 확인합니다.
- 민감한 값이 코드나 커밋에 포함되지 않았는지 확인합니다.
- `npm run build`가 로컬에서 통과하는지 확인합니다.
- 필요하면 Lighthouse로 성능과 접근성을 확인합니다.

## 사전 준비

- Vercel 계정
- Supabase 프로젝트
- Resend 계정
- 구매한 .com 도메인

---

## Step 1. Supabase 테이블 생성

Supabase Dashboard → SQL Editor에서 `supabase.sql` 내용을 실행합니다.

생성되는 테이블:

- `contact_messages`
- `resume_requests`

---

## Step 2. Vercel 환경변수 설정

Vercel Project → Settings → Environment Variables에 아래 값을 등록합니다.

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=Portfolio <hello@yourdomain.com>
CONTACT_TO_EMAIL=your@email.com
```

`SUPABASE_SERVICE_ROLE_KEY`는 브라우저에 노출하면 안 됩니다. 현재 구조에서는 Vercel Function 내부에서만 사용합니다.

---

## Step 3. Vercel 배포

```bash
npm install
npm run build
```

GitHub 저장소를 Vercel에 연결하거나 Vercel CLI로 배포합니다.

Vercel 설정은 `vercel.json`에 고정되어 있습니다.

- Build Command: `npm run build`
- Output Directory: `build`
- Framework: `vite`

---

## Step 4. 도메인 연결

Vercel Dashboard → Project → Settings → Domains에서 구매한 도메인을 추가합니다.

도메인 구매처 DNS에서 Vercel이 안내하는 레코드를 설정합니다.

- 루트 도메인: Vercel 안내의 `A` 레코드
- `www`: Vercel 안내의 `CNAME` 레코드

HTTPS 인증서는 Vercel이 자동 발급합니다.

---

## Step 5. 기능 확인

- Contact 폼 제출 후 Supabase `contact_messages` 테이블 확인
- Resume request 제출 후 Supabase `resume_requests` 테이블 확인
- Resend 이메일 수신 확인
- 모바일/데스크톱 화면 확인

---

## API 구조

- `POST /api/contact`
- `POST /api/resume-request`

두 API 모두 Vercel Functions로 실행되며, Supabase 저장 후 Resend 알림 메일을 보냅니다.

---

## 로컬 테스트

Vercel Functions까지 로컬에서 테스트하려면 Vercel CLI가 필요합니다.

```bash
npm install -g vercel
vercel dev
```

환경변수는 `.env.local`에 넣고 테스트합니다. `.env.local`은 커밋하지 않습니다.
