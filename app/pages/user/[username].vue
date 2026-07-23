<template>
  <div class="user-shell seed-palette-surface min-h-full text-slate-900 dark:text-slate-100" :style="userPaletteStyle">
    <div class="mx-auto max-w-7xl px-4 py-8 md:py-10">
      <div v-if="pageError" class="mt-20 text-center">
        <h1 class="mb-4 text-3xl font-display font-semibold">User not found</h1>
        <p class="mb-6 leading-7">{{ pageError }}</p>
        <NuxtLink
          to="/top"
          class="inline-flex items-center rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
        >
          Back to Top Stories
        </NuxtLink>
      </div>

      <div v-else>
        <header class="user-hero">
          <div class="min-w-0">
            <p class="user-kicker meta-text mb-2 inline-flex items-center gap-2 font-semibold uppercase">
              <span class="user-kicker-dot h-2.5 w-2.5 rounded-full" aria-hidden="true"></span>
              HN user
            </p>
            <h1 class="mb-3 text-3xl font-display font-semibold leading-tight md:text-5xl">
              {{ displayUsername }}
            </h1>
            <div class="meta-text flex flex-wrap items-center gap-x-4 gap-y-2 text-slate-600 dark:text-slate-300">
              <span class="inline-flex items-center gap-1.5">
                <LucideTrendingUp class="h-4 w-4" aria-hidden="true" />
                {{ formattedKarma }}
              </span>
              <span v-if="joinedDate" class="inline-flex items-center gap-1.5">
                <LucideClock class="h-4 w-4" aria-hidden="true" />
                {{ joinedDate }}
              </span>
            </div>
            <div
              v-if="sanitizedAbout"
              class="rich-text user-about mt-5 max-w-3xl text-sm leading-7 text-slate-700 dark:text-slate-200"
              v-html="sanitizedAbout"
            ></div>
          </div>

          <div class="user-summary-panel">
            <div class="user-summary-grid">
              <div class="user-stat">
                <span class="user-stat-label">Posts</span>
                <span class="user-stat-value">{{ formattedPostTotal }}</span>
              </div>
              <div class="user-stat">
                <span class="user-stat-label">Comments</span>
                <span class="user-stat-value">{{ formattedCommentTotal }}</span>
              </div>
            </div>
            <a
              :href="hnUserUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="user-hn-link"
            >
              <LucideExternalLink class="h-4 w-4" aria-hidden="true" />
              <span>View on HN</span>
            </a>
          </div>
        </header>

        <div class="activity-toolbar">
          <div class="activity-tabs" role="tablist" aria-label="User activity">
            <button
              type="button"
              role="tab"
              class="activity-tab"
              :class="{ 'activity-tab-active': activeTab === 'posts' }"
              :aria-selected="activeTab === 'posts'"
              @click="activeTab = 'posts'"
            >
              <LucideFileText class="h-4 w-4" aria-hidden="true" />
              <span>Posts</span>
              <span class="activity-tab-count">{{ formattedPostTotal }}</span>
            </button>
            <button
              type="button"
              role="tab"
              class="activity-tab"
              :class="{ 'activity-tab-active': activeTab === 'comments' }"
              :aria-selected="activeTab === 'comments'"
              @click="activeTab = 'comments'"
            >
              <LucideMessageSquare class="h-4 w-4" aria-hidden="true" />
              <span>Comments</span>
              <span class="activity-tab-count">{{ formattedCommentTotal }}</span>
            </button>
          </div>
        </div>

        <section v-show="activeTab === 'posts'" role="tabpanel" aria-label="Posts">
          <div
            v-if="postsInitialLoading"
            key="posts-loading"
            class="grid grid-cols-1 gap-6 md:gap-7 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
          >
            <div
              v-for="index in 6"
              :key="`user-post-loading-${index}`"
              class="user-post-skeleton"
              aria-hidden="true"
            >
              <div class="user-post-skeleton-shot"></div>
              <div class="user-post-skeleton-body">
                <span class="skeleton-line w-28"></span>
                <span class="skeleton-line w-11/12"></span>
                <span class="skeleton-line w-8/12"></span>
              </div>
            </div>
          </div>

          <div v-else-if="posts.length === 0" key="posts-empty" class="activity-empty">
            No posts found.
          </div>

          <div v-else key="posts-grid" class="grid grid-cols-1 gap-6 md:gap-7 sm:grid-cols-2 lg:grid-cols-3">
            <StoryCard
              v-for="post in posts"
              :key="post.objectID"
              :story="post"
            />
          </div>

          <div ref="postSentinelRef" class="load-sentinel" aria-hidden="true"></div>

          <div v-if="postsErrorMessage" class="activity-error">
            {{ postsErrorMessage }}
          </div>

          <div v-if="postsLoadingMore" class="activity-loading" aria-live="polite">
            <LucideRefreshCw class="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Loading posts</span>
          </div>

          <div v-else-if="postHasMore && posts.length > 0" class="activity-load-more">
            <button type="button" class="activity-load-button" @click="loadMorePosts">
              Load more
            </button>
          </div>
        </section>

        <section v-show="activeTab === 'comments'" role="tabpanel" aria-label="Comments">
          <div
            v-if="commentsInitialLoading"
            key="comments-loading"
            class="space-y-4"
            aria-busy="true"
          >
            <div
              v-for="index in 6"
              :key="`user-comment-loading-${index}`"
              class="user-comment-skeleton"
              aria-hidden="true"
            >
              <span class="skeleton-line w-9/12"></span>
              <span class="skeleton-line w-full"></span>
              <span class="skeleton-line w-10/12"></span>
            </div>
          </div>

          <div v-else-if="comments.length === 0" key="comments-empty" class="activity-empty">
            No comments found.
          </div>

          <div v-else key="comments-list" class="space-y-4">
            <UserCommentCard
              v-for="comment in comments"
              :key="comment.objectID"
              :comment="comment"
            />
          </div>

          <div ref="commentSentinelRef" class="load-sentinel" aria-hidden="true"></div>

          <div v-if="commentsErrorMessage" class="activity-error">
            {{ commentsErrorMessage }}
          </div>

          <div v-if="commentsLoadingMore" class="activity-loading" aria-live="polite">
            <LucideRefreshCw class="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Loading comments</span>
          </div>

          <div v-else-if="commentHasMore && comments.length > 0" class="activity-load-more">
            <button type="button" class="activity-load-button" @click="loadMoreComments">
              Load more
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  LucideClock,
  LucideExternalLink,
  LucideFileText,
  LucideMessageSquare,
  LucideRefreshCw,
  LucideTrendingUp,
} from '@lucide/vue'
import type { HNUserProfile, UserActivityPage, UserComment, UserPost } from '#shared/types'
import { formatCalendarDate, formatTimeAgo } from '#shared/utils/date'
import { normalizeHnUsername } from '#shared/utils/hn'
import { useSanitizer } from '~/composables/useSanitizer'
import { getSeedPaletteStyle } from '~/composables/useSeedPalette'

type ActivityTab = 'comments' | 'posts'

const PAGE_SIZE = 30

const route = useRoute()
const { sanitize } = useSanitizer()
const numberFormatter = new Intl.NumberFormat('en-US')

const username = computed(() => normalizeHnUsername(route.params.username))
const encodedUsername = computed(() => encodeURIComponent(username.value))
const activeTab = ref<ActivityTab>('posts')

const posts = ref<UserPost[]>([])
const comments = ref<UserComment[]>([])
const postTotal = ref(0)
const commentTotal = ref(0)
const postHasMore = ref(false)
const commentHasMore = ref(false)
const postNextPage = ref<number | null>(null)
const commentNextPage = ref<number | null>(null)
const postNextCursor = ref<number | null>(null)
const commentNextCursor = ref<number | null>(null)
const postsLoadingMore = ref(false)
const commentsLoadingMore = ref(false)
const postsErrorMessage = ref<string | null>(null)
const commentsErrorMessage = ref<string | null>(null)
const postSentinelRef = ref<HTMLElement | null>(null)
const commentSentinelRef = ref<HTMLElement | null>(null)

const profileDataKey = computed(() => `user-profile:${username.value || 'missing'}`)
const postsDataKey = computed(() => `user-posts:${username.value || 'missing'}:${PAGE_SIZE}`)
const commentsDataKey = computed(() => `user-comments:${username.value || 'missing'}:${PAGE_SIZE}`)

const [
  profileAsyncData,
  initialPostsAsyncData,
  initialCommentsAsyncData,
] = await Promise.all([
  useAsyncData<HNUserProfile | null>(
    profileDataKey,
    async () => {
      if (!username.value) {
        return null
      }

      return await $fetch<HNUserProfile>(`/api/user/${encodedUsername.value}`, {
        retry: 0,
      })
    },
    {
      default: () => null,
      watch: [username],
    },
  ),
  useAsyncData<UserActivityPage<UserPost> | null>(
    postsDataKey,
    async () => {
      if (!username.value) {
        return null
      }

      return await $fetch<UserActivityPage<UserPost>>(`/api/user/${encodedUsername.value}/stories`, {
        query: {
          hitsPerPage: PAGE_SIZE,
          page: 0,
        },
        retry: 0,
      })
    },
    {
      default: () => null,
      watch: [username],
    },
  ),
  useAsyncData<UserActivityPage<UserComment> | null>(
    commentsDataKey,
    async () => {
      if (!username.value) {
        return null
      }

      return await $fetch<UserActivityPage<UserComment>>(`/api/user/${encodedUsername.value}/comments`, {
        query: {
          hitsPerPage: PAGE_SIZE,
          page: 0,
        },
        retry: 0,
      })
    },
    {
      default: () => null,
      watch: [username],
    },
  ),
])

const { data: profile, pending: profilePending, error: profileFetchError } = profileAsyncData
const { data: initialPostsData, pending: postsPending, error: postsFetchError } = initialPostsAsyncData
const { data: initialCommentsData, pending: commentsPending, error: commentsFetchError } = initialCommentsAsyncData

const mergeByObjectId = <T extends { objectID: string }>(currentItems: T[], incomingItems: T[]) => {
  const seen = new Set(currentItems.map((item) => item.objectID))
  const mergedItems = [...currentItems]

  incomingItems.forEach((item) => {
    if (!seen.has(item.objectID)) {
      seen.add(item.objectID)
      mergedItems.push(item)
    }
  })

  return mergedItems
}

const applyPostsResponse = (response: UserActivityPage<UserPost> | null | undefined, append = false) => {
  if (!response) {
    return
  }

  posts.value = append ? mergeByObjectId(posts.value, response.items) : response.items
  postTotal.value = response.nbHits
  postHasMore.value = response.hasMore
  postNextPage.value = response.nextPage
  postNextCursor.value = response.nextCursor
}

const applyCommentsResponse = (response: UserActivityPage<UserComment> | null | undefined, append = false) => {
  if (!response) {
    return
  }

  comments.value = append ? mergeByObjectId(comments.value, response.items) : response.items
  commentTotal.value = response.nbHits
  commentHasMore.value = response.hasMore
  commentNextPage.value = response.nextPage
  commentNextCursor.value = response.nextCursor
}

watch(initialPostsData, (response) => applyPostsResponse(response), { immediate: true })
watch(initialCommentsData, (response) => applyCommentsResponse(response), { immediate: true })

watch(username, () => {
  posts.value = []
  comments.value = []
  postTotal.value = 0
  commentTotal.value = 0
  postHasMore.value = false
  commentHasMore.value = false
  postNextPage.value = null
  commentNextPage.value = null
  postNextCursor.value = null
  commentNextCursor.value = null
  postsErrorMessage.value = null
  commentsErrorMessage.value = null
})

watch(postsFetchError, (error) => {
  postsErrorMessage.value = error?.message ?? null
}, { immediate: true })

watch(commentsFetchError, (error) => {
  commentsErrorMessage.value = error?.message ?? null
}, { immediate: true })

const fetchActivityPage = async <T,>(
  endpoint: 'comments' | 'stories',
  nextPage: number | null,
  nextCursor: number | null,
) => {
  const query: Record<string, number> = {
    hitsPerPage: PAGE_SIZE,
  }

  if (nextPage !== null) {
    query.page = nextPage
  } else if (nextCursor !== null) {
    query.before = nextCursor
  } else {
    query.page = 0
  }

  return await $fetch<UserActivityPage<T>>(`/api/user/${encodedUsername.value}/${endpoint}`, {
    query,
    retry: 0,
  })
}

const loadMorePosts = async () => {
  if (!username.value || postsLoadingMore.value || !postHasMore.value) {
    return
  }

  postsLoadingMore.value = true
  postsErrorMessage.value = null

  try {
    const response = await fetchActivityPage<UserPost>('stories', postNextPage.value, postNextCursor.value)
    applyPostsResponse(response, true)
  } catch (error) {
    postsErrorMessage.value = error instanceof Error ? error.message : 'Failed to load posts'
  } finally {
    postsLoadingMore.value = false
  }
}

const loadMoreComments = async () => {
  if (!username.value || commentsLoadingMore.value || !commentHasMore.value) {
    return
  }

  commentsLoadingMore.value = true
  commentsErrorMessage.value = null

  try {
    const response = await fetchActivityPage<UserComment>('comments', commentNextPage.value, commentNextCursor.value)
    applyCommentsResponse(response, true)
  } catch (error) {
    commentsErrorMessage.value = error instanceof Error ? error.message : 'Failed to load comments'
  } finally {
    commentsLoadingMore.value = false
  }
}

let postObserver: IntersectionObserver | null = null
let commentObserver: IntersectionObserver | null = null

const observeActivitySentinels = () => {
  postObserver?.disconnect()
  commentObserver?.disconnect()

  if (!import.meta.client || !('IntersectionObserver' in window)) {
    return
  }

  postObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && activeTab.value === 'posts') {
      loadMorePosts()
    }
  }, { rootMargin: '720px 0px' })

  commentObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && activeTab.value === 'comments') {
      loadMoreComments()
    }
  }, { rootMargin: '720px 0px' })

  if (postSentinelRef.value) {
    postObserver.observe(postSentinelRef.value)
  }

  if (commentSentinelRef.value) {
    commentObserver.observe(commentSentinelRef.value)
  }
}

onMounted(() => {
  nextTick(observeActivitySentinels)
})

onBeforeUnmount(() => {
  postObserver?.disconnect()
  commentObserver?.disconnect()
})

const pageError = computed(() => {
  if (!username.value) {
    return 'A valid HN username is required.'
  }

  if (profileFetchError.value) {
    return profileFetchError.value.message
  }

  if (!profilePending.value && !profile.value) {
    return 'This HN user could not be loaded.'
  }

  return null
})

const displayUsername = computed(() => profile.value?.username || username.value)
const userPaletteStyle = computed(() => getSeedPaletteStyle(displayUsername.value))
const hnUserUrl = computed(() => `https://news.ycombinator.com/user?id=${encodeURIComponent(displayUsername.value)}`)
const formattedKarma = computed(() => `${numberFormatter.format(profile.value?.karma || 0)} karma`)
const formattedPostTotal = computed(() => numberFormatter.format(postTotal.value))
const formattedCommentTotal = computed(() => numberFormatter.format(commentTotal.value))
const sanitizedAbout = computed(() => sanitize(profile.value?.about || '', `user-about-${displayUsername.value}`))
const postsInitialLoading = computed(() => postsPending.value && posts.value.length === 0)
const commentsInitialLoading = computed(() => commentsPending.value && comments.value.length === 0)

const joinedDate = computed(() => {
  if (!profile.value?.created_at) {
    return ''
  }

  const createdAt = new Date(profile.value.created_at)

  if (Number.isNaN(createdAt.getTime())) {
    return ''
  }

  return `${formatCalendarDate(createdAt)} (${formatTimeAgo(createdAt)})`
})

useSeoMeta({
  title: () => `${displayUsername.value} on HN Glance`,
  description: () => `Posts and comments by ${displayUsername.value} on Hacker News.`,
  ogTitle: () => `${displayUsername.value} on HN Glance`,
  ogDescription: () => `Posts and comments by ${displayUsername.value} on Hacker News.`,
})
</script>

<style scoped>
.user-shell {
  position: relative;
  isolation: isolate;
  background:
    radial-gradient(circle at 8% -9%, var(--seed-ring) 0, transparent 31rem),
    radial-gradient(circle at 90% -7%, rgb(249 115 22 / 0.14) 0, transparent 29rem),
    linear-gradient(135deg, rgb(248 250 252) 0%, rgb(241 245 249) 52%, rgb(255 247 237) 100%);
}

.dark .user-shell {
  background:
    radial-gradient(circle at 8% -9%, var(--seed-ring) 0, transparent 31rem),
    radial-gradient(circle at 90% -7%, rgb(249 115 22 / 0.14) 0, transparent 29rem),
    linear-gradient(135deg, rgb(15 23 42) 0%, rgb(17 24 39) 52%, rgb(12 18 31) 100%);
}

.user-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    linear-gradient(rgb(15 23 42 / 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgb(15 23 42 / 0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  -webkit-mask-image: linear-gradient(180deg, rgb(0 0 0 / 0.46), transparent 72%);
  mask-image: linear-gradient(180deg, rgb(0 0 0 / 0.46), transparent 72%);
}

.dark .user-shell::before {
  background-image:
    linear-gradient(rgb(255 255 255 / 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 0.04) 1px, transparent 1px);
}

.user-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--seed-border);
}

.user-kicker {
  color: var(--seed-accent-strong);
}

.user-kicker-dot {
  background: var(--seed-accent);
  box-shadow:
    0 0 0 4px var(--seed-ring),
    0 8px 22px var(--seed-ring);
}

.user-about {
  border-left: 3px solid var(--seed-border);
  padding-left: 1rem;
}

.user-summary-panel {
  align-self: start;
  border: 1px solid color-mix(in oklch, var(--seed-border) 82%, transparent);
  border-radius: 0.5rem;
  background:
    linear-gradient(135deg, var(--seed-highlight), transparent 36%),
    linear-gradient(180deg, var(--seed-surface-raised), var(--seed-surface)),
    rgb(255 255 255 / 0.74);
  padding: 1rem;
  box-shadow:
    0 16px 42px var(--seed-shadow),
    inset 0 1px 0 rgb(255 255 255 / 0.34);
}

.dark .user-summary-panel {
  background:
    linear-gradient(135deg, var(--seed-highlight), transparent 36%),
    linear-gradient(180deg, var(--seed-surface-raised), var(--seed-surface)),
    rgb(15 23 42 / 0.62);
  box-shadow:
    0 16px 42px var(--seed-shadow),
    inset 0 1px 0 rgb(255 255 255 / 0.08);
}

.user-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.user-stat {
  min-width: 0;
  border-radius: 0.45rem;
  border: 1px solid var(--seed-metric-border);
  background:
    linear-gradient(180deg, var(--seed-highlight), transparent 48%),
    var(--seed-metric-bg);
  padding: 0.8rem;
  box-shadow: 0 1px 0 rgb(255 255 255 / 0.34) inset;
}

.user-stat-label,
.user-stat-value {
  display: block;
}

.user-stat-label {
  margin-bottom: 0.25rem;
  color: rgb(71 85 105);
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1.2;
}

.dark .user-stat-label {
  color: rgb(203 213 225);
}

.user-stat-value {
  color: var(--seed-author-text);
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;
}

.user-hn-link {
  display: inline-flex;
  min-height: 2.35rem;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border: 1px solid var(--seed-border);
  border-radius: 0.45rem;
  color: var(--seed-author-text);
  font-size: 0.84rem;
  font-weight: 700;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.user-hn-link:hover {
  border-color: var(--seed-accent);
  background: var(--seed-accent-soft);
  color: var(--seed-accent-strong);
}

.activity-toolbar {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 1.35rem;
}

.activity-tabs {
  display: inline-flex;
  max-width: 100%;
  gap: 0.25rem;
  overflow-x: auto;
  border: 1px solid color-mix(in oklch, var(--seed-border) 82%, transparent);
  border-radius: 0.5rem;
  background:
    linear-gradient(135deg, var(--seed-highlight), transparent 36%),
    rgb(255 255 255 / 0.68);
  padding: 0.25rem;
  box-shadow: 0 12px 30px var(--seed-shadow);
  scrollbar-width: none;
}

.activity-tabs::-webkit-scrollbar {
  display: none;
}

.dark .activity-tabs {
  background:
    linear-gradient(135deg, var(--seed-highlight), transparent 36%),
    rgb(15 23 42 / 0.62);
}

.activity-tab {
  display: inline-flex;
  min-height: 2.2rem;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.42rem;
  border-radius: 0.38rem;
  padding: 0.45rem 0.7rem;
  color: rgb(71 85 105);
  font-size: 0.83rem;
  font-weight: 700;
  line-height: 1;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.dark .activity-tab {
  color: rgb(203 213 225);
}

.activity-tab:hover {
  color: var(--seed-accent-strong);
}

.activity-tab-active,
.dark .activity-tab-active {
  background:
    linear-gradient(180deg, var(--seed-highlight), transparent 46%),
    var(--seed-metric-bg-hover);
  color: var(--seed-accent-strong);
}

.activity-tab-count {
  min-width: 1.35rem;
  border-radius: 999px;
  background: rgb(15 23 42 / 0.08);
  padding: 0.14rem 0.38rem;
  text-align: center;
  font-size: 0.72rem;
}

.dark .activity-tab-count {
  background: rgb(255 255 255 / 0.1);
}

.activity-empty,
.activity-error,
.activity-loading,
.activity-load-more {
  display: flex;
  justify-content: center;
  margin-top: 1.25rem;
  color: rgb(71 85 105);
  font-size: 0.9rem;
  font-weight: 600;
}

.dark .activity-empty,
.dark .activity-error,
.dark .activity-loading,
.dark .activity-load-more {
  color: rgb(203 213 225);
}

.activity-error {
  color: rgb(185 28 28);
}

.dark .activity-error {
  color: rgb(252 165 165);
}

.activity-loading {
  align-items: center;
  gap: 0.45rem;
}

.activity-load-button {
  min-height: 2.35rem;
  border: 1px solid var(--seed-metric-border);
  border-radius: 0.45rem;
  background:
    linear-gradient(180deg, var(--seed-highlight), transparent 46%),
    var(--seed-metric-bg);
  padding: 0.55rem 0.95rem;
  color: var(--seed-author-text);
  font-size: 0.84rem;
  font-weight: 700;
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.34) inset,
    0 10px 24px var(--seed-shadow);
}

.activity-load-button:hover {
  border-color: var(--seed-border-strong);
  background:
    linear-gradient(180deg, var(--seed-highlight), transparent 42%),
    var(--seed-metric-bg-hover);
  color: var(--seed-accent-strong);
}

.dark .activity-load-button {
  background: rgb(15 23 42 / 0.66);
}

.load-sentinel {
  height: 1px;
}

.user-post-skeleton,
.user-comment-skeleton {
  overflow: hidden;
  border: 1px solid color-mix(in oklch, var(--seed-border) 82%, transparent);
  border-radius: 0.5rem;
  background:
    linear-gradient(135deg, var(--seed-highlight), transparent 36%),
    linear-gradient(180deg, var(--seed-surface-raised), var(--seed-surface)),
    rgb(255 255 255 / 0.72);
  box-shadow: 0 14px 34px var(--seed-shadow);
}

.dark .user-post-skeleton,
.dark .user-comment-skeleton {
  background:
    linear-gradient(135deg, var(--seed-highlight), transparent 36%),
    linear-gradient(180deg, var(--seed-surface-raised), var(--seed-surface)),
    rgb(15 23 42 / 0.62);
}

.user-post-skeleton-shot {
  aspect-ratio: 1;
  background:
    radial-gradient(circle at 24% 22%, var(--seed-accent-soft), transparent 28%),
    linear-gradient(180deg, var(--seed-surface) 0%, var(--seed-surface-strong) 100%);
}

.user-post-skeleton-body,
.user-comment-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem;
}

.skeleton-line {
  display: block;
  height: 0.7rem;
  border-radius: 999px;
  background:
    linear-gradient(180deg, var(--seed-highlight), transparent 48%),
    var(--seed-metric-bg);
  border: 1px solid var(--seed-metric-border);
}

@media (min-width: 900px) {
  .user-hero {
    grid-template-columns: minmax(0, 1fr) minmax(17rem, 20rem);
    align-items: start;
  }
}
</style>
