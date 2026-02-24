import "dotenv/config";
import { parseTranscript } from "./services/gemini.js";
import { processTranscript } from "./services/foodParser.js";
import type { GeminiRequestContext } from "../../shared/types.js";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function header(text: string) {
  console.log(`\n${CYAN}${"=".repeat(60)}${RESET}`);
  console.log(`${CYAN}  ${text}${RESET}`);
  console.log(`${CYAN}${"=".repeat(60)}${RESET}\n`);
}

function testLabel(name: string) {
  console.log(`${YELLOW}▸ ${name}${RESET}`);
}

function result(obj: unknown) {
  console.log(`${GREEN}  ✓${RESET} ${DIM}${JSON.stringify(obj, null, 2)}${RESET}\n`);
}

function error(msg: string) {
  console.log(`${RED}  ✗ ${msg}${RESET}\n`);
}

function baseContext(overrides: Partial<GeminiRequestContext> = {}): GeminiRequestContext {
  return {
    transcript: "",
    currentDraft: [],
    timeOfDay: "18:30",
    date: "2026-02-24",
    sessionState: "normal",
    ...overrides,
  };
}

async function testGeminiDirect() {
  header(`Gemini parseTranscript — mode: ${process.env.GEMINI_MOCK === "true" ? "MOCK" : "REAL API"}`);

  const cases: Array<{ name: string; ctx: GeminiRequestContext }> = [
    {
      name: "ADD single item: '200 grams of chicken breast'",
      ctx: baseContext({ transcript: "200 grams of chicken breast" }),
    },
    {
      name: "ADD multiple items: 'a cup of rice and 2 eggs'",
      ctx: baseContext({ transcript: "a cup of rice and 2 eggs" }),
    },
    {
      name: "EDIT implicit: 'actually make that 3'",
      ctx: baseContext({
        transcript: "actually make that 3",
        currentDraft: [
          { id: "tmp-1", name: "chicken breast", quantity: 200, unit: "g" },
          { id: "tmp-2", name: "eggs", quantity: 2, unit: "pieces" },
        ],
      }),
    },
    {
      name: "REMOVE: 'remove the butter'",
      ctx: baseContext({
        transcript: "remove the butter",
        currentDraft: [
          { id: "tmp-1", name: "chicken breast", quantity: 200, unit: "g" },
          { id: "tmp-2", name: "butter", quantity: 15, unit: "g" },
        ],
      }),
    },
    {
      name: "SESSION_END: 'done'",
      ctx: baseContext({
        transcript: "done",
        currentDraft: [
          { id: "tmp-1", name: "chicken breast", quantity: 200, unit: "g" },
        ],
      }),
    },
    {
      name: "CREATE_FOOD_RESPONSE confirm: 'yeah sure'",
      ctx: baseContext({
        transcript: "yeah sure",
        sessionState: "creating:tmp-2",
        creatingFoodProgress: { currentField: "confirm" },
      }),
    },
  ];

  for (const tc of cases) {
    testLabel(tc.name);
    try {
      const intent = await parseTranscript(tc.ctx);
      result(intent);
    } catch (e) {
      error(e instanceof Error ? e.message : String(e));
    }
  }
}

async function testFoodParser() {
  header("Food Parser (processTranscript) — end-to-end with USDA lookup");

  const userId = "test-user-id";

  testLabel("'200 grams of chicken breast' → should hit USDA");
  try {
    const messages = await processTranscript(
      baseContext({ transcript: "200 grams of chicken breast" }),
      userId,
    );
    result(messages);
  } catch (e) {
    error(e instanceof Error ? e.message : String(e));
  }

  testLabel("'Mom\\'s chili' → should trigger create_food_prompt (no match)");
  try {
    const messages = await processTranscript(
      baseContext({ transcript: "Mom's chili" }),
      userId,
    );
    result(messages);
  } catch (e) {
    error(e instanceof Error ? e.message : String(e));
  }
}

async function main() {
  console.log(`\n${DIM}GEMINI_MOCK=${process.env.GEMINI_MOCK}${RESET}`);
  console.log(`${DIM}GEMINI_API_KEY=${process.env.GEMINI_API_KEY ? "configured ✓" : "NOT SET ✗"}${RESET}`);

  await testGeminiDirect();
  await testFoodParser();

  console.log(`\n${GREEN}All tests completed.${RESET}\n`);
  process.exit(0);
}

main();
