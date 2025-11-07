

<template>
  <UContainer>
    <UBlogPosts :posts="posts" />

    <UBlogPost
      title="Introducing Nuxt Icon v1"
      description="Discover Nuxt Icon v1 - a modern, versatile, and customizable icon solution for your Nuxt projects."
      image="https://nuxt.com/assets/blog/nuxt-icon/cover.png"
      date="2024-11-25"
      to="https://nuxt.com/blog/nuxt-icon-v1-0"
      target="_blank"
      variant="naked"
    />
  </UContainer>
</template>

<script setup lang="ts">
const posts = ref([
  {
    title: 'Nuxt Icon v1',
    description: 'Discover Nuxt Icon v1!',
    image: 'https://nuxt.com/assets/blog/nuxt-icon/cover.png',
    date: '2024-11-25'
  },
  {
    title: 'Nuxt 3.14',
    description: 'Nuxt 3.14 is out!',
    image: 'https://nuxt.com/assets/blog/v3.14.png',
    date: '2024-11-04'
  },
  {
    title: 'Nuxt 3.13',
    description: 'Nuxt 3.13 is out!',
    image: 'https://nuxt.com/assets/blog/v3.13.png',
    date: '2024-08-22'
  }
])
</script>