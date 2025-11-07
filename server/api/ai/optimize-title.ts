import { TITLE_OPTIMIZATION, formatPrompt } from '~/server/utils/prompts';
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

    if (!article.content || !article.title) {
      throw createError({
        statusCode: 400,
        message: 'Article content and title are required'
      });
    }

    console.info('Optimizing title for article:', {
      id: article.id,
      currentTitle: article.title
    });

    // Format the prompt with article data
    const prompt = formatPrompt(TITLE_OPTIMIZATION, {
      articleContent: article.content,
      title: article.title
    });

    // Get runtime config
    const config = useRuntimeConfig();

    // Process with OpenRouter
    const suggestions = await processArticleWithAI(prompt, {
      apiKey: config.openRouterKey,
    });

    // Save optimized title back to Supabase
    const supabase = serverSupabaseServiceRole(event) as SupabaseClient;
    
    const { error: updateError } = await supabase
      .from('articles')
      .update({ ai_title: suggestions })
      .eq('id', article.id);

    if (updateError) throw updateError;

    console.info('Title optimization completed successfully');

    return { 
      suggestions,
      article: {
        ...article,
        ai_title: suggestions
      }
    };
  } catch (error) {
    console.error('Title optimization failed:', error);

    if (error instanceof OpenRouterError) {
      throw createError({
        statusCode: error.statusCode || 500,
        message: error.message
      });
    }

    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to optimize title'
    });
  }
});
