import { defineEventHandler, createError } from 'h3';
import { delay } from '~/server/utils/crawler';
import { getArticleEnhancedContent, getArticleQueryWithRelations, getArticleSummary, getEnhancedTitle } from '~/server/utils/article.controller';
import type { SupabaseError } from '~/server/utils/types';

// Delay constants (ms)
const SUGGESTION_DELAY_MS = 20000;
const SUMMARY_DELAY_MS    = 20000;
const TITLE_DELAY_MS      = 20000;
const UPDATE_DELAY_MS     = 5000;

export default defineEventHandler(async (event) => {
  const articleId = '137ad14d-3689-4a8a-becd-9b64ecfe5826'
  // Fetch articles
  const { data: article, error: fetchError } = await getArticleQueryWithRelations(event)
    .eq('id', articleId)
    .single() as {
      data: ArticleWithRelations | null;
      error: SupabaseError | null;
    }

  if (fetchError || !article) {
    throw createError({
      statusCode: 404,
      message: fetchError?.message || 'Articles not found'
    });
  }

  console.info('Article:', article);

  const config = useRuntimeConfig();

  const modelsToTest = [
    'deepseek/deepseek-chat-v3-0324:free',
    'openai/gpt-4.1-nano',
    'mistralai/ministral-8b',
    'deepseek/deepseek-r1-distill-qwen-32b'
  ]
  const results: Array<{ model: string; suggestions: string; summary: string; optimizedTitle: string; id: string; status: 'success' | 'error'; error?: string }> = [];
  
  for (const model of modelsToTest) {
    const openRouterConfig: OpenRouterConfig = {
      apiKey: config.openRouterKey,
      model,
    }
    try {
      // 1) Generate enhancement suggestions
      await delay(SUGGESTION_DELAY_MS);
      const suggestions = await getArticleEnhancedContent(article.content, openRouterConfig);

      // 2) Generate summary
      await delay(SUMMARY_DELAY_MS);
      const summary = await getArticleSummary(article, openRouterConfig);

      // 3) Optimize title
      await delay(TITLE_DELAY_MS);
      const optimizedTitle = await getEnhancedTitle(article.title, article.content, openRouterConfig);

      results.push({
        model,
        suggestions,
        summary,
        optimizedTitle,
        id: article.id,
        status: 'success'
      });
      // Brief pause before next article
      await delay(UPDATE_DELAY_MS);

    } catch (err: SupabaseError) {
      console.error(`Enhancement failed for article ${article.id}:`, err);
    }
  }


  return results;
});
