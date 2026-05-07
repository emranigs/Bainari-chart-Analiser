import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AnalysisResult {
  prediction: "UP" | "DOWN" | "NEUTRAL";
  confidence: number;
  patterns: string[];
  indicators: {
    movingAverage?: string;
    rsi?: string;
    macd?: string;
  };
  timeframeResults: {
    [key: string]: "UP" | "DOWN" | "NEUTRAL";
  };
  reasoning: string;
  candleTime?: string;
}

export async function analyzeChartImage(base64Image: string): Promise<AnalysisResult> {
  const systemInstruction = `You are a professional financial chart analysis engine. 
  Your primary goal is to analyze screenshots that include Moving Average, RSI, and MACD indicators.
  Your output MUST be a valid JSON object. 
  NO conversational text, NO code blocks.
  Stick strictly to the schema.`;

  const prompt = `Perform a high-level technical scan of this chart:
    - prediction: UP (CALL), DOWN (PUT), or NEUTRAL
    - confidence: 0-100 based on indicator agreement
    - patterns: [detected candle patterns]
    - indicators: 
        * movingAverage: describe the trend (e.g. "Price above MA", "Price crossing down")
        * rsi: current condition (e.g. "Overbought", "Oversold", "Neutral - 45")
        * macd: signal status (e.g. "Bullish Crossover", "Histogram shrinking")
    - candleTime: detected timeframe (e.g. "1m", "5s")
    - timeframeResults: signals for 5s, 10s, 15s, 30s, 1m, 5m
    - reasoning: Combine MA, RSI, and MACD data into 1 precise sentence.
    
    Return JSON only.`;

  const imagePart = {
    inlineData: {
      mimeType: "image/png",
      data: base64Image,
    },
  };

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: { parts: [imagePart, { text: prompt }] },
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 1024,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          prediction: { type: Type.STRING, enum: ["UP", "DOWN", "NEUTRAL"] },
          confidence: { type: Type.NUMBER },
          patterns: { type: Type.ARRAY, items: { type: Type.STRING } },
          indicators: {
            type: Type.OBJECT,
            properties: {
              movingAverage: { type: Type.STRING },
              rsi: { type: Type.STRING },
              macd: { type: Type.STRING },
            }
          },
          timeframeResults: {
            type: Type.OBJECT,
            properties: {
              "5s": { type: Type.STRING, enum: ["UP", "DOWN", "NEUTRAL"] },
              "10s": { type: Type.STRING, enum: ["UP", "DOWN", "NEUTRAL"] },
              "15s": { type: Type.STRING, enum: ["UP", "DOWN", "NEUTRAL"] },
              "30s": { type: Type.STRING, enum: ["UP", "DOWN", "NEUTRAL"] },
              "1m": { type: Type.STRING, enum: ["UP", "DOWN", "NEUTRAL"] },
              "5m": { type: Type.STRING, enum: ["UP", "DOWN", "NEUTRAL"] },
            },
            required: ["5s", "10s", "15s", "30s", "1m", "5m"]
          },
          reasoning: { type: Type.STRING },
          candleTime: { type: Type.STRING },
        },
        required: ["prediction", "confidence", "patterns", "indicators", "timeframeResults", "reasoning", "candleTime"],
      },
    },
  });

  try {
    let text = response.text || "";
    
    // Robust JSON extraction
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      text = text.substring(start, end + 1);
    } else {
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    }

    if (!text) throw new Error("Empty AI response");

    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Raw Response:", response.text);
    console.error("JSON Parse Error:", error);
    throw new Error("AI analysis did not return a valid format. Please try again with a clearer screenshot.");
  }
}
