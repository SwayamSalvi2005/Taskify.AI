import { chatWithGeminiService } from "../services/geminiService.js";
import { getCache, setCache } from "../config/redis.js";
import { summaryKey, SUMMARY_TTL } from "../services/taskService.js";



export const chatWithGemini = async (req, res, next) => {
    try {
        const { message, history } = req.body;
        const userId = req.user._id;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a message'
            });
        }

        if (message.length > 1000) {
            return res.status(400).json({
                success: false,
                message: 'Message is too long. Please keep it under 1000 characters.'
            });
        }

        // Defensive cleanup — only keep well-formed turns, and never send more
        // than the last 10 to Gemini (keeps each request a reasonable size).
        const safeHistory = Array.isArray(history)
            ? history
                .filter(h => h && typeof h.text === 'string' && (h.role === 'user' || h.role === 'model'))
                .slice(-10)
            : [];

        const result = await chatWithGeminiService(userId, message, true, safeHistory);

        res.status(200).json({
            success: true,
            message: 'Response generated successfully',
            data: {
                userMessage: message,
                aiResponse: result.text,
                // tells the frontend whether a task was just created/updated/deleted
                // so it knows to refresh the task list
                taskActionPerformed: result.taskActionPerformed
            }
        });
    } catch (error) {
        next(error);
    }
};



export const getTaskSummary = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const cacheKey = summaryKey(userId);

        // ─── REDIS: Check for a cached summary ────────────────────────────
        const cachedSummary = await getCache(cacheKey);

        if (cachedSummary) {
            // Cache HIT — return cached Gemini response (saves API quota + latency)
            console.log(`[Redis] Cache HIT  → summary:${userId}`);
            return res.status(200).json({
                success: true,
                summary: cachedSummary,
                cached: true  // optional field so frontend/devtools can see it's cached
            });
        }
        // ──────────────────────────────────────────────────────────────────

        // Cache MISS — call Gemini API and cache the response
        console.log(`[Redis] Cache MISS → summary:${userId}`);
        // allowActions = false → this auto-generated summary should never trigger
        // a task create/update/delete by itself
        const result = await chatWithGeminiService(
            userId,
            'Please give me a brief summary of my tasks, including what I need to focus on today.',
            false
        );

        // Store in Redis with 5-minute TTL
        await setCache(cacheKey, result.text, SUMMARY_TTL);

        res.status(200).json({
            success: true,
            summary: result.text,
            cached: false
        });
    } catch (error) {
        next(error);
    }
};