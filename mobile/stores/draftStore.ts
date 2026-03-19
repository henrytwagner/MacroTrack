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
          items = items.map((item) => {
            if (item.id !== msg.itemId) return item;
            const updated = { ...item, ...msg.changes };
            // Clear isAssumed if the user explicitly changed quantity or unit
            if ('quantity' in msg.changes || 'unit' in msg.changes) {
              updated.isAssumed = false;
            }
            return updated;
          });
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
                ...(msg.collectedValues ?? {}),
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

        case 'create_food_confirm': {
          items = items.map((item) => {
            if (item.id !== msg.itemId) return item;
            return {
              ...item,
              state: 'confirming' as const,
              creatingProgress: { ...msg.collectedValues, currentField: 'complete' as const },
              initialQuantity: msg.initialQuantity,
              initialUnit: msg.initialUnit,
              confirmingData: {
                quantityMismatch: msg.quantityMismatch,
                collectedValues: msg.collectedValues,
              },
            };
          });
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

        // Phase 2 — Disambiguation
        case 'disambiguate': {
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
                source: 'DATABASE' as const,
                mealLabel,
                state: 'disambiguate' as const,
                disambiguationOptions: msg.options,
              },
            ];
          }
          break;
        }

        // Phase 3 — Confirm clear
        case 'confirm_clear': {
          // No draft item added — this is a UI-level card tracked separately
          // The server manages the state; mobile just shows a global banner/card.
          // We add a sentinel item so the card renders in the list.
          const clearId = `confirm-clear-${Date.now()}`;
          const alreadyHasClear = items.some((i) => i.state === 'confirm_clear');
          if (!alreadyHasClear) {
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
                id: clearId,
                name: 'Clear all items?',
                quantity: 0,
                unit: '',
                calories: 0,
                proteinG: 0,
                carbsG: 0,
                fatG: 0,
                source: 'CUSTOM' as const,
                mealLabel,
                state: 'confirm_clear' as const,
                clarifyQuestion: msg.question,
              },
            ];
          }
          break;
        }

        // Phase 3 — Community submit prompt
        case 'community_submit_prompt': {
          items = items.map((item) =>
            item.id === msg.itemId
              ? { ...item, state: 'community_submit_prompt' as const, clarifyQuestion: msg.question }
              : item,
          );
          break;
        }

        // Phase 4 — History results
        case 'history_results': {
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
                name: `${msg.dateLabel} log`,
                quantity: 0,
                unit: '',
                calories: msg.totals.calories,
                proteinG: msg.totals.proteinG,
                carbsG: msg.totals.carbsG,
                fatG: msg.totals.fatG,
                source: 'DATABASE' as const,
                mealLabel,
                state: 'history_results' as const,
                historyData: {
                  dateLabel: msg.dateLabel,
                  entries: msg.entries,
                  totals: msg.totals,
                  addedToDraft: msg.addedToDraft,
                },
              },
            ];
          }
          break;
        }

        // Phase 5 — Macro summary
        case 'macro_summary': {
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
                name: 'Macro Summary',
                quantity: 0,
                unit: '',
                calories: msg.summary.calories,
                proteinG: msg.summary.proteinG,
                carbsG: msg.summary.carbsG,
                fatG: msg.summary.fatG,
                source: 'DATABASE' as const,
                mealLabel,
                state: 'macro_summary' as const,
              },
            ];
          }
          break;
        }

        // Phase 5 — Food info
        case 'food_info': {
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
                quantity: msg.usdaResult.servingSize ?? 1,
                unit: msg.usdaResult.servingSizeUnit ?? 'g',
                calories: msg.usdaResult.macros.calories,
                proteinG: msg.usdaResult.macros.proteinG,
                carbsG: msg.usdaResult.macros.carbsG,
                fatG: msg.usdaResult.macros.fatG,
                source: 'DATABASE' as const,
                usdaFdcId: msg.usdaResult.fdcId,
                mealLabel,
                state: 'food_info' as const,
              },
            ];
          }
          break;
        }

        // Phase 5 — Food suggestions
        case 'food_suggestions': {
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
                name: 'Food Suggestions',
                quantity: 0,
                unit: '',
                calories: 0,
                proteinG: 0,
                carbsG: 0,
                fatG: 0,
                source: 'DATABASE' as const,
                mealLabel,
                state: 'food_suggestions' as const,
              },
            ];
          }
          break;
        }

        // Phase 6 — Estimate card
        case 'estimate_card': {
          const alreadyExists = items.some((i) => i.id === msg.item.id);
          if (!alreadyExists) {
            items = [...items, { ...msg.item }];
          }
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
