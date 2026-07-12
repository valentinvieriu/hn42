import type { Comment, StoryDetail } from '#shared/types'

export type AlgoliaItemComment = {
  id: number
  created_at?: string | null
  author?: string | null
  text?: string | null
  parent_id?: number | null
  children?: AlgoliaItemComment[] | null
  [key: string]: unknown
}

export type AlgoliaItemResponse = {
  id?: number
  created_at?: string | null
  author?: string | null
  title?: string | null
  url?: string | null
  text?: string | null
  points?: number | null
  children?: AlgoliaItemComment[] | null
  [key: string]: unknown
}

const normalizeItemComments = (
  comments: AlgoliaItemComment[] | null | undefined,
): Comment[] => {
  return (comments ?? []).map((comment) => ({
    id: comment.id,
    created_at: comment.created_at ?? '',
    author: comment.author ?? 'Unknown',
    text: comment.text ?? '',
    parent_id: comment.parent_id ?? null,
    children: normalizeItemComments(comment.children),
  }))
}

export const normalizeStoryDetail = (item: AlgoliaItemResponse): StoryDetail => ({
  created_at: item.created_at ?? '',
  author: item.author ?? 'Unknown',
  title: item.title || 'Untitled',
  url: item.url ?? '',
  text: item.text ?? null,
  points: item.points ?? 0,
  children: normalizeItemComments(item.children),
})
