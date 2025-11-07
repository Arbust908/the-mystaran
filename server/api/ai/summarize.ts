import { ARTICLE_SUMMARY, formatPrompt } from '~/server/utils/prompts';
import { processArticleWithAI, OpenRouterError } from '~/server/utils/openRouter';
import { serverSupabaseServiceRole } from '#supabase/server';
import type { ArticleWithRelations } from '~/server/utils/types';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { createError } from 'h3';

export default defineEventHandler(async (event) => {
  try {
    // Get article ID from request body
    const body = await readBody(event);
    const articleId = body.articleId;

    if (!articleId) {
      throw createError({
        statusCode: 400,
        message: 'Article ID is required'
      });
    }

    // Fetch article from Supabase using the query builder
    const { data: article, error: fetchError } = await getArticleQuery(event)
      .eq('id', articleId)
      .single() as { data: ArticleWithRelations | null, error: PostgrestError | null };

    if (fetchError || !article) {
      throw createError({
        statusCode: 404,
        message: fetchError?.message || 'Article not found'
      });
    }

    if (!article.content) {
      throw createError({
        statusCode: 400,
        message: 'Article content is required'
      });
    }

    console.info('Summarizing article:', {
      id: article.id,
      title: article.title
    });

    // Format the prompt with article data
    const prompt = formatPrompt(ARTICLE_SUMMARY, {
      articleContent: article.content,
      title: article.title,
      categories: article.categories?.map(c => c.category.name),
      tags: article.tags?.map(t => t.tag.name)
    });

    // Get runtime config
    const config = useRuntimeConfig();

    // Process with OpenRouter
    const summary = await processArticleWithAI(prompt, {
      apiKey: config.openRouterKey,
    });

    // Save summary back to Supabase
    const supabase = serverSupabaseServiceRole(event) as SupabaseClient;
    
    const { error: updateError } = await supabase
      .from('articles')
      .update({ ai_summary: summary })
      .eq('id', article.id);

    if (updateError) throw updateError;

    console.info('Article summarization completed successfully');

    return { 
      summary,
      article: {
        ...article,
        ai_summary: summary
      }
    };
  } catch (error) {
    console.error('Article summarization failed:', error);

    if (error instanceof OpenRouterError) {
      throw createError({
        statusCode: error.statusCode || 500,
        message: error.message
      });
    }

    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to summarize article'
    });
  }
});
