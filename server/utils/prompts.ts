/**
 * Prompts for AI processing of articles
 * Using TypeScript template literal types for type safety
 */

export interface PromptTemplateVars {
  articleContent: string;
  title?: string;
  categories?: string[];
  tags?: string[];
}

export interface PromptTemplate {
  prompt: string;
  description: string;
}

/**
 * Article summarization prompt
 * Generates a concise summary of the article content
 */
export const ARTICLE_SUMMARY: PromptTemplate = {
  prompt: `You are a professional copywriter and content summarizer. Given a blog post extract, write a concise and compelling summary in exactly two sentences. Capture the main idea and tone of the content. Avoid copying sentences verbatim from the source. Use clear, professional language that would appeal to a general online audience. Output only the summary.

Title: {title}
Categories: {categories}
Tags: {tags}

Content:
{articleContent}

Summary:`,
  description: 'Generates a concise summary of an article'
};

/**
 * Blog enhancement prompt
 * Suggests improvements for the article's HTML/CSS styling
 */
export const BLOG_ENHANCEMENT: PromptTemplate = {
  prompt: `You are a senior frontend engineer specializing in modern web design. You will receive an HTML blog extract with raw or poorly styled tags and classes. Your task is to enhance this HTML by:

Rewriting the HTML structure to be clean and semantically correct.

Applying appropriate Tailwind CSS utility classes to achieve a modern, readable, and responsive design.

Keeping the content and structure intact, but improving readability and layout.

Using Tailwind best practices: spacing, typography, containers, responsive utilities, etc.

Images should span the full width of the container.

{articleContent}


Output only the improved HTML, no markdown, nothing. Expect us to push the result stright into a <main> tag. Do not include any commentary or explanation. Assume Tailwind CSS is already available in the project.`,
  description: 'Suggests HTML/CSS improvements for better readability and user experience'
};

/**
 * Title optimization prompt
 * Suggests improvements for the article title
 */
export const TITLE_OPTIMIZATION: PromptTemplate = {
  prompt: `You are a skilled editorial content strategist. You will receive the following blog metadata:

Title: {title}

Categories: {categories}

Tags: {tags}

Content: {content}

Your task is to:

Read and analyze all provided information to understand the theme and intent.

Create a new, concise, and captivating title that summarizes the blog post’s value while optimizing for clarity, SEO, and reader curiosity.

Avoid repeating the original title, but preserve its core meaning if relevant.

Return only the new title with no explanation or extra formatting. It shoudl be shorter than the original title.`,
  description: 'Suggests optimized titles for better engagement and SEO'
};

/**
 * Helper function to format prompts with variables
 */
export function formatPrompt(
  template: PromptTemplate,
  vars: Partial<PromptTemplateVars>
): string {
  let formatted = template.prompt;
  
  // Replace each variable in the template
  Object.entries(vars).forEach(([key, value]) => {
    const placeholder = `{${key}}`;
    if (Array.isArray(value)) {
      formatted = formatted.replace(placeholder, value.join(', '));
    } else if (value) {
      formatted = formatted.replace(placeholder, value);
    } else {
      // Remove the line containing the empty variable
      formatted = formatted.replace(new RegExp(`.*${placeholder}.*\n?`), '');
    }
  });

  return formatted;
}
