// server/api/ai/enhance.ts

import { BLOG_ENHANCEMENT, formatPrompt } from '~/server/utils/prompts';
import { processArticleWithAI, OpenRouterError } from '~/server/utils/openRouter';
import { serverSupabaseServiceRole } from '#supabase/server';
import { getArticleQuery } from '~/server/utils/types';
import type { ArticleWithRelations } from '~/server/utils/types';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { createError } from 'h3';

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  if (!query.id) {
    throw createError({
      statusCode: 400,
      message: 'Article ID is required'
    });
  }

  try {
    const articleId = query.id
    const noAnything = query?.title === undefined && query?.summary === undefined && query?.content === undefined

    const doTitle =  noAnything || Number(query.title) === 1
    const doSummary = noAnything || Number(query.summary) === 1
    const doContent = noAnything || Number(query.content) === 1
    console.info('Remixing article:', {
      id: articleId,
      title: doTitle,
      summary: doSummary,
      content: doContent
    });

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
    // Get runtime config
    const config = useRuntimeConfig();
    let suggestions = '';
    let summary = '';
    let newTitle = '';
    let toUpdate = {}
   
    if (doContent) {
      const enchancementPrompt = formatPrompt(BLOG_ENHANCEMENT, {
        articleContent: article.content
      });
      suggestions = await processArticleWithAI(enchancementPrompt, {
        apiKey: config.openRouterKey,
      });
      toUpdate = { ai_content: suggestions }
    }
    
    if (doSummary) {
      const summaryPrompt = formatPrompt(ARTICLE_SUMMARY, {
        articleContent: article.content,
        title: article.title,
        categories: article.categories?.map(c => c.category.name),
        tags: article.tags?.map(t => t.tag.name)
      });
      summary = await processArticleWithAI(summaryPrompt, {
        apiKey: config.openRouterKey,
      })
      summary = summary.replaceAll('"', '').replaceAll('*', '');
      toUpdate = { ai_summary: summary }
    }

     if (doTitle) {
      const newTitlePrompt = formatPrompt(TITLE_OPTIMIZATION, {
        articleContent: article.content,
        title: article.title
      });
      newTitle = await processArticleWithAI(newTitlePrompt, {
        apiKey: config.openRouterKey,
      });
      newTitle = newTitle.replaceAll('"', '');
      toUpdate = { ai_title: newTitle }
    }

    console.info('Article enhancement:', toUpdate);

    // Save enhanced content back to Supabase
    // Get the Supabase client with proper typing
    const supabase = serverSupabaseServiceRole(event) as SupabaseClient;
    const { data: updatedArticle, error: updateError } = await supabase
      .from('articles')
      .update(toUpdate)
      .eq('id', article.id)
      .select('*');

    if (updateError) throw updateError;

    return { 
      suggestions,
      summary,
      newTitle,
      article: updatedArticle
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
