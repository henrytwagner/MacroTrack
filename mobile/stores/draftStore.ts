import { create } from 'zustand';
import type { DraftItem, Macros, WSServerMessage } from '@shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sumMacros(items: DraftItem[]): Macros {
  return items
    .filter((i) => i.state === 'normal')
    .reduce(
      (acc, item) => ({
        calories: acc.calories + item.calories,
        proteinG: acc.proteinG + item.proteinG,
        carbsG: acc.carbsG + item.carbsG,
        fatG: acc.fatG + item.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );
}

function calcProjected(items: DraftItem[], savedTotals: Macros): Macros {
  const draft = sumMacros(items);
  return {
    calories: savedTotals.calories + draft.calories,
    proteinG: savedTotals.proteinG + draft.proteinG,
    carbsG: savedTotals.carbsG + draft.carbsG,
    fatG: savedTotals.fatG + draft.fatG,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface DraftStoreState {
  /** Draft items being built during the current Kitchen Mode session. */
  items: DraftItem[];
  /**
   * Macro totals already saved before this session started
   * (fetched from dailyLogStore before entering Kitchen Mode).
   */
  savedTotals: Macros;
  /**
   * Live projected totals: savedTotals + normal draft items.
   * Updates in real-time as items are added / edited / removed.
   */
  projectedTotals: Macros;

  /** Initialise the store for a new session with the day's already-saved totals. */
  initSession: (savedTotals: Macros) => void;

  /** Apply a server WebSocket message to the draft state. */
  applyServerMessage: (msg: WSServerMessage) => void;

  /** Reset everything (called on session exit). */
  reset: () => void;
}

const ZERO_MACROS: Macros = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export const useDraftStore = create<DraftStoreState>((set, get) => ({
  items: [],
  savedTotals: ZERO_MACROS,
  projectedTotals: ZERO_MACROS,

  initSession: (savedTotals) => {
    set({ items: [], savedTotals, projectedTotals: { ...savedTotals } });
  },

  applyServerMessage: (msg) => {
    set((state) => {
      let items = [...state.items];

      switch (msg.type) {
        case 'items_added': {
          // Merge by id so we don't duplicate when server sends items_added
          // for an item we already have (e.g. after USDA confirm: choice → usda_pending → items_added).
          for (const incoming of msg.items) {
            const idx = items.findIndex((i) => i.id === incoming.id);
            if (idx >= 0) {
              items = [...items.slice(0, idx), { ...incoming }, ...items.slice(idx + 1)];
            } else {
              items = [...items, incoming];
            }
          }
          break;
        }

        case 'item_edited': {
          items = items.map((item) =>
            item.id === msg.itemId ? { ...item, ...msg.changes } : item,
          );
          break;
        }

        case 'item_removed': {
          items = items.filter((item) => item.id !== msg.itemId);
          break;
        }

        case 'clarify': {
          items = items.map((item) =>
            item.id === msg.itemId
              ? { ...item, state: 'clarifying' as const, clarifyQuestion: msg.question }
              : item,
          );
          break;
        }

        case 'create_food_prompt': {
          // Server couldn't find this food — add a "creating" placeholder card.
          const alreadyExists = items.some((i) => i.id === msg.itemId);
          if (!alreadyExists) {
            const now = new Date();
            const h = now.getHours();
            const mealLabel =
              h >= 5 && h < 11
                ? ('breakfast' as const)
                : h >= 11 && h < 14
                  ? ('lunch' as const)
                  : h >= 17 && h < 22
                    ? ('dinner' as const)
                    : ('snack' as const);
            items = [
              ...items,
              {
                id: msg.itemId,
                name: msg.foodName,
                quantity: 1,
                unit: 'servings',
                calories: 0,
                proteinG: 0,
                carbsG: 0,
                fatG: 0,
                source: 'CUSTOM' as const,
                mealLabel,
                state: 'creating' as const,
                creatingProgress: { currentField: 'confirm' as const },
              },
            ];
          }
          break;
        }

        case 'create_food_field': {
          items = items.map((item) => {
            if (item.id !== msg.itemId) return item;
            return {
              ...item,
              state: 'creating' as const,
              creatingProgress: {
                ...(item.creatingProgress ?? { currentField: 'confirm' as const }),
                currentField: msg.field,
              },
            };
          });
          break;
        }

        case 'create_food_complete': {
          items = items.map((item) =>
            item.id === msg.item.id ? { ...msg.item } : item,
          );
          break;
        }

        case 'food_choice': {
          const alreadyExists = items.some((i) => i.id === msg.itemId);
          if (!alreadyExists) {
            const now = new Date();
            const h = now.getHours();
            const mealLabel =
              h >= 5 && h < 11
                ? ('breakfast' as const)
                : h >= 11 && h < 14
                  ? ('lunch' as const)
                  : h >= 17 && h < 22
                    ? ('dinner' as const)
                    : ('snack' as const);
            items = [
              ...items,
              {
                id: msg.itemId,
                name: msg.foodName,
                quantity: 1,
                unit: 'servings',
                calories: 0,
                proteinG: 0,
                carbsG: 0,
                fatG: 0,
                source: 'CUSTOM' as const,
                mealLabel,
                state: 'choice' as const,
              },
            ];
          }
          break;
        }

        case 'usda_confirm': {
          const macros = msg.usdaResult.macros;
          items = items.map((item) => {
            if (item.id !== msg.itemId) return item;
            return {
              ...item,
              name: msg.usdaDescription,
              calories: macros.calories,
              proteinG: macros.proteinG,
              carbsG: macros.carbsG,
              fatG: macros.fatG,
              state: 'usda_pending' as const,
            };
          });
          break;
        }

        case 'draft_replaced': {
          items = [...msg.draft];
          break;
        }

        case 'operation_cancelled': {
          items = items.filter((item) => item.id !== msg.itemId);
          break;
        }

        default:
          break;
      }

      return {
        items,
        projectedTotals: calcProjected(items, state.savedTotals),
      };
    });
  },

  reset: () => {
    set({ items: [], savedTotals: ZERO_MACROS, projectedTotals: ZERO_MACROS });
  },
}));
