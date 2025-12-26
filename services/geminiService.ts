import { GoogleGenAI } from "@google/genai";
import { AppNode, AppEdge } from "../types";

/**
 * Audits the gas system using Gemini AI.
 * Strictly formatted for 2 sections with exactly 5 bullets each.
 */
export async function auditSystem(nodes: AppNode[], edges: AppEdge[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    Analyze this gas piping system layout for a professional engineering audit.
    Nodes: ${JSON.stringify(nodes)}
    Edges: ${JSON.stringify(edges)}
    
    STRUCTURE YOUR RESPONSE EXACTLY AS FOLLOWS:
    1. PROVIDE EXACTLY TWO SECTIONS.
    2. SECTION 1 TITLE: "Safety & Compliance Audit"
    3. SECTION 2 TITLE: "Performance & Optimization"
    4. PROVIDE EXACTLY 5 BULLET POINTS PER SECTION.
    5. KEEP BULLETS CONCISE AND PROFESSIONAL.
    
    DO NOT INCLUDE ANY INTRO OR OUTRO TEXT.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.2, // Lower temperature for more consistent structural output
      }
    });
    
    return response.text;
  } catch (error) {
    console.error("Gemini Audit Error:", error);
    return "Safety & Compliance Audit\n- Audit engine connection lost.\n- Verify internet access.\n- Ensure API key is valid.\n- Check project node structure.\n- Retry audit in a moment.\n\nPerformance & Optimization\n- No metrics available currently.\n- System data could not be parsed.\n- Check for floating components.\n- Ensure meter is connected.\n- Refresh design and retry.";
  }
}