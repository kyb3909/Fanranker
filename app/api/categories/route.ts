import { NextResponse } from 'next/server'
import { createServerAnonClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerAnonClient()

  const { data, error } = await supabase
    .from('categories')
    .select('id, slug, name, icon, sort_order, description')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ categories: data })
}
