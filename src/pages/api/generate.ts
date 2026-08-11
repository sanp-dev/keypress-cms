// src/pages/api/generate.ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { topic, type, addMcq } = body;
    const apiKey = env.GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Gemini API Key .env फ़ाइल में नहीं मिली!" }), { status: 500 });
    }

    if (!topic) {
      return new Response(JSON.stringify({ error: "Topic खाली है!" }), { status: 400 });
    }

    
    let prompt = `Write a comprehensive, highly SEO-optimized blog post about: "${topic}".\n\nRequirements:\n- Write completely in Markdown format.\n- Start with a catchy # Title (H1).\n- Include an engaging introduction.\n- Use clear ## Headings and ### Subheadings.\n- Use bullet points or bold text where necessary to make it scannable.\n- Write a solid conclusion.\n`;
    if (addMcq) {
      prompt += `\n- At the very end, add a section called "## Test Your Knowledge (MCQs)" containing exactly 5 Multiple Choice Questions related to the topic. Each question must have 4 options (A-D), with the correct option marked in **bold** (e.g. **A) Correct choice** or **C) Correct choice**), followed by a 2-3 line "Explanation:" detailing why it is correct.\n`;
    }

    
    const models = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];
    
    let generatedMarkdown = '';
    let successfulModel = '';
    const executionLogs = []; 

    
    for (const model of models) {
      const timestamp = new Date().toLocaleTimeString();
      executionLogs.push({
        time: timestamp,
        model: model,
        status: 'INFO',
        message: `Attempting connection with ${model}...`
      });

      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        const errorText = await response.text();

        if (!response.ok) {
          let errorReason = `HTTP Error ${response.status}`;
          try {
            const errJson = JSON.parse(errorText);
            errorReason = errJson.error?.message || errorReason;
          } catch (e) {}
          
          throw new Error(errorReason);
        }

        
        const data = JSON.parse(errorText);
        generatedMarkdown = data.candidates[0].content.parts[0].text;
        successfulModel = model;
        
        executionLogs.push({
          time: new Date().toLocaleTimeString(),
          model: model,
          status: 'SUCCESS',
          message: `Generation successful using ${model}!`
        });

        break; 

      } catch (error: any) {
        executionLogs.push({
          time: new Date().toLocaleTimeString(),
          model: model,
          status: 'FAILED',
          message: `Rejected: ${error.message}`
        });
      }
    }

    if (!generatedMarkdown) {
      return new Response(JSON.stringify({ 
        error: "सभी एस्पिरेशनल मॉडल्स (Gemini 3.5/2.5) रिस्पॉन्ड करने में असमर्थ रहे। कृपया कंसोल टैब चेक करें।", 
        logs: executionLogs 
      }), { status: 500 });
    }

    return new Response(JSON.stringify({ 
      content: generatedMarkdown, 
      activeModel: successfulModel, 
      logs: executionLogs 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}