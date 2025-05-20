<template>
  <div class="article">
    <h1>Articles</h1>
    
    <div v-if="loading" class="loading">
      Loading articles...
    </div>
    
    <div v-else-if="error" class="error">
      {{ error }}
    </div>
    
    <div v-else class="articles-grid">
      <div v-for="article in articles" :key="article.id" class="article-card">
        <h2>{{ article.title }}</h2>
        <p v-if="article.summary" class="summary">{{ article.summary }}</p>
        <div v-if="article.images && article.images.length" class="images">
          <img :src="article.images[0]" :alt="article.title">
        </div>
        <p class="date">{{ new Date(article.created_at).toLocaleDateString() }}</p>
        <a :href="article.link" target="_blank" class="link">Read More</a>
      </div>
    </div>

    <NuxtLink to="/" class="home-link">Back to Home</NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Database } from '~/database.types'

type Article = Database['public']['Tables']['articles']['Row']

const articles = ref<Article[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const client = useSupabaseClient<Database>()

onMounted(async () => {
  try {
    const { data, error: err } = await client
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (err) throw err
    
    articles.value = data
  } catch (e) {
    error.value = 'Failed to load articles'
    console.error(e)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.article {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
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
}

.article-card h2 {
  margin: 0 0 10px;
  font-size: 1.5em;
}

.summary {
  color: #666;
  margin: 10px 0;
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
}

.home-link:hover {
  text-decoration: underline;
}
</style>
