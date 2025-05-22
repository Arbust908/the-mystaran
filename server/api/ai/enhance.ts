// server/api/ai/enhance.ts

import { BLOG_ENHANCEMENT, formatPrompt } from '~/server/utils/prompts';
import { processArticleWithAI, OpenRouterError } from '~/server/utils/openRouter';
import { serverSupabaseServiceRole } from '#supabase/server';
import { getArticleQuery } from '~/server/utils/types';
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

    console.info('Enhancing article:', {
      id: article.id,
      title: article.title
    });

    // Format the prompt with article data
    const prompt = formatPrompt(BLOG_ENHANCEMENT, {
      articleContent: article.content
    });

    // Get runtime config
    const config = useRuntimeConfig();

    // Process with OpenRouter
    const suggestions = await processArticleWithAI(prompt, {
      apiKey: config.openRouterKey,
    });

    // Save enhanced content back to Supabase
    // Get the Supabase client with proper typing
    const supabase = serverSupabaseServiceRole(event) as SupabaseClient;

    // Save enhanced content back to Supabase
    const { error: updateError } = await supabase
      .from('articles')
      .update({ ai_content: suggestions })
      .eq('id', article.id);

    if (updateError) throw updateError;

    console.info('Article enhancement completed successfully');

    return { 
      suggestions,
      article: {
        ...article,
        ai_content: suggestions
      }
    };
  } catch (error) {
    console.error('Article enhancement failed:', error);

    if (error instanceof OpenRouterError) {
      throw createError({
        statusCode: error.statusCode || 500,
        message: error.message
      });
    }

    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to enhance article'
    });
  }
});
