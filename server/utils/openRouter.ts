/**
 * OpenRouter API client with error handling and logging
 */

const OPEN_ROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3-0324:free';

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
  referer?: string;
  siteTitle?: string;
}

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  config: OpenRouterConfig
) {
  console.info('Preparing OpenRouter API call...', {
    model: config.model || DEFAULT_MODEL,
    messageCount: messages.length
  });

  const payload = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'HTTP-Referer': config.referer || '',
        'X-Title': config.siteTitle || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model || DEFAULT_MODEL,
        messages: messages,
      }),
    }
  console.info('OpenRouter API request payload:', payload);

  try {
    const response = await fetch(OPEN_ROUTER_API_URL, payload);
    console.info('OpenRouter API response received:', {
      status: response.status,
      ok: response.ok
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text();
      }

      console.error('OpenRouter API error:', {
        status: response.status,
        data: errorData
      });

      throw new OpenRouterError(
        'OpenRouter API request failed',
        response.status,
        errorData
      );
    }

    const data = await response.json();
    console.info('OpenRouter API response parsed successfully');

    return data;
  } catch (error: unknown) {
    if (error instanceof OpenRouterError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('OpenRouter API call failed:', error);
    throw new OpenRouterError(
      `OpenRouter API call failed: ${errorMessage}`
    );
  }
}

/**
 * Helper function to process article content with OpenRouter
 */
export async function processArticleWithAI(
  prompt: string,
  config: OpenRouterConfig
) {
  const messages: OpenRouterMessage[] = [
    {
      role: 'user',
      content: prompt
    }
  ];

  try {
    console.info('Processing article with AI...');
    const response = await callOpenRouter(messages, config);
    
    if (!response.choices?.[0]?.message?.content) {
      throw new OpenRouterError('Invalid response format from OpenRouter API');
    }

    return response.choices[0].message.content;
  } catch (error: unknown) {
    console.error('Article processing failed:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new OpenRouterError('Article processing failed with unknown error');
  }
}
