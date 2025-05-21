<script setup lang="ts">
import { useAsyncData } from '#app'
import type { ArticleWithRelations, PaginatedResponse } from '~/server/utils/types'

// Route and query handling
const route = useRoute()
const router = useRouter()

// Pagination state
const page = useState('page', () => Number(route.query.page) || 1)
const limit = useState('limit', () => 12)
const isInfiniteScroll = useState('isInfiniteScroll', () => !route.query.page)
const allArticles = useState<ArticleWithRelations[]>('articles', () => [])

// Fetch paginated articles
const { data: response, error, refresh } = await useAsyncData<PaginatedResponse<ArticleWithRelations>>(
  'articles',
  () => $fetch('/api/articles', {
    params: {
      page: page.value,
      limit: limit.value
    }
  }),
  {
    watch: [page, limit]
  }
)

// Update articles based on mode
watch(response, (newResponse) => {
  if (!newResponse) return
  
  if (isInfiniteScroll.value) {
    // Append new articles in infinite scroll mode
    if (page.value === 1) {
      allArticles.value = newResponse.data
    } else {
      allArticles.value = [...allArticles.value, ...newResponse.data]
    }
  } else {
    // Replace articles in single page mode
    allArticles.value = newResponse.data
  }
}, { immediate: true })

// Handle page changes
watch(page, async (newPage) => {
  if (!isInfiniteScroll.value) {
    // Update URL in single page mode
    await router.push({
      query: { ...route.query, page: newPage > 1 ? newPage : undefined }
    })
  }
})

// Watch route for direct URL access
watch(
  () => route.query.page,
  (newPage) => {
    const pageNum = Number(newPage) || 1
    if (page.value !== pageNum) {
      page.value = pageNum
      isInfiniteScroll.value = !newPage
    }
  }
)

// Loading state
const isLoading = ref(false)

// Load more function for infinite scroll
const loadMore = async () => {
  if (!response.value?.meta.hasMore || isLoading.value) return
  
  isLoading.value = true
  try {
    page.value++
    await refresh()
  } finally {
    isLoading.value = false
  }
}

// Transform articles into the format expected by UBlogPost
const posts = computed(() => allArticles.value.map(article => ({
  title: article.title,
  description: article.summary,
  date: article.created_at,
  to: `/post/${article.id}`,
  image: {
    src: article.images[0] || `https://placehold.co/712x400/2563eb/ffffff/png?text=${encodeURIComponent(article.title)}`,
    alt: article.title
  },
  // Add any additional metadata you want to display
  metadata: [
    ...article.categories.map(c => ({
      label: c.category.name,
      color: 'primary'
    })),
    ...article.tags.map(t => ({
      label: t.tag.name,
      variant: 'outline'
    }))
  ]
})) ?? [])
</script>

<template>
  <UPage>
    

    <UPageBody>
      <UContainer>
        <div v-if="error" class="text-red-600">
          {{ error.statusMessage || error.message }}
        </div>

        <template v-else>
          <!-- Articles grid -->
          <UBlogPosts>
            <UBlogPost
              v-for="(post, index) in posts"
              :key="index"
              v-bind="post"
              variant="naked"
            />
          </UBlogPosts>

          <!-- Pagination controls -->
          <div v-if="response?.meta.totalPages > 1" class="mt-8 flex justify-center">
            <template v-if="isInfiniteScroll">
              <UButton
                v-if="response?.meta.hasMore"
                variant="soft"
                color="primary"
                :loading="isLoading"
                :ui="{
                  base: 'transition-colors duration-200',
                  variant: {
                    soft: 'hover:bg-primary-100 dark:hover:bg-primary-800'
                  }
                }"
                class="px-6 py-2 min-w-[160px]"
                @click="loadMore"
              >
                {{ isLoading ? 'Loading...' : 'Load More Articles' }}
              </UButton>
            </template>
            <template v-else>
              <UPagination
                v-model="page"
                :total="response.meta.totalPages"
                :ui="{
                  wrapper: 'flex items-center gap-1',
                  rounded: 'rounded-lg'
                }"
              />
            </template>
          </div>
        </template>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
