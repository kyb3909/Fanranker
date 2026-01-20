import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

/**
 * POST /api/upload/image
 * 이미지를 Supabase Storage에 업로드
 * 
 * Body: FormData with 'file' field
 * 
 * Returns: { url: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: '파일이 없습니다.' },
        { status: 400 }
      )
    }

    // 파일 타입 검증
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: '이미지 파일만 업로드할 수 있습니다.' },
        { status: 400 }
      )
    }

    // 파일 크기 제한 (10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: '파일 크기는 10MB를 초과할 수 없습니다.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // 파일명 생성: userId/timestamp-randomUUID.확장자
    const fileExt = file.name.split('.').pop() || 'jpg'
    const timestamp = Date.now()
    const randomUUID = crypto.randomUUID().substring(0, 8)
    const fileName = `${userId}/${timestamp}-${randomUUID}.${fileExt}`

    // Supabase Storage에 업로드
    // 버킷 이름: 'posts' (또는 'images')
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('posts')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false, // 기존 파일 덮어쓰기 방지
      })

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError)
      return NextResponse.json(
        { error: '이미지 업로드에 실패했습니다.', details: uploadError.message },
        { status: 500 }
      )
    }

    // Public URL 가져오기
    const { data: publicUrlData } = supabase.storage
      .from('posts')
      .getPublicUrl(uploadData.path)

    const imageUrl = publicUrlData.publicUrl

    return NextResponse.json({ url: imageUrl }, { status: 200 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
