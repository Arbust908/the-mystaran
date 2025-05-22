import { defineEventHandler, createError } from 'h3';
import { BLOG_ENHANCEMENT, ARTICLE_SUMMARY, TITLE_OPTIMIZATION, formatPrompt } from '~/server/utils/prompts';
import { processArticleWithAI } from '~/server/utils/openRouter';
import { serverSupabaseServiceRole } from '#supabase/server';
import { getArticleQuery } from '~/server/utils/types';
import type { ArticleWithRelations } from '~/server/utils/types';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { delay } from '~/server/utils/crawler';

// Delay constants (ms)
const SUGGESTION_DELAY_MS = 20000;
const SUMMARY_DELAY_MS    = 20000;
const TITLE_DELAY_MS      = 20000;
const UPDATE_DELAY_MS     = 5000;

export default defineEventHandler(async (event) => {
  // Fetch articles
  const { data: articles, error: fetchError } = await getArticleQuery(event)
    .order('created_at', { ascending: false})
    .limit(10) as {
    data: ArticleWithRelations[] | null;
    error: PostgrestError | null;
  };

  if (fetchError || !articles) {
    throw createError({
      statusCode: 404,
      message: fetchError?.message || 'Articles not found'
    });
  }

  const config = useRuntimeConfig();
  const apiKey = config.openRouterKey;
  const supabase = serverSupabaseServiceRole(event) as SupabaseClient;

  const startTimer = performance.now();
  const results: Array<{ id: string; status: 'success' | 'error'; error?: string }> = [];

  // Process one article at a time to respect rate limits
  for (const article of articles) {
    try {
      const startingArticle = performance.now();
      const startingBlogEnhancement = performance.now();
      // 1) Generate enhancement suggestions
      await delay(SUGGESTION_DELAY_MS);
      const suggestions = await processArticleWithAI(
        formatPrompt(BLOG_ENHANCEMENT, { articleContent: article.content }),
        { apiKey }
      );
      const finishBlogEnhancement = performance.now() - startingBlogEnhancement;
      // 2) Generate summary
      await delay(SUMMARY_DELAY_MS);
      let summary = await processArticleWithAI(
        formatPrompt(ARTICLE_SUMMARY, {
          articleContent: article.content,
          title: article.title,
          categories: article.categories?.map(c => c.category.name),
          tags:       article.tags?.map(t => t.tag.name)
        }),
        { apiKey }
      );
      summary = summary.replace(/["*]/g, '');
      const finishSummary = performance.now() - finishBlogEnhancement;

      // 3) Optimize title
      await delay(TITLE_DELAY_MS);
      let optimizedTitle = await processArticleWithAI(
        formatPrompt(TITLE_OPTIMIZATION, {
          articleContent: article.content,
          title: article.title
        }),
        { apiKey }
      );
      optimizedTitle = optimizedTitle.replace(/"/g, '');
      const finishTitle = performance.now() - finishSummary;

      console.info({
        articleId: article.id,
        suggestions,
        summary,
        optimizedTitle
      })
      // 4) Save all AI fields in one update
      const { data, error: updateError } = await supabase
        .from('articles')
        .update({
          ai_content: suggestions,
          ai_summary: summary,
          ai_title:   optimizedTitle
        })
        .eq('id', article.id)
        .select('*');
      console.info('Update response:', data);
      const finishUpdate = performance.now() - finishTitle;

      if (updateError) {
        throw updateError;
      }

      results.push({ id: article.id, status: 'success' });
      const finish = performance.now() - finishUpdate;
      // Brief pause before next article
      await delay(UPDATE_DELAY_MS);
      const end = performance.now() - startingArticle;
      console.info({
        finishBlogEnhancement,
        finishSummary,
        finishTitle,
        finishUpdate,
        finish,
        end
      })

    } catch (err: any) {
      console.error(`Enhancement failed for article ${article.id}:`, err);
      // If it's an OpenRouterError, convert to HTTP error once (outside loop)
      results.push({
        id:    article.id,
        status:'error',
        error: err.message || String(err)
      });
    }
  }
  const finishedAll = performance.now() - startTimer;

  return {
    results,
    count: results.length,
    time: finishedAll
  };

});
