# Supabase Storage 설정 가이드

이 가이드는 이미지 업로드를 위한 Supabase Storage 버킷 설정 방법을 설명합니다.

## 📋 Storage 버킷 생성

1. [Supabase Dashboard](https://supabase.com/dashboard) 접속
2. 프로젝트 선택
3. 좌측 메뉴 → **Storage** 클릭
4. **New bucket** 버튼 클릭

## 🪣 버킷 설정

- **Name**: `posts` (또는 원하는 이름)
- **Public bucket**: ✅ **ON** (공개 버킷으로 설정 - 이미지 URL 직접 접근 가능)
- **File size limit**: `10 MB` (또는 원하는 크기)
- **Allowed MIME types**: `image/*` (이미지 파일만 허용)

## 🔒 Storage 정책 설정

Storage 버킷이 생성되면 자동으로 `storage.objects` 테이블이 생성됩니다.  
RLS 정책은 필요에 따라 설정할 수 있습니다.

### 기본 정책 (권장)

**모든 사용자가 읽기 가능, 인증된 사용자만 업로드 가능:**

1. **Storage** → **Policies** 메뉴에서 설정
2. 또는 SQL Editor에서 실행:

```sql
-- 공개 읽기 정책 (이미지 URL 직접 접근)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'posts');

-- 인증된 사용자만 업로드 가능
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'posts' AND
  auth.role() = 'authenticated'
);

-- 사용자는 자신이 업로드한 파일만 삭제 가능
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'posts' AND
  (storage.foldername(name))[1] = auth.jwt()->>'sub'
);
```

## ✅ 확인

버킷 생성 후 다음 명령으로 확인:

```sql
-- 버킷 목록 확인
SELECT name, public FROM storage.buckets;

-- 정책 확인
SELECT * FROM pg_policies WHERE tablename = 'objects';
```

## 📝 참고 사항

- **버킷 이름**: `posts` (코드에서 `supabase.storage.from('posts')` 사용)
- **파일 경로**: `{userId}/{timestamp}-{uuid}.{ext}` 형식으로 저장
- **Public URL**: `https://{project-ref}.supabase.co/storage/v1/object/public/posts/{path}`

---

**마지막 업데이트**: 2026-01-15
