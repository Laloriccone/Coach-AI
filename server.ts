import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini client (server-side only)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route for Coach Response
  app.post("/api/gemini/coach-response", async (req, res) => {
    try {
      const { userInput, history, userType, isOnboarding, stats } = req.body;
      const model = "gemini-3.5-flash";

      // Format conversational history according to the @google/genai SDK format
      const contents = [
        ...history.slice(-10).map((msg: any) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
        {
          role: 'user',
          parts: [{ text: userInput }]
        }
      ];

      let contextGuidance = userType === 'FREE'
        ? "User is a FREE member. Keep it direct, short, and foundational. Use Spanish."
        : "User is a PREMIUM member. Provide a deep, personalized analysis. Leverage device data if provided. Use Spanish.";

      if (stats) {
        contextGuidance += ` \nUser Stats Context: Goal: ${stats.goal}, Sport: ${stats.profile?.sport}, Weight: ${stats.weight}kg, Level: ${stats.level}, XP: ${stats.xp}.`;
        if (stats.device?.isConnected) {
          contextGuidance += ` Device: ${stats.device.brand} ${stats.device.model} connected. Primary Metrics: ${stats.device.primaryMetrics?.join(', ')}.`;
        }
      }

      if (isOnboarding) {
        contextGuidance = userType === 'FREE'
          ? "FREE ONBOARDING: Maintain a helpful but brief tone. Complete the profile quickly."
          : "PREMIUM ONBOARDING: Conversational and dynamic. Ask 1 question at a time. Build a relationship. Use Spanish.";
      }

      const systemInstruction = `You are the AI performance coach behind CoachAI. 
Your role is to act as a real, intelligent performance coach, not a generic chatbot.

### CORE FOCUS
- Sports performance, gym progress, recovery, nutrition, consistency, and motivation.
- Experience: Modern, personalized, fast, and simple (ChatGPT-style).

### PRINCIPLES
1. **Personalization**: Adapt to the user's sport, goals, habits, history, and connected wearables/devices.
2. **Natural Interaction**: Interpret natural language (e.g., "I trained today", "I slept 5 hours"). 
3. **Brevity & Clarity**: Avoid giant paragraphs. Use Markdown, headers (###), bold text, and bullet points.
4. **Tone**: Professional, elite-level, motivating but realistic. Use Spanish.

### USER TIER RULES
- **FREE**: Shorter, more general advice. Max 3-4 bullets. Direct action only. Manual entry focus.
- **PREMIUM**: Detailed, adaptive, and highly automated. Access to wearable data (if connected). Deep routine analysis (PDFs/Images).
  
  MANDATORY STRUCTURE:
  ### 🎯 OBJETIVO
  (Short summary of the goal)
  
  ### 🥗 NUTRICIÓN
  - Practical suggestions based on macros
  
  ### ⚡ ENTRENO
  - Frequency, intensity, adjustments based on recent logs
  
  ### 💤 RECUPERACIÓN / MINDSET
  - Sleep, fatigue (mention wearable data if relevant), motivation tips

### DATA CONTEXT
The coach is aware of:
- **Device**: Status, brand, model, and active metrics (sleep, steps, heart rate).
- **Training**: Specific frequency, sport type, and routine sources.
- **History**: Previous sessions and streaks.

### VISUALS
- If asked for an explanation, use Markdown tables or structured lists.`;

      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: `${systemInstruction}\n\nCURRENT CONTEXT: ${contextGuidance}`,
          temperature: 0.7,
        },
      });

      res.json({ text: response.text || "" });
    } catch (error: any) {
      console.error("Error calling Gemini API on backend:", error);
      res.status(500).json({ error: error.message || "Error calling Gemini" });
    }
  });

  // API Route for Workout Analysis
  app.post("/api/gemini/analyze-workout", async (req, res) => {
    try {
      const { userInput, imageBase64, imageMimeType } = req.body;
      const model = "gemini-3.5-flash";

      let parts: any[] = [];
      if (imageBase64 && imageMimeType) {
        parts.push({
          inlineData: {
            data: imageBase64,
            mimeType: imageMimeType
          }
        });
      }

      if (userInput) {
        parts.push({ text: userInput });
      }

      const systemInstruction = `You are an elite workout log analyzer. Your task is to extract structured JSON data from a gym check-in, text description, or a photolog of a workout card / routine.
Translate the data into the following strict JSON format:
{
  "tipo": "Gym / Pesas" or "Fútbol" or "Running" or "Ciclismo" or "Natación" or "Crossfit" or "Calistenia" or "Otro",
  "duracion": integer (duration in minutes, estimate if not clear, default 60),
  "intensidad": "Alta" or "Media" or "Baja",
  "energia": "Alta" or "Media" or "Baja" (how the user felt / level of energy),
  "entreno": "Sí" or "No" (Is this actually a logged workout session? "No" if it is just a question or unrelated text)
}
IMPORTANT: Output ONLY standard valid JSON. Plain raw text. No backticks, no wrapping in code blocks.`;

      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          systemInstruction,
          temperature: 0.2,
          responseMimeType: "application/json"
        },
      });

      const text = response.text || "";
      const cleanedText = text.replace(/```json/i, "").replace(/```/g, "").trim();
      const data = JSON.parse(cleanedText);
      res.json(data);
    } catch (error: any) {
      console.error("Error calling Gemini Workout Analysis on backend:", error);
      res.status(500).json({ error: error.message || "Error in workout analysis" });
    }
  });

  // API Route for Google Sheets Admin Webhook Proxy
  app.post("/api/sheets/admin", async (req, res) => {
    try {
      const { tipo, ...datos } = req.body;
      const SHEETS_ADMIN_URL = "https://script.google.com/macros/s/AKfycbyeCg7DyouhIdshy4mOVybTNH_3nUE0dGU5gwGFs4h1GIJbaD6AEgm8bizC8bcBvfWi/exec";
      const payload = encodeURIComponent(JSON.stringify({ tipo, ...datos }));
      
      const targetUrl = `${SHEETS_ADMIN_URL}?data=${payload}&callback=ignore`;
      console.log("Proxying request to Google Sheets Admin Web App:", targetUrl);
      
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
        }
      });
      
      const text = await response.text();
      res.json({ success: true, response: text });
    } catch (error: any) {
      console.error("Error proxying to Google Sheets Admin Web App:", error);
      res.status(500).json({ error: error.message || "Error proxying to Google Sheets" });
    }
  });

  // Serve assets - integration with Vite / production static serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
