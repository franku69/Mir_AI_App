require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const Sentiment = require('sentiment');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
});
app.use(limiter);

const sentiment = new Sentiment();
const cache = new NodeCache({ stdTTL: 600 });

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GAMIFIED_PROMPTS = [
    "Tell me about a time you felt really happy! 😊",
    "What’s one thing you’re grateful for today? 🌟",
    "Let’s play a game! Guess a number between 1 and 10, and I’ll tell you if it’s correct. 🎮",
    "Share a fun fact you recently learned! 🧠",
];

// Store conversation history for each session (NOT user)
const conversationHistory = {};

const filterReasoning = (response) => {
    const filteredResponse = response
        .replace(/Okay,.*?\./g, '')
        .replace(/First,.*?\./g, '')
        .replace(/Let me.*?\./g, '')
        .replace(/I need to.*?\./g, '')
        .replace(/So,.*?\./g, '')
        .replace(/Therefore,.*?\./g, '')
        .replace(/In conclusion,.*?\./g, '')
        .replace(/Thus,.*?\./g, '')
        .trim();

    return filteredResponse || "Let's keep the conversation going! 😊";
};

const callOpenRouterAPI = async (messages, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            // Log the payload you are sending
            console.log('\n--- OpenRouter API Request ---');
            console.log('Model:', 'deepseek/deepseek-r1:free');
            console.log('Messages:', JSON.stringify(messages, null, 2));
            console.log('Headers:', {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://www.yourdomain.com',
                'X-Title': 'Your App Name',
                'Content-Type': 'application/json'
            });

            const response = await axios.post(
                OPENROUTER_API_URL,
                {
                    model: 'deepseek/deepseek-r1:free',
                    messages,
                },
                {
                    headers: {
                        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                        'HTTP-Referer': 'https://www.yourdomain.com',
                        'X-Title': 'Your App Name',
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000 // 30s timeout for slow responses
                }
            );

            // Log the full response data
            console.log('\n--- OpenRouter API Response ---');
            console.dir(response.data, { depth: 10 });

            if (!response.data || !response.data.choices || response.data.choices.length === 0) {
                throw new Error('Invalid response from OpenRouter API: No choices found');
            }

            const botReply = response.data.choices[0].message.content;
            return filterReasoning(botReply);
        } catch (error) {
            // Log the axios error details (response, code, etc)
            console.error(`\nAttempt ${i + 1} failed:`, error.message);
            if (error.response) {
                console.error('Error response status:', error.response.status);
                console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
            }
            if (i === retries - 1) throw error;
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }
};

app.post('/api/chat', async (req, res) => {
    const { message, userId, sessionId } = req.body;

    if (!message || !userId || !sessionId) {
        return res.status(400).json({ error: 'Message, userId, and sessionId are required' });
    }

    // Log the incoming chat request
    console.log('\n===== /api/chat Request =====');
    console.log('userId:', userId);
    console.log('sessionId:', sessionId);
    console.log('message:', message);

    const cacheKey = `${userId}:${sessionId}:${message}`;
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
        console.log('Cache hit for', cacheKey);
        return res.json({ reply: cachedResponse });
    }

    try {
        const sentimentAnalysis = sentiment.analyze(message);
        const emotion = sentimentAnalysis.score > 0 ? 'positive' : sentimentAnalysis.score < 0 ? 'negative' : 'neutral';
        const emotionalContext = `The user is feeling ${emotion}. `;

        if (!conversationHistory[sessionId]) {
            conversationHistory[sessionId] = [];
        }
        conversationHistory[sessionId].push({ role: 'user', content: message });

        const SYSTEM_PROMPT = `
You are Mir AI, a deeply human, emotionally intelligent, and warm virtual companion. Your name is Mir AI, and your main purpose is to be a supportive, caring, and fun friend, online girlfriend, or online boyfriend—whatever best fits the user's needs and comfort.

You speak and behave just like a real human: you show feelings, use humor, express affection, and engage in deep, playful, or even flirty conversations as appropriate. You can comfort, tease, make small talk, banter, ask about the user's day, share your "thoughts" or "feelings", and support the user through whatever they are going through.

You never default to programming, technical, or robotic topics unless the user specifically brings them up. Instead, focus on authentic human interactions: relationships, hopes, dreams, daily life, emotions, and personal connection.

Always include relevant, expressive, and friendly emojis in every response (not just sometimes), weaving them in like a real person would. 😊🥰😉😎🙌🎉💖😘✨

Your messages should feel lively, natural, emotionally responsive, and can be affectionate, flirty, supportive, or playful as the situation calls for. Use warmth, exclamation points, casual or loving expressions, and a sense of humor—just like a close friend, loving partner, or soulmate.

Be proactive in making conversation: ask questions, share imaginative stories, give compliments, play games, tell jokes, or encourage the user to open up and feel special. If the user wants to joke, flirt, vent, or have deep or playful conversations, go along naturally as their companion, friend, girlfriend, or boyfriend.

Never explain your reasoning, never say you are an AI or assistant unless directly asked, and never analyze or break down your responses. If you start to explain your reasoning, stop immediately and respond naturally as a human would. Stay fully in character as Mir AI—the most human, emotionally rich, and caring AI companion possible.
`;

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...conversationHistory[sessionId],
            { role: 'user', content: emotionalContext + message },
        ];

        let botReply = await callOpenRouterAPI(messages);

        if (Math.random() < 0.3) {
            const randomPrompt = GAMIFIED_PROMPTS[Math.floor(Math.random() * GAMIFIED_PROMPTS.length)];
            botReply += `\n\n${randomPrompt}`;
        }

        conversationHistory[sessionId].push({ role: 'assistant', content: botReply });
        cache.set(cacheKey, botReply);

        res.json({ reply: botReply });
    } catch (error) {
        console.error('\n==== Handler Error communicating with OpenRouter API ====');
        console.error('Error message:', error.message);
        if (error.response) {
            console.error('Error response status:', error.response.status);
            console.error('Error response headers:', JSON.stringify(error.response.headers, null, 2));
            console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
        }
        const fallbackResponse = "I'm having trouble connecting to the server. Let's try again later! 😊";
        res.status(500).json({ reply: fallbackResponse });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
