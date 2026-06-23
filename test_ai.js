require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: "say hi",
        });
        console.log("RESPONSE:", response.text);
    } catch(e) {
        console.error("ERROR:", e);
    }
}
run();
