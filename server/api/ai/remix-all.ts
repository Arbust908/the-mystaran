import { defineEventHandler, createError } from 'h3';
import type { ArticleWithRelations, SupabaseError } from '~/server/utils/types';
import { delay } from '~/server/utils/crawler';
import { getArticleEnhancedContent, getArticleSummary, getEnhancedTitle } from '~/server/utils/article.controller';

// Delay constants (ms)
const SUGGESTION_DELAY_MS = 20000;
const SUMMARY_DELAY_MS    = 20000;
const TITLE_DELAY_MS      = 20000;
const UPDATE_DELAY_MS     = 5000;

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const articleLimit =  Number(query.limit) || 10;
  // Fetch articles
  const { data: articles, error: fetchError } = await getArticleQuery(event)
    .order('created_at', { ascending: false})
    .limit(articleLimit) as {
    data: ArticleWithRelations[] | null;
    error: SupabaseError | null;
  };

  if (fetchError || !articles) {
    throw createError({
      statusCode: 404,
      message: fetchError?.message || 'Articles not found'
    });
  }

  const config = useRuntimeConfig();
  const results: Array<{ id: string; status: 'success' | 'error'; error?: string }> = [];

  const openRouterConfig: OpenRouterConfig = {
    apiKey: config.openRouterKey,
    model: config.openRouterModel,
  }
  // Process one article at a time to respect rate limits
  for (const article of articles) {
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

      console.info({
        articleId: article.id,
        suggestions,
        summary,
        optimizedTitle
      })
      // 4) Save all AI fields in one update
      const { data, error: updateError } = await updateArticle(event, article.id, {
        ai_content: suggestions,
        ai_summary: summary,
        ai_title:   optimizedTitle
      }).select('*');

      if (updateError) {
        throw updateError;
      }
      console.info('Update response:', data);

      results.push({ id: article.id, status: 'success' });
      // Brief pause before next article
      await delay(UPDATE_DELAY_MS);

    } catch (err: SupabaseError) {
      console.error(`Enhancement failed for article ${article.id}:`, err);
      // If it's an OpenRouterError, convert to HTTP error once (outside loop)
      results.push({
        id:    article.id,
        status:'error',
        error: err.message || String(err)
      });
    }
  }

  return {
    results,
    count: results.length,
  };
});
