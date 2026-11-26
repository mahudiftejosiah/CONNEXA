import { answerFor } from "../src/lib/help-bot.ts";

const ASKS = [
  "hi",
  "How do I go live?",
  "where are the live scores",
  "how do i send a photo in chat",
  "how do I change the theme to dark",
  "What can you do?",
  "how do I post a story",
  "how do i delete a chat",
  "how to get verified",
  "where is my saved posts",
  "how do I add a friend",
  "what is view once",
  "how do i play chess with a friend",
  "the study room books",
  "how do i change my cover photo",
  "how do I reset my password",
  "someone is spamming me",
  "asdfghjkl",
  "does betting open inside",
  "games are slow",
];

for (const a of ASKS) {
  const answer = answerFor(a);
  console.log(`Q: ${a}\nA: ${answer.slice(0, 110)}\n`);
}
