/**
 * Usage Examples for Supabase + Clerk Integration
 *
 * These examples demonstrate best practices for using the integration
 * in both Client and Server Components.
 */

'use client'

import { useEffect, useState } from 'react'
import { useSupabase, useClerkUserId } from './hooks'

// ============================================
// Example 1: Client Component with useSupabase
// ============================================

interface Post {
  id: string
  title: string
  content: string
  user_id: string
  created_at: string
}

/**
 * Example: Fetching user's own posts with RLS
 *
 * RLS automatically filters posts by user_id,
 * so you only see your own data.
 */
export function UserPostsList() {
  const supabase = useSupabase()
  const userId = useClerkUserId()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }

    async function fetchPosts() {
      const { data, error } = await supabase
        .from('user_posts')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching posts:', error)
      } else {
        setPosts(data ?? [])
      }
      setLoading(false)
    }

    fetchPosts()
  }, [supabase, userId])

  if (!userId) {
    return <p>Please sign in to see your posts.</p>
  }

  if (loading) {
    return <p>Loading...</p>
  }

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}

/**
 * Example: Creating a new post
 *
 * The user_id is automatically set by the database default,
 * so you don't need to include it in the insert.
 */
export function CreatePostForm() {
  const supabase = useSupabase()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const { error } = await supabase
      .from('user_posts')
      .insert({
        title,
        content,
        // user_id is automatically set by DB default: requesting_user_id()
      })

    if (error) {
      console.error('Error creating post:', error)
      alert('Failed to create post')
    } else {
      setTitle('')
      setContent('')
      alert('Post created!')
    }

    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        required
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Content"
      />
      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  )
}

/**
 * Example: Real-time subscription with RLS
 *
 * Supabase Realtime respects RLS policies,
 * so you only receive updates for your own data.
 */
export function RealtimePosts() {
  const supabase = useSupabase()
  const [posts, setPosts] = useState<Post[]>([])

  useEffect(() => {
    // Initial fetch
    supabase
      .from('user_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setPosts(data ?? []))

    // Subscribe to changes
    const channel = supabase
      .channel('user_posts_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_posts',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPosts((prev) => [payload.new as Post, ...prev])
          } else if (payload.eventType === 'DELETE') {
            setPosts((prev) => prev.filter((p) => p.id !== payload.old.id))
          } else if (payload.eventType === 'UPDATE') {
            setPosts((prev) =>
              prev.map((p) => (p.id === payload.new.id ? (payload.new as Post) : p))
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}

// ============================================
// Example 2: Server Component Usage
// ============================================
// Note: This is for reference - paste into a Server Component file

/*
// app/posts/page.tsx (Server Component)
import { createServerAuthClient } from '@/lib/supabase'

export default async function PostsPage() {
  const supabase = await createServerAuthClient()

  const { data: posts, error } = await supabase
    .from('user_posts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return <p>Error loading posts</p>
  }

  return (
    <ul>
      {posts?.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
*/

// ============================================
// Example 3: Server Action Usage
// ============================================
// Note: This is for reference - paste into a Server Action file

/*
// app/actions/posts.ts
'use server'

import { createServerAuthClient } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const supabase = await createServerAuthClient()

  const { error } = await supabase
    .from('user_posts')
    .insert({
      title: formData.get('title') as string,
      content: formData.get('content') as string,
    })

  if (error) {
    throw new Error('Failed to create post')
  }

  revalidatePath('/posts')
}

export async function deletePost(id: string) {
  const supabase = await createServerAuthClient()

  const { error } = await supabase
    .from('user_posts')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error('Failed to delete post')
  }

  revalidatePath('/posts')
}
*/
