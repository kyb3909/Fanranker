# LFA 전용 경기 DB 적용 기록

- 확인 시각: 2026-09-06 01:39 KST.
- 프로젝트: gongnori.fan / `ekysrlhdrapmsnrkytif` (운영).
- 적용 파일: `supabase/migrations/20260905_lfa_fixtures.sql`.
- 앱 커밋: `1e01ebc8`까지 main에 푸시한 뒤, 사용자의 별도 DB 적용 승인으로 실행.
- 방법: Supabase CLI의 연결 프로젝트 Management API SQL 실행. 전체 `db push`는 실행하지 않음.

## 적용 범위

원본 마이그레이션의 테이블·제약·인덱스·권한 설정과 이력 등록을 한 트랜잭션으로 적용했다.
이력은 `supabase_migrations.schema_migrations`의 version `20260905`, name `lfa_fixtures`로 1건이다.
PostgREST 스키마 재로딩을 요청하고 실제 REST 조회로 반영을 확인했다.

기존 테이블과 경기·불판·투표 데이터는 수정하지 않았다. 다른 미적용 SQL, VPS 변경,
경기 수집 크론 강제 실행, 과거 데이터 백필은 이번 작업에 포함하지 않았다.

## 검증

1. 사전 조회에서 대상 테이블이 없고 UUID 함수·DB 역할·이력 저장소가 있음을 확인했다.
2. 동일 DDL의 트랜잭션 리허설에서 서비스 계정 insert/update, LFA ID unique 제약,
   fixture와 LFA ID 일치 제약, anon/authenticated의 SELECT 차단을 검증했다.
3. 리허설 전체를 ROLLBACK하고 테이블 미잔류를 확인한 뒤 정식 적용했다.
4. 적용 후 7개 컬럼, PK/unique 2개/check 제약, 경기 시각 인덱스, RLS 활성화를 확인했다.
5. anon/authenticated는 SELECT/INSERT/UPDATE/DELETE 권한이 없다.
   서비스 계정의 SELECT/INSERT/UPDATE는 허용된다. 운영 DB 기본 ACL에 따른 DELETE 권한도 유지된다.
6. 실제 REST 경로: service_role은 HTTP 200, 비로그인은 HTTP 401 / PostgreSQL 권한 오류 42501.
   로그인 역할은 DB의 `SET LOCAL ROLE authenticated` 및 권한 조회로 검증했으며 Clerk 로그인 E2E는 실행하지 않았다.
7. 리허설 테스트 행은 0건이다. `pnpm exec tsc --noEmit`도 통과했다.

## 남은 확인과 되돌리기

DB 선행조건은 해소됐다. 실제 미판매 경기의 등록→라인업→불판→실황→종료→MOM 전 과정은
별도 운영 검증 대상이며, 이번 DB 적용 성공이 전체 경기 파이프라인 무오류를 뜻하지 않는다.

정식 적용 후 문제 발생 시 앱 버전을 되돌리고 신규 테이블·실제 생성된 데이터는 유지한다.
운영 데이터가 들어올 수 있으므로 테이블 DROP으로 되돌리지 않는다.
