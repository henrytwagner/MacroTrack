import type { GeminiRequestContext } from "../types";

/**
 * Builds the user message sent to Gemini for each voice session turn.
 *
 * The system prompt (system-prompt.ts) is set once as the system instruction.
 * This function produces the per-turn user message containing the transcript
 * and all contextual state the AI needs to interpret it correctly.
 */
export function buildGeminiUserMessage(context: GeminiRequestContext): string {
  const parts: string[] = [
    `TRANSCRIPT: "${context.transcript}"`,
    "",
    `TIME: ${context.timeOfDay}`,
    `DATE: ${context.date}`,
    `SESSION_STATE: ${context.sessionState}`,
  ];

  if (context.currentDraft.length > 0) {
    parts.push("");
    parts.push("CURRENT DRAFT:");
    for (const item of context.currentDraft) {
      const qty = item.quantity && item.unit
        ? `${item.quantity} ${item.unit}`
        : "no quantity";
      parts.push(`  - [${item.id}] ${item.name} (${qty})`);
    }
  } else {
    parts.push("");
    parts.push("CURRENT DRAFT: (empty)");
  }

  if (context.sessionState.startsWith("creating:") && context.creatingFoodProgress) {
    const p = context.creatingFoodProgress;
    parts.push("");
    parts.push("CREATING FOOD PROGRESS:");
    parts.push(`  Current question: ${p.currentField}`);
    if (p.servingSize !== undefined) parts.push(`  Serving size: ${p.servingSize} ${p.servingUnit ?? ""}`);
    if (p.calories !== undefined) parts.push(`  Calories: ${p.calories}`);
    if (p.proteinG !== undefined) parts.push(`  Protein: ${p.proteinG}g`);
    if (p.carbsG !== undefined) parts.push(`  Carbs: ${p.carbsG}g`);
    if (p.fatG !== undefined) parts.push(`  Fat: ${p.fatG}g`);
  }

  return parts.join("\n");
}
