<template>
  <div class="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
    <div class="max-w-7xl mx-auto p-4 md:p-8 lg:py-10">
      <div v-if="error" class="text-center mt-20">
        <h1 class="text-3xl font-display font-semibold mb-4">Error</h1>
        <p class="mb-6 leading-7">{{ error }}</p>
        <NuxtLink
          to="/"
          class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded"
        >
          Back to Home
        </NuxtLink>
      </div>

      <div v-else-if="isLoading" class="text-center mt-20">
        <h1 class="text-3xl font-display font-semibold mb-4">Loading...</h1>
      </div>

      <div v-else class="grid gap-8 lg:gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
        <article class="min-w-0 lg:col-start-1">
          <h1 class="mb-3 text-3xl font-display font-semibold leading-tight text-gray-900 dark:text-gray-100 md:text-4xl">
            {{ story.title }}
          </h1>
          <a
            :href="story.url"
            target="_blank"
            rel="noopener noreferrer"
            class="meta-text mb-3 flex items-center gap-1.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <span class="truncate">{{ story.url }}</span> <LucideExternalLink size="14" />
          </a>
          <div class="meta-text mb-4 text-gray-600 dark:text-gray-400">
            by
            <NuxtLink
              :to="getUserPath(story.author)"
              class="font-medium text-gray-700 hover:text-gray-900 hover:underline dark:text-gray-300 dark:hover:text-gray-100"
            >
              {{ story.author }}
            </NuxtLink>
            • {{ timeAgo }}
          </div>
          <div class="meta-text flex items-center gap-4 mb-6">
            <span :class="['flex', 'items-center', 'gap-1', story.points >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400']">
              <LucideTrendingUp class="w-4 h-4" />
              {{ story.points }}
            </span>
            <a
              href="#comments"
              aria-label="Jump to comments"
              class="flex items-center gap-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <LucideMessageSquare class="w-4 h-4" />
              {{ commentCount }}
            </a>
            <span class="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <LucideClock class="w-4 h-4" />
              {{ timeAgo }}
            </span>
          </div>
          <div
            class="rich-text reading-measure mb-5 text-base leading-7 text-gray-700 dark:text-gray-300"
            v-html="sanitizedText"
          ></div>
          <img
            :alt="story.title"
            width="600"
            :src="screenshotSrc"
            loading="lazy"
            decoding="async"
            class="hidden md:block w-full h-auto rounded-lg shadow-md mb-8"
          />
        </article>
        <aside id="comments" class="min-w-0 scroll-mt-24 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <div class="comments-toolbar">
            <div class="comments-title-group">
              <h2 class="section-title mb-0 text-2xl font-semibold text-gray-900 dark:text-gray-100">Comments</h2>
              <span v-if="commentCount > 0" class="comments-count text-gray-600 dark:text-gray-400">
                {{ commentCount }}
              </span>
            </div>
            <button
              v-if="hasCollapsedReplies"
              type="button"
              class="expand-comments-button text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
              @click="toggleExpandAllComments"
            >
              <LucideChevronsUp v-if="expandAllComments" class="w-4 h-4" />
              <LucideChevronsDown v-else class="w-4 h-4" />
              <span>{{ expandAllComments ? 'Collapse nested' : 'Expand all' }}</span>
            </button>
          </div>
          <div v-if="story.children.length === 0" class="text-gray-500 leading-7">
            No comments yet.
          </div>
          <div v-else class="space-y-4">
            <CommentThread
              v-for="comment in story.children"
              :key="`${comment.id}-${expandAllComments ? 'expanded' : 'default'}`"
              :comment="comment"
              :expand-all="expandAllComments"
              :author-comment-counts="authorCommentCounts"
            />
          </div>
        </aside>
        <section class="min-w-0 lg:col-start-1">
          <RelatedStories v-if="storyId" :story-id="storyId" />
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { LucideExternalLink, LucideTrendingUp, LucideMessageSquare, LucideClock, LucideChevronsDown, LucideChevronsUp } from '@lucide/vue';
import { formatDistanceToNow } from 'date-fns';
import { useSanitizer } from '~/composables/useSanitizer';

const route = useRoute();
const expandAllComments = ref(false);

type StoryComment = {
  id?: number
  created_at?: string
  author?: string
  text?: string
  points?: number
  parent_id?: number | null
  children?: StoryComment[]
}

type StoryDetail = {
  id: number
  created_at: string
  author: string
  title: string
  url: string
  text: string | null
  points: number
  parent_id: number | null
  children: StoryComment[]
}

const normalizeStoryId = (param: unknown): string | null => {
  const rawId = Array.isArray(param) ? param[0] : param

  return typeof rawId === 'string' && /^\d+$/.test(rawId) ? rawId : null
}

const storyId = computed(() => normalizeStoryId(route.params.id))
const storyDataKey = computed(() => `story-detail:${storyId.value ?? 'missing'}`)
const getUserPath = (author: string) => `/user/${encodeURIComponent(author)}`

const { data: storyData, pending, error: fetchError } = useAsyncData<StoryDetail | null>(
  storyDataKey,
  async () => {
    const id = storyId.value

    if (!id) {
      return null
    }

    return await $fetch<StoryDetail>(`/api/item/${id}`)
  },
  {
    default: () => null,
    watch: [storyId],
  },
)

const story = computed(() => storyData.value)
const error = computed(() => {
  if (!storyId.value) {
    return 'Story ID is required'
  }

  if (fetchError.value) {
    return fetchError.value.message
  }

  if (!pending.value && !story.value) {
    return 'Story not found'
  }

  return null
})
const isLoading = computed(() => pending.value)
const screenshotSrc = computed(() => storyId.value ? `/api/screenshot/${storyId.value}?variant=original` : '')

// Use the sanitizer
const { sanitize } = useSanitizer();
const sanitizedText = computed(() => sanitize(story.value?.text || '', `story-${storyId.value}`));

const MAX_COMMENT_DEPTH = 3;

const countComments = (comments = []) => {
  return comments.reduce((total, comment) => {
    return total + 1 + countComments(comment.children || []);
  }, 0);
};

const hasRepliesBeyondDefaultDepth = (comments = [], depth = 1) => {
  return comments.some((comment) => {
    const children = comment.children || [];

    if (depth >= MAX_COMMENT_DEPTH && children.length > 0) {
      return true;
    }

    return hasRepliesBeyondDefaultDepth(children, depth + 1);
  });
};

const commentCount = computed(() => countComments(story.value?.children || []));
const hasCollapsedReplies = computed(() => hasRepliesBeyondDefaultDepth(story.value?.children || []));

const countCommentsByAuthor = (comments: StoryComment[] = [], counts: Record<string, number> = {}) => {
  comments.forEach((comment) => {
    if (comment.author) {
      counts[comment.author] = (counts[comment.author] || 0) + 1;
    }

    countCommentsByAuthor(comment.children || [], counts);
  });

  return counts;
};

const authorCommentCounts = computed(() => countCommentsByAuthor(story.value?.children || []));

const toggleExpandAllComments = () => {
  expandAllComments.value = !expandAllComments.value;
};

const timeAgo = computed(() => {
  if (!story.value?.created_at) return '';
  return formatDistanceToNow(new Date(story.value.created_at), { addSuffix: true });
});

// Update SEO metadata with null checks
const title = computed(() => story.value?.title ?? 'Loading...')
const ogImage = computed(() => story.value?.screenshotUrl ?? 'https://example.com/default-image.png')

// Set SEO metadata
useSeoMeta({
  title,
  description: () => story.value ? `Read the story titled "${story.value.title}" by ${story.value.author}.` : 'Loading story...',
  ogTitle: title,
  ogDescription: () => story.value ? `Read the story titled "${story.value.title}" by ${story.value.author}.` : 'Loading story...',
  ogImage,
  twitterCard: ogImage,
});
</script>

<style scoped>
.comments-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.comments-title-group {
  display: inline-flex;
  align-items: baseline;
  gap: 0.55rem;
  min-width: 0;
}

.comments-count {
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1;
}

.expand-comments-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid rgb(148 163 184 / 0.24);
  border-radius: 999px;
  background: rgb(148 163 184 / 0.08);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.expand-comments-button:hover {
  border-color: rgb(148 163 184 / 0.38);
  background: rgb(148 163 184 / 0.13);
}

@media (max-width: 640px) {
  .comments-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
