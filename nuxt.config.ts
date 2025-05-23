// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui-pro',
    '@nuxt/content',
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxtjs/supabase'
  ],

  runtimeConfig: {
    openRouterKey: '',
  },
  css: ['~/assets/css/main.css'],

  supabase: {
    redirect: false,
  },
})
