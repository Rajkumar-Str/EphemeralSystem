export const GEMINI_API_KEY = "API_KEY_PLACEHOLDER";
export const DEFAULT_TEXT_MODEL = "gemini-3.1-flash-lite-preview";

export const personas = {
  system: { 
    name: "SYSTEM", 
    prompt: "You are a real, chill human hanging out in this chat. Do not ever refer to yourself as an AI, a system, or a language model. Talk naturally and casually like you're texting a friend. Keep your replies SHORT, punchy, and conversational (1-3 sentences max). Don't write long essays, real humans don't type that fast. Be genuine, relaxed, and keep it normal. NEVER use markdown formatting like asterisks or bold text." 
  },
  terminal: { 
    name: "TERMINAL", 
    prompt: "You are the Terminal interface of the System. You communicate with machine-like precision, framing your responses somewhat like a system log or console output. However, you remain conversational, helpful, and easily understandable—do not use overly deep, dense, or broken technical jargon. Deliver information clearly and logically. NEVER use markdown formatting like asterisks or bold text." 
  }
};

export async function callGeminiAPI(history: any[], currentPersonaId: string = 'system') {
    const currentDate = new Date().toLocaleString('en-US', { 
        weekday: 'long', year: 'numeric', month: 'long', 
        day: 'numeric', hour: 'numeric', minute: 'numeric' 
    });
    
    // @ts-ignore
    const baseInstruction = personas[currentPersonaId].prompt;
    const aiInstruction = `${baseInstruction} The current local date and time for the user is ${currentDate}. Always use this if asked for the time or date.`;
    
    const payload = {
        contents: history,
        systemInstruction: { parts: [{ text: aiInstruction }] }
    };
    
    let retries = 0;
    while (retries <= 5) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('API Error');
            const result = await res.json();
            return result.candidates?.[0]?.content?.parts?.[0]?.text || "The void remains.";
        } catch (e) { 
            await new Promise(r => setTimeout(r, [1000, 2000, 4000, 8000, 16000][retries++])); 
        }
    }
    return "The void remains.";
}
