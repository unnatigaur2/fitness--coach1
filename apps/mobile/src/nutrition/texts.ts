// Texts and small helpers for nutrition management (docs/design/CF07-nutrition-management-ui.md).
import {
  deviation,
  isOffTarget,
  proteinFirst,
  type DietContent,
  type DietIngredient,
  type DietInput,
  type DietOption,
  type Food,
  nutritionFor,
  type MealType,
  type Nutrition,
} from '@fitsphere-coach/shared';

export const DIET_GOAL_LABELS = { weight_loss: 'Weight loss', muscle_gain: 'Muscle gain', maintenance: 'Maintenance', general_fitness: 'General fitness' } as const;
export const MEAL_LABELS: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

const round1 = (value: number) => Math.round(value * 10) / 10;
/** 237.6 → "237.6", 265 → "265" */
export const numText = (value: number): string => String(round1(value));

export function newDietContent(): DietContent {
  return {
    calorieTarget: null,
    proteinTarget: null,
    note: '',
    slots: (['breakfast', 'lunch', 'snack', 'dinner'] as const).map((type) => ({ name: MEAL_LABELS[type], logsAs: type, options: [] })),
  };
}

export const newOption = (number: number): DietOption => ({ name: `Option ${number}`, note: '', ingredients: [] });

/** The ingredient for `grams` of a food, with its nutrition worked out the way the server does. */
export function ingredientFrom(food: Food, grams: number, label: string | null, proteinSource: boolean): DietIngredient {
  return { foodId: food.id, name: food.name, grams, label, proteinSource, ...nutritionFor(food, grams) };
}

/** Changes the grams of a stored ingredient, keeping its nutrition in step with the old quantity. */
export function withGrams(ingredient: DietIngredient, grams: number): DietIngredient {
  const scale = ingredient.grams > 0 ? grams / ingredient.grams : 0;
  return {
    ...ingredient,
    grams,
    kcal: round1(ingredient.kcal * scale),
    proteinG: round1(ingredient.proteinG * scale),
    carbsG: round1(ingredient.carbsG * scale),
    fatG: round1(ingredient.fatG * scale),
    fibreG: round1(ingredient.fibreG * scale),
  };
}

/** Marks one ingredient as the protein source (or none), and keeps it first. */
export function withProteinSource(ingredients: readonly DietIngredient[], index: number, on: boolean): DietIngredient[] {
  return proteinFirst(ingredients.map((ingredient, i) => ({ ...ingredient, proteinSource: on ? i === index : false })));
}

/** What the app sends: the server fills in names and nutrition itself. */
export function toInput(content: DietContent): DietInput {
  return {
    calorieTarget: content.calorieTarget,
    proteinTarget: content.proteinTarget,
    note: content.note,
    slots: content.slots.map((slot) => ({
      name: slot.name,
      logsAs: slot.logsAs,
      options: slot.options.map((option) => ({
        name: option.name,
        note: option.note,
        ingredients: option.ingredients.map((ingredient) => ({ foodId: ingredient.foodId, grams: ingredient.grams, label: ingredient.label, proteinSource: ingredient.proteinSource })),
      })),
    })),
  };
}

export const ingredientSummary = (ingredient: DietIngredient): string =>
  `${ingredient.label ? `${ingredient.label} · ` : ''}${numText(ingredient.grams)} g`;

export const totalsText = (totals: Nutrition): string => `${numText(totals.kcal)} kcal · ${numText(totals.proteinG)} g protein`;

/** "2% over", "13% under", "on target" */
export function deviationText(actual: number, target: number | null): string {
  const value = deviation(actual, target);
  if (value === null) return 'no target';
  const percent = Math.round(Math.abs(value) * 100);
  return percent === 0 ? 'on target' : `${percent}% ${value > 0 ? 'over' : 'under'}`;
}
export const offTarget = (actual: number, target: number | null): boolean => isOffTarget(deviation(actual, target));

export const DIET_TEXTS = {
  templatesSub: 'Gym templates are shared with every coach. Your own templates are only yours.',
  plansSub: 'Diet plans of your clients. Coaches see only their own clients.',
  emptyTemplatesSub: 'Make a template once, then give a copy to each client.',
  emptyPlansSub: 'Open a template and tap Assign plan to make a draft for a client.',
  noMatch: 'Nothing matches.',
  invalid: 'Some values are not valid. Check the quantities and that each option has at most one protein source.',
  notReady: 'Every slot needs an option, and every option needs ingredients with exactly one protein source, before publishing.',
  assignInfo: 'Each client gets their own draft to review. Nothing goes live until you publish. Later edits to the template never change these drafts.',
  scaleTitle: "Scale to each client's calories",
  scaleOn: "Quantities are scaled so option 1 of each slot adds up to the client's calorie target, and the plan takes their targets. A client with no calorie target gets the template as it is.",
  scaleOff: 'Quantities are copied as they are.',
  replaceInfo: (name: string) => `${name} already has an active plan. When you publish the new one, it replaces the old one.`,
  draftBanner: (version: number, name: string) => `Draft, version ${version}. ${name} can't see this yet.`,
  unpublishedBanner: (live: number, name: string) => `You have changes that are not published. ${name} still sees version ${live}.`,
  liveBanner: (name: string) => `${name} sees this plan in their Diet plan tab.`,
  endedBanner: 'This plan has ended. It can no longer be changed.',
  publishWaits: 'Publishing waits for the FitSphere app update. Your draft is saved.',
  publishBody: (name: string) => `${name} sees this plan in their Diet plan tab straight away. It replaces any plan they have now. Meals they already logged keep the plan they followed.`,
  endBody: (name: string) => `${name}'s Diet plan tab goes back to their own logging. Their history stays.`,
  discardBody: 'Your unpublished changes will be thrown away. The client keeps the live version.',
  offTargetBanner: 'More than 10% off target. This is a warning, not a block.',
  slotInfo: 'A custom slot logs as one of the four meals the FitSphere app knows, so a planned meal logs cleanly.',
  proteinInfo: 'Mark exactly one ingredient as the protein source. It is always shown first.',
  foodInfo: 'Ten foods for now. More will be added later.',
} as const;
