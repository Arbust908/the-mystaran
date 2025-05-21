<template>
  <div class="article" :class="{ 'dark': isDark }">
    <h1>Articles</h1>
    
    <div v-if="articleLoading" class="loading">
      Loading articles...
    </div>
    
    <div v-else-if="articleError" class="error">
      {{ articleError }}
    </div>
    
    <div v-else class="articles-grid">
      <div v-for="article in articles" :key="article.id" class="article-card">
        <h2>{{ article.title }}</h2>
        <p v-if="article.summary" class="summary">{{ article.summary }}</p>
        <div v-if="article.images && article.images.length" class="images">
          <img :src="article.images[0]" :alt="article.title">
        </div>
        <div class="metadata">
          <div class="categories" v-if="article.categories?.length">
            <span v-for="catId in article.categories" :key="catId">
              {{ categories.find(c => c.id === catId)?.name }}
            </span>
          </div>
          <div class="tags" v-if="article.tags?.length">
            <span v-for="tagId in article.tags" :key="tagId">
              {{ tags.find(t => t.id === tagId)?.name }}
            </span>
          </div>
        </div>
        <p class="date">{{ new Date(article.created_at).toLocaleDateString() }}</p>
        <a :href="article.link" target="_blank" class="link">Read More</a>
      </div>
    </div>

    <NuxtLink to="/" class="home-link">Back to Home</NuxtLink>
  </div>
</template>

<script setup lang="ts">
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const { data: articleData, error: articleError, loading: articleLoading } = 
  await useAsyncData('articles', () => $fetch('/api/article'))
  
const { data: tagData } = await useAsyncData('tags', () => $fetch('/api/tag'))
const { data: categoryData } = await useAsyncData('categories', () => $fetch('/api/category'))

const articles = computed(() => articleData.value?.articles || [])
const tags = computed(() => tagData.value?.tags || [])
const categories = computed(() => categoryData.value?.categories || [])
</script>

<style scoped>
.article {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
  transition: background-color 0.3s, color 0.3s;
}

.article.dark {
  background: #1a1a1a;
  color: #ffffff;
}

.articles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin: 20px 0;
}

.article-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  background: white;
  transition: background-color 0.3s, border-color 0.3s;
}

.article.dark .article-card {
  background: #2d2d2d;
  border-color: #404040;
}

.article-card h2 {
  margin: 0 0 10px;
  font-size: 1.5em;
}

.summary {
  color: #666;
  margin: 10px 0;
}

.article.dark .summary,
.article.dark .date {
  color: #b0b0b0;
}

.images {
  margin: 10px 0;
}

.images img {
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-radius: 4px;
}

.date {
  color: #666;
  font-size: 0.9em;
  margin: 10px 0;
}

.link {
  display: inline-block;
  padding: 8px 16px;
  background: #0047ab;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  margin-top: 10px;
  transition: background-color 0.3s;
}

.article.dark .link {
  background: #0066cc;
}

.loading, .error {
  text-align: center;
  padding: 40px;
  font-size: 1.2em;
}

.error {
  color: #dc3545;
}

.home-link {
  display: inline-block;
  margin-top: 20px;
  color: #0047ab;
  text-decoration: none;
  transition: color 0.3s;
}

.article.dark .home-link {
  color: #66b3ff;
}

.home-link:hover {
  text-decoration: underline;
}

.metadata {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.categories span,
.tags span {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.9em;
}

.categories span {
  background: #e9ecef;
  color: #495057;
}

.tags span {
  background: #f8f9fa;
  color: #495057;
  border: 1px solid #dee2e6;
}

.article.dark .categories span {
  background: #495057;
  color: #e9ecef;
}

.article.dark .tags span {
  background: #343a40;
  color: #e9ecef;
  border-color: #495057;
}
</style>
