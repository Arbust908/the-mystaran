<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <div v-if="error" class="text-red-600">
          {{ error.statusMessage || error.message }}
        </div>

        <template v-else-if="article">
          <div class="mb-6">
            <h1 class="text-3xl font-bold mb-2">{{ article.title }}</h1>
            <p class="text-sm text-gray-500">{{ formatDate(article.created_at) }}</p>
          </div>

          <div class="flex flex-wrap gap-2 mb-6">
            <UBadge
              v-for="c in article.categories"
              :key="c.category.id"
              :label="c.category.name"
              color="primary"
              size="sm"
            />
            <UBadge
              v-for="t in article.tags"
              :key="t.tag.id"
              :label="t.tag.name"
              variant="outline"
              size="sm"
            />
          </div>

          <div class="prose prose-lg max-w-none">
            <p v-if="article.summary" class="text-xl text-gray-600 mb-8">
              {{ article.summary }}
            </p>
            
            <div v-html="article.content" />
          </div>

          <div class="mt-8 pt-8 border-t">
            <NuxtLink
              to="/"
              class="text-blue-600 hover:underline"
            >
              ← Back to Posts
            </NuxtLink>
          </div>
        </template>
      </UContainer>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { useAsyncData } from '#app'
import { format } from 'date-fns'

const route = useRoute()

type Article = {
  id: string
  title: string
  content: string
  summary: string | null
  created_at: string
  tags: { tag: { id: string; name: string; slug: string | null } }[]
  categories: { category: { id: string; name: string } }[]
}

const { data: article, error } = await useAsyncData<Article>(
  `article-${route.params.id}`,
  () => $fetch(`/api/articles/${route.params.id}`)
)

function formatDate(dateStr: string) {
  return format(new Date(dateStr), 'PPP')
}
</script>
