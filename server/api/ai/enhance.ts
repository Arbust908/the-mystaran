import { OpenRouterError } from '~/server/utils/openRouter';
import { createError } from 'h3';
import { getArticleEnhancedContent } from '~/server/utils/article.controller';

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
      .single();

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

    // Get runtime config
    const config = useRuntimeConfig();

    // Process with OpenRouter
    const suggestions = await getArticleEnhancedContent(article.content, {
      apiKey: config.openRouterKey,
    });

    // Save enhanced content back to Supabase
    const { error: updateError } = await updateArticle(event, article.id, {
      ai_content: suggestions
      }).select('*');

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
