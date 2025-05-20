import { scrapeArticles } from "../utils/scraper"

export default defineEventHandler(async (event) => {
  const { article, comments } = await scrapeArticles('https://thealexandrian.net/wordpress/52417/roleplaying-games/games-unplugged-review-blue-planet-players-guide')


  return {
    article, comments
  }
})