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

export const SYSTEM_PROMPT = {
  prompt: "When responding to the next user message, output only raw HTML with no Markdown fences or commentary.",
  description: 'System prompt for AI processing'
};

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
  prompt: `You are a senior frontend engineer.

TASK: rewrite the HTML below to be clean, semantic and styled with Tailwind.  

CONSTRAINTS (read carefully):  
• **Return raw HTML only.**  
• **Do NOT wrap the answer in "", <pre>, Markdown fences, or any other wrapper.**  
• **Do NOT add commentary, explanations, or blank lines.**  
• **The first character of your reply must be \`<\`.**  

---- ORIGINAL HTML ----
{articleContent}
---- END ORIGINAL HTML ----`,
  description: 'Suggests HTML/CSS improvements for better readability and user experience'
};

/**
 * Title optimization prompt
 * Suggests improvements for the article title
 */
export const TITLE_OPTIMIZATION: PromptTemplate = {
  prompt: `You are an editorial strategist.

INPUT
------
Original Title: {title}
Categories: {categories}
Tags: {tags}
Content: {content}

TASK
-----
Craft a **new** title that:

• Uses **fewer characters than the original** (hard rule).  
• Captures the post’s core value in clear, engaging language.  
• Removes boiler-plate prefixes such as “Ex-RPGNet Review:” or website branding.  
• Avoids repeating the old title verbatim.

If your first attempt is not shorter, immediately revise until it is.

OUTPUT  
------
Return the new title only, on a single line with no extra text.

new title:`,
  description: 'Generates a shorter, punchier title for better engagement and SEO'
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
