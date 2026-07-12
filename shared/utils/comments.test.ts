import { describe, expect, it } from 'vitest'
import type { Comment } from '#shared/types'
import { summarizeCommentTree } from './comments'

const comment = (id: number, author: string, children: Comment[] = []): Comment => ({
  id,
  author,
  children,
  created_at: '2026-07-12T00:00:00Z',
  parent_id: id - 1,
  text: '',
})

describe('comment tree summary', () => {
  it('collects all tree statistics in one traversal', () => {
    const comments = [
      comment(1, 'alice', [
        comment(2, 'bob', [
          comment(3, 'alice', [comment(4, 'carol')]),
        ]),
      ]),
    ]

    const summary = summarizeCommentTree(comments)

    expect(summary.total).toBe(4)
    expect(summary.authorCounts.get('alice')).toBe(2)
    expect(summary.descendantCounts.get(1)).toBe(3)
    expect(summary.descendantCounts.get(3)).toBe(1)
    expect(summary.hasRepliesBeyondDefaultDepth).toBe(true)
  })
})
