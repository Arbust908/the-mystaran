# Active Context

## Current Focus
- Implementing server-side AI processing with OpenRouter integration
- Setting up task queue system with Supabase
- Enhancing article content with AI processing

## Recent Changes
- Added AI processing pipeline with prompts repository
- Implemented OpenRouter client with error handling
- Created API endpoints for article processing
- Set up task queue system using Supabase

## Active Decisions
1. Using OpenRouter with deepseek/deepseek-chat-v3-0324:free model
2. Implementing queue system in Supabase instead of Redis
3. Using Nuxt's runtime config for API keys
4. Keeping database.types.ts untouched - this file is auto-generated and should not be modified

## Technical Considerations
1. Error Handling:
   - Comprehensive error handling in OpenRouter client
   - Task status tracking for failed operations
   - Detailed logging for debugging

2. Type Safety:
   - Strong typing for AI tasks and queue operations
   - Type-safe prompt templates
   - Proper error types

3. Performance:
   - Asynchronous task processing
   - Task cleanup for completed/failed tasks
   - Efficient database operations

## Next Steps
1. Create migration for ai_tasks table in Supabase
2. Add task monitoring UI component
3. Implement task retry mechanism
4. Add rate limiting for AI requests
5. Set up monitoring for task queue

## Important Notes
- database.types.ts is auto-generated and should never be modified directly
- Use migrations for any database schema changes
- Keep AI processing tasks atomic and idempotent
- Maintain comprehensive error logging
