<script setup lang="ts">
import { useAsyncData } from '#app'

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

// Transform articles into the format expected by UBlogPost
const posts = computed(() => articles.value?.map(article => ({
  title: article.title,
  description: article.summary,
  date: article.created_at,
  to: `/post/${article.id}`,
  image: article.images[0] || `https://placehold.co/712x400?text=${article.title}`,
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
    <UPageHeader title="Blog" description="Articles from the blog" />

    <UPageBody>
      <UContainer>
        <div v-if="error" class="text-red-600">
          {{ error.statusMessage || error.message }}
        </div>

        <UBlogPosts v-else>
          <UBlogPost
            v-for="(post, index) in posts"
            :key="index"
            v-bind="post"
            variant="naked"
          />
        </UBlogPosts>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
