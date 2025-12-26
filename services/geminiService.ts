
import { GoogleGenAI } from "@google/genai";
import { AppNode, AppEdge } from "../types";

/**
 * Audits the gas system using Gemini AI to identify safety or efficiency concerns.
 * Uses gemini-3-flash-preview for general text-based reasoning tasks.
 */
export async function auditSystem(nodes: AppNode[], edges: AppEdge[]) {
  // Initialize the AI client inside the function to ensure the latest API key from process.env is used.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    Analyze this gas piping system layout for a professional engineering audit.
    Nodes: ${JSON.stringify(nodes)}
    Edges: ${JSON.stringify(edges)}
    
    STRUCTURE YOUR RESPONSE EXACTLY AS FOLLOWS:
    1. Provide EXACTLY TWO sections.
    2. Section 1 should be titled "Safety & Compliance Audit".
    3. Section 2 should be titled "Optimization & Performance".
    4. Provide EXACTLY 5 concise bullet points per section.
    5. Do not include any intro or outro text.
    
    Base your audit on NFPA 54 / IFGC standards and common gas plumbing best practices.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.4, // Lower temperature for more consistent structural adherence
      }
    });
    
    return response.text;
  } catch (error) {
    console.error("Gemini Audit Error:", error);
    return "Failed to perform AI audit. Please check your connections and try again.";
  }
}
