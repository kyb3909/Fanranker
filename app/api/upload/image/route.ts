import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'

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
    const user = await currentUser()

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const userId = user.id

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const type = request.nextUrl.searchParams.get('type') // 'avatar' | null (게시글 이미지)

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

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()

    // 파일명 생성: avatar → avatars/userId/... , 게시글 → userId/...
    const fileExt = file.name.split('.').pop() || 'jpg'
    const timestamp = Date.now()
    const randomUUID = crypto.randomUUID().substring(0, 8)
    const baseName = `${timestamp}-${randomUUID}.${fileExt}`
    const fileName = type === 'avatar' ? `avatars/${userId}/${baseName}` : `${userId}/${baseName}`

    // Supabase Storage에 업로드
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('posts')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError)
      return NextResponse.json(
        { error: '이미지 업로드에 실패했습니다.' },
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
