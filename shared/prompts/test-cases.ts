/**
 * Gemini prompt test cases.
 *
 * Each case has an input (what gets sent to Gemini) and the expected output.
 * Use these to validate prompt behavior in Google AI Studio before integration.
 *
 * To test: paste the system prompt from system-prompt.ts as the system
 * instruction in Google AI Studio, then send each test case's `input` as
 * the user message and compare against `expectedOutput`.
 */

export interface PromptTestCase {
  name: string;
  description: string;
  input: {
    transcript: string;
    currentDraft: Array<{ id: string; name: string; quantity: number; unit: string }>;
    timeOfDay: string;
    date: string;
    sessionState: string;
    creatingFoodProgress?: {
      currentField: string;
      [key: string]: unknown;
    };
  };
  expectedOutput: {
    action: string;
    payload: unknown;
  };
}

export const TEST_CASES: PromptTestCase[] = [

  // -------------------------------------------------------
  // ADD_ITEMS — Basic
  // -------------------------------------------------------

  {
    name: "Single item with quantity",
    description: "User adds one food with explicit quantity and unit",
    input: {
      transcript: "200 grams of chicken breast",
      currentDraft: [],
      timeOfDay: "18:30",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "ADD_ITEMS",
      payload: {
        items: [{ name: "chicken breast", quantity: 200, unit: "g" }],
      },
    },
  },

  {
    name: "Multiple items in one utterance",
    description: "User adds several foods in a single sentence",
    input: {
      transcript: "200 grams of chicken breast, a cup of brown rice, and 2 eggs",
      currentDraft: [],
      timeOfDay: "18:30",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "ADD_ITEMS",
      payload: {
        items: [
          { name: "chicken breast", quantity: 200, unit: "g" },
          { name: "brown rice", quantity: 1, unit: "cups" },
          { name: "eggs", quantity: 2, unit: "pieces" },
        ],
      },
    },
  },

  {
    name: "Item without quantity (bulk food)",
    description: "User says a food without quantity — should NOT trigger CLARIFY for bulk items",
    input: {
      transcript: "chicken breast",
      currentDraft: [],
      timeOfDay: "12:00",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "ADD_ITEMS",
      payload: {
        items: [{ name: "chicken breast", quantity: null, unit: null }],
      },
    },
  },

  {
    name: "Countable item without quantity",
    description: "User says a countable food without a number — should trigger CLARIFY",
    input: {
      transcript: "add eggs",
      currentDraft: [],
      timeOfDay: "08:00",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "CLARIFY",
      payload: {
        targetItem: "eggs",
        question: "How many eggs?",
      },
    },
  },

  {
    name: "Natural serving description",
    description: "User uses natural language for portions",
    input: {
      transcript: "a banana and a glass of milk",
      currentDraft: [],
      timeOfDay: "08:15",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "ADD_ITEMS",
      payload: {
        items: [
          { name: "banana", quantity: 1, unit: "pieces" },
          { name: "milk", quantity: 1, unit: "cups" },
        ],
      },
    },
  },

  // -------------------------------------------------------
  // EDIT_ITEM
  // -------------------------------------------------------

  {
    name: "Edit with explicit item name",
    description: "User names the item and gives new quantity",
    input: {
      transcript: "change the rice to 200 grams",
      currentDraft: [
        { id: "tmp-1", name: "chicken breast", quantity: 150, unit: "g" },
        { id: "tmp-2", name: "brown rice", quantity: 1, unit: "cups" },
      ],
      timeOfDay: "18:45",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "EDIT_ITEM",
      payload: {
        targetItem: "brown rice",
        field: "quantity",
        newValue: 200,
      },
    },
  },

  {
    name: "Edit with implicit 'make that'",
    description: "User corrects the most recent item without naming it",
    input: {
      transcript: "actually make that 3",
      currentDraft: [
        { id: "tmp-1", name: "chicken breast", quantity: 150, unit: "g" },
        { id: "tmp-2", name: "eggs", quantity: 2, unit: "pieces" },
      ],
      timeOfDay: "08:30",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "EDIT_ITEM",
      payload: {
        targetItem: "eggs",
        field: "quantity",
        newValue: 3,
      },
    },
  },

  {
    name: "Edit with 'not X, Y' pattern",
    description: "User corrects a misheard number",
    input: {
      transcript: "not 30 grams, 13",
      currentDraft: [
        { id: "tmp-1", name: "butter", quantity: 30, unit: "g" },
      ],
      timeOfDay: "19:00",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "EDIT_ITEM",
      payload: {
        targetItem: "butter",
        field: "quantity",
        newValue: 13,
      },
    },
  },

  // -------------------------------------------------------
  // REMOVE_ITEM
  // -------------------------------------------------------

  {
    name: "Remove by name",
    description: "User explicitly removes an item",
    input: {
      transcript: "remove the butter",
      currentDraft: [
        { id: "tmp-1", name: "chicken breast", quantity: 200, unit: "g" },
        { id: "tmp-2", name: "butter", quantity: 15, unit: "g" },
      ],
      timeOfDay: "19:00",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "REMOVE_ITEM",
      payload: {
        targetItem: "butter",
      },
    },
  },

  {
    name: "Remove with 'never mind'",
    description: "User uses casual language to remove",
    input: {
      transcript: "never mind the eggs",
      currentDraft: [
        { id: "tmp-1", name: "eggs", quantity: 3, unit: "pieces" },
        { id: "tmp-2", name: "toast", quantity: 2, unit: "slices" },
      ],
      timeOfDay: "08:15",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "REMOVE_ITEM",
      payload: {
        targetItem: "eggs",
      },
    },
  },

  // -------------------------------------------------------
  // SESSION_END
  // -------------------------------------------------------

  {
    name: "Done - explicit",
    description: "User says done",
    input: {
      transcript: "done",
      currentDraft: [
        { id: "tmp-1", name: "chicken breast", quantity: 200, unit: "g" },
      ],
      timeOfDay: "19:00",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "SESSION_END",
      payload: null,
    },
  },

  {
    name: "Done - natural phrasing",
    description: "User uses natural language to end session",
    input: {
      transcript: "that's everything, save that",
      currentDraft: [
        { id: "tmp-1", name: "chicken breast", quantity: 200, unit: "g" },
        { id: "tmp-2", name: "brown rice", quantity: 1, unit: "cups" },
      ],
      timeOfDay: "19:00",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "SESSION_END",
      payload: null,
    },
  },

  // -------------------------------------------------------
  // CREATE_FOOD_RESPONSE — Voice-guided custom food creation
  // -------------------------------------------------------

  {
    name: "Confirm creation - yes",
    description: "User agrees to create a custom food",
    input: {
      transcript: "yeah sure",
      currentDraft: [
        { id: "tmp-1", name: "chicken breast", quantity: 200, unit: "g" },
      ],
      timeOfDay: "19:00",
      date: "2026-02-24",
      sessionState: "creating:tmp-2",
      creatingFoodProgress: {
        currentField: "confirm",
      },
    },
    expectedOutput: {
      action: "CREATE_FOOD_RESPONSE",
      payload: {
        field: "confirm",
        value: true,
      },
    },
  },

  {
    name: "Confirm creation - no",
    description: "User declines to create a custom food",
    input: {
      transcript: "no skip it",
      currentDraft: [],
      timeOfDay: "19:00",
      date: "2026-02-24",
      sessionState: "creating:tmp-1",
      creatingFoodProgress: {
        currentField: "confirm",
      },
    },
    expectedOutput: {
      action: "CREATE_FOOD_RESPONSE",
      payload: {
        field: "confirm",
        value: false,
      },
    },
  },

  {
    name: "Provide serving size",
    description: "User tells serving size during creation flow",
    input: {
      transcript: "one cup",
      currentDraft: [],
      timeOfDay: "19:00",
      date: "2026-02-24",
      sessionState: "creating:tmp-1",
      creatingFoodProgress: {
        currentField: "servingSize",
      },
    },
    expectedOutput: {
      action: "CREATE_FOOD_RESPONSE",
      payload: {
        field: "servingSize",
        value: 1,
        unit: "cups",
      },
    },
  },

  {
    name: "Provide calories",
    description: "User gives calorie count during creation",
    input: {
      transcript: "350",
      currentDraft: [],
      timeOfDay: "19:00",
      date: "2026-02-24",
      sessionState: "creating:tmp-1",
      creatingFoodProgress: {
        currentField: "calories",
        servingSize: 1,
        servingUnit: "cups",
      },
    },
    expectedOutput: {
      action: "CREATE_FOOD_RESPONSE",
      payload: {
        field: "calories",
        value: 350,
      },
    },
  },

  {
    name: "Provide protein",
    description: "User gives protein amount with unit",
    input: {
      transcript: "25 grams",
      currentDraft: [],
      timeOfDay: "19:00",
      date: "2026-02-24",
      sessionState: "creating:tmp-1",
      creatingFoodProgress: {
        currentField: "protein",
        servingSize: 1,
        servingUnit: "cups",
        calories: 350,
      },
    },
    expectedOutput: {
      action: "CREATE_FOOD_RESPONSE",
      payload: {
        field: "protein",
        value: 25,
      },
    },
  },

  // -------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------

  {
    name: "Add item while in creation flow — interrupts creation",
    description: "User ignores the creation question and adds a different food. Should still be parsed as ADD_ITEMS (backend handles the interruption).",
    input: {
      transcript: "actually add 100 grams of broccoli",
      currentDraft: [
        { id: "tmp-1", name: "chicken breast", quantity: 200, unit: "g" },
      ],
      timeOfDay: "19:00",
      date: "2026-02-24",
      sessionState: "creating:tmp-2",
      creatingFoodProgress: {
        currentField: "servingSize",
      },
    },
    expectedOutput: {
      action: "ADD_ITEMS",
      payload: {
        items: [{ name: "broccoli", quantity: 100, unit: "g" }],
      },
    },
  },

  {
    name: "Gibberish / unrecognizable speech",
    description: "STT produced something the AI cannot parse",
    input: {
      transcript: "uhh hmm the thing",
      currentDraft: [],
      timeOfDay: "12:00",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "ADD_ITEMS",
      payload: {
        items: [],
      },
    },
  },

  {
    name: "Mixed add and edit in one utterance",
    description: "User adds a new item and corrects an existing one in the same breath",
    input: {
      transcript: "add a cup of yogurt and change the chicken to 250 grams",
      currentDraft: [
        { id: "tmp-1", name: "chicken breast", quantity: 200, unit: "g" },
      ],
      timeOfDay: "08:00",
      date: "2026-02-24",
      sessionState: "normal",
    },
    expectedOutput: {
      action: "ADD_ITEMS",
      payload: {
        items: [{ name: "yogurt", quantity: 1, unit: "cups" }],
      },
    },
    // Note: Gemini can only return one action per response. The backend
    // should handle this by processing ADD_ITEMS first, then on the next
    // turn the edit context may be re-sent. Alternatively, we could extend
    // the protocol to support multiple actions — flagged as a refinement.
  },
];
