<template>
  <NuxtLayout>
    <div class="px-4 py-6 mx-auto max-w-2xl">
    <h1 class="text-3xl font-bold mb-6">Blog Posts</h1>

    <div v-if="error" class="text-red-600">
      {{ error.statusMessage || error.message }}
    </div>

    <div v-else class="grid gap-6 sm:grid-cols-1 md:grid-cols-2">
      <UCard
        v-for="post in articles"
        :key="post.id"
        class="flex flex-col justify-between"
      >
        <template #header>
          <h2 class="text-xl font-semibold">{{ post.title }}</h2>
          <p class="text-sm text-gray-500">{{ formatDate(post.created_at) }}</p>
        </template>

        <template #body>
          <p class="text-gray-700 mb-4 line-clamp-3">
            {{ post.summary }}
          </p>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="c in post.categories"
              :key="c.category.id"
              :label="c.category.name"
              color="primary"
              size="sm"
            />
            <UBadge
              v-for="t in post.tags"
              :key="t.tag.id"
              :label="t.tag.name"
              variant="outline"
              size="sm"
            />
          </div>
        </template>

        <template #footer>
          <NuxtLink
            :to="`/post/${post.id}`"
            class="mt-4 text-blue-600 hover:underline self-start"
          >
            Read more →
          </NuxtLink>
        </template>
      </UCard>
    </div>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { useAsyncData } from '#app'
import { format } from 'date-fns'

type Article = {
  id: string
  title: string
  summary: string | null
  created_at: string
  tags: { tag: { id: string; name: string; slug: string | null } }[]
  categories: { category: { id: string; name: string } }[]
}

const { data: articles, error } = await useAsyncData<Article[]>(
  'articles',
  () => $fetch('/api/articles')
)

function formatDate(dateStr: string) {
  return format(new Date(dateStr), 'PPP')
}
</script>

<style>
.line-clamp-3 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}
</style>
