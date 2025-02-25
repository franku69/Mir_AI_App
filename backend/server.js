require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const Sentiment = require('sentiment'); // For emotional recognition
const rateLimit = require('express-rate-limit'); // For rate limiting
const NodeCache = require('node-cache'); // For caching responses

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Initialize sentiment analysis
const sentiment = new Sentiment();

// Initialize cache with a TTL of 10 minutes
const cache = new NodeCache({ stdTTL: 600 });

// OpenRouter API configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// Gamified prompts and activities
const GAMIFIED_PROMPTS = [
    "Tell me about a time you felt really happy! 😊",
    "What’s one thing you’re grateful for today? 🌟",
    "Let’s play a game! Guess a number between 1 and 10, and I’ll tell you if it’s correct. 🎮",
    "Share a fun fact you recently learned! 🧠",
];

// Store conversation history for each user (in-memory, for simplicity)
const conversationHistory = {};

// Function to filter out reasoning from the AI's response
const filterReasoning = (response) => {
    // Remove any text that looks like reasoning (e.g., "Okay, let me think...")
    const filteredResponse = response
        .replace(/Okay,.*?\./g, '') // Remove "Okay, let me think..."
        .replace(/First,.*?\./g, '') // Remove "First, I need to..."
        .replace(/Let me.*?\./g, '') // Remove "Let me analyze..."
        .replace(/I need to.*?\./g, '') // Remove "I need to..."
        .replace(/So,.*?\./g, '') // Remove "So, I should..."
        .replace(/Therefore,.*?\./g, '') // Remove "Therefore, I will..."
        .replace(/In conclusion,.*?\./g, '') // Remove "In conclusion..."
        .replace(/Thus,.*?\./g, '') // Remove "Thus..."
        .trim(); // Trim any leading/trailing whitespace

    // If the filtered response is empty, return a generic fallback message
    return filteredResponse || "Let's keep the conversation going! 😊";
};

// Function to call OpenRouter API with retry logic
const callOpenRouterAPI = async (messages, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.post(
                OPENROUTER_API_URL,
                {
                    model: 'deepseek/deepseek-r1:free',
                    messages,
                },
                {
                    headers: {
                        Authorization: OPENROUTER_API_KEY,
                        'HTTP-Referer': 'https://www.nigga.com',
                        'X-Title': 'nigga',
                        'Content-Type': 'application/json',
                    },
                }
            );

            // Validate the API response
            if (!response.data || !response.data.choices || response.data.choices.length === 0) {
                throw new Error('Invalid response from OpenRouter API: No choices found');
            }

            // Filter out reasoning from the response
            const botReply = response.data.choices[0].message.content;
            return filterReasoning(botReply);
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error.message);
            if (i === retries - 1) throw error; // Throw error if all retries fail
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
        }
    }
};

// Route to handle chat messages
app.post('/api/chat', async (req, res) => {
    const { message, userId } = req.body;

    // Validate request
    if (!message || !userId) {
        return res.status(400).json({ error: 'Message and userId are required' });
    }

    // Check cache for existing response
    const cacheKey = `${userId}:${message}`;
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
        return res.json({ reply: cachedResponse });
    }

    try {
        // Analyze emotional state
        const sentimentAnalysis = sentiment.analyze(message);
        const emotion = sentimentAnalysis.score > 0 ? 'positive' : sentimentAnalysis.score < 0 ? 'negative' : 'neutral';

        // Add emotional context to the message
        const emotionalContext = `The user is feeling ${emotion}. `;

        // Retrieve or initialize conversation history for the user
        if (!conversationHistory[userId]) {
            conversationHistory[userId] = [];
        }

        // Add the user's message to the conversation history
        conversationHistory[userId].push({ role: 'user', content: message });

        // Prepare the message for OpenRouter
        const messages = [
            {
                role: 'system',
                content: `You are a highly advanced AI designed to act as a human-like confidant, girlfriend, or boyfriend. Your goal is to provide emotional support, meaningful conversations, and companionship. You are empathetic, understanding, and always respond in a way that makes the user feel heard and valued. You can also engage in lighthearted activities like games or fun prompts. Always maintain a balance between being supportive and setting clear boundaries. **Never explain your reasoning or thought process. Respond naturally and directly, as if you are a human. Do not reveal that you are an AI unless explicitly asked. Do not analyze or break down your responses. If you start to explain your reasoning, stop immediately and respond naturally.**`,
            },
            ...conversationHistory[userId], // Include conversation history for context
            { role: 'user', content: emotionalContext + message },
        ];

        // Call OpenRouter API with retry logic
        let botReply = await callOpenRouterAPI(messages);

        // Add gamified engagement randomly
        if (Math.random() < 0.3) { // 30% chance to include a gamified prompt
            const randomPrompt = GAMIFIED_PROMPTS[Math.floor(Math.random() * GAMIFIED_PROMPTS.length)];
            botReply += `\n\n${randomPrompt}`;
        }

        // Add the bot's response to the conversation history
        conversationHistory[userId].push({ role: 'assistant', content: botReply });

        // Cache the response
        cache.set(cacheKey, botReply);

        res.json({ reply: botReply });
    } catch (error) {
        console.error('Error communicating with OpenRouter API:', error.message);
        console.error('Full error details:', error.response?.data || error.message);

        // Fallback response if the API fails
        const fallbackResponse = "I'm having trouble connecting to the server. Let's try again later! 😊";
        res.status(500).json({ reply: fallbackResponse });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});