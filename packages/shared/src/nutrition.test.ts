import { describe, expect, it } from 'vitest';
import { dayTotals, dietInputSchema, dietIsReady, FOODS, foodById, isOffTarget, deviation, nutritionFor, optionTotals, proteinFirst, scaleContent, scaleFactor, type DietContent } from './nutrition.ts';

const FOOD = 'paneer';
const input = (over: object = {}) => ({
  calorieTarget: 2000,
  proteinTarget: 120,
  note: '',
  slots: [{ name: 'Breakfast', logsAs: 'breakfast', options: [{ name: 'A', note: '', ingredients: [{ foodId: FOOD, grams: 100, label: null, proteinSource: true }] }] }],
  ...over,
});
const ing = (kcal: number, proteinG: number, proteinSource = true) => ({ foodId: FOOD, name: 'F', grams: 100, label: null, proteinSource, kcal, proteinG, carbsG: 1, fatG: 1, fibreG: 1 });
const content = (slots: DietContent['slots']): DietContent => ({ calorieTarget: 2000, proteinTarget: 120, note: '', slots });

describe('diet input', () => {
  it('accepts a plan and a custom slot that logs as a known meal', () => {
    expect(dietInputSchema.safeParse(input()).success).toBe(true);
    expect(dietInputSchema.safeParse(input({ slots: [{ name: 'Pre-workout', logsAs: 'snack', options: [] }] })).success).toBe(true);
  });
  it.each([
    ['an unknown meal type', input({ slots: [{ name: 'X', logsAs: 'brunch', options: [] }] })],
    ['four options', input({ slots: [{ name: 'X', logsAs: 'lunch', options: Array(4).fill({ name: 'A', note: '', ingredients: [] }) }] })],
    ['two protein sources', input({ slots: [{ name: 'X', logsAs: 'lunch', options: [{ name: 'A', note: '', ingredients: [{ foodId: FOOD, grams: 10, label: null, proteinSource: true }, { foodId: FOOD, grams: 10, label: null, proteinSource: true }] }] }] })],
    ['nutrition sent by the app', input({ slots: [{ name: 'X', logsAs: 'lunch', options: [{ name: 'A', note: '', ingredients: [{ foodId: FOOD, grams: 10, label: null, proteinSource: true, kcal: 1 }] }] }] })],
    ['no slots', input({ slots: [] })],
    ['grams below 1', input({ slots: [{ name: 'X', logsAs: 'lunch', options: [{ name: 'A', note: '', ingredients: [{ foodId: FOOD, grams: 0.5, label: null, proteinSource: false }] }] }] })],
    ['a calorie target of 100', input({ calorieTarget: 100 })],
  ])('refuses %s', (_name, body) => {
    expect(dietInputSchema.safeParse(body).success).toBe(false);
  });
});

describe('totals and readiness', () => {
  const slots = [
    { name: 'B', logsAs: 'breakfast' as const, options: [{ name: '1', note: '', ingredients: [ing(400, 30), ing(100, 2, false)] }, { name: '2', note: '', ingredients: [ing(300, 20)] }] },
    { name: 'L', logsAs: 'lunch' as const, options: [{ name: '1', note: '', ingredients: [ing(600, 40)] }] },
  ];
  it('adds an option and the first option of each slot by default, or the chosen ones', () => {
    expect(optionTotals(slots[0]!.options[0]!)).toMatchObject({ kcal: 500, proteinG: 32 });
    expect(dayTotals(content(slots))).toMatchObject({ kcal: 1100, proteinG: 72 });
    expect(dayTotals(content(slots), [1, 0])).toMatchObject({ kcal: 900, proteinG: 60 });
  });
  it('warns only beyond 10% from the target', () => {
    expect(deviation(1100, 1000)).toBeCloseTo(0.1);
    expect(isOffTarget(deviation(1100, 1000))).toBe(false);
    expect(isOffTarget(deviation(1101, 1000))).toBe(true);
    expect(isOffTarget(deviation(900, null))).toBe(false);
  });
  it('is ready only with an option in every slot and exactly one protein source in every option', () => {
    expect(dietIsReady(content(slots))).toBe(true);
    expect(dietIsReady(content([{ name: 'B', logsAs: 'breakfast', options: [] }]))).toBe(false);
    expect(dietIsReady(content([{ name: 'B', logsAs: 'breakfast', options: [{ name: '1', note: '', ingredients: [ing(100, 2, false)] }] }]))).toBe(false);
    expect(dietIsReady(content([{ name: 'B', logsAs: 'breakfast', options: [{ name: '1', note: '', ingredients: [] }] }]))).toBe(false);
  });
  it('puts the protein source first and keeps the rest in order', () => {
    expect(proteinFirst([{ proteinSource: false, n: 1 }, { proteinSource: true, n: 2 }, { proteinSource: false, n: 3 }]).map((x) => x.n)).toEqual([2, 1, 3]);
  });
});

describe('the fixed food list', () => {
  it('has ten foods with unique ids, and works nutrition out per 100 g', () => {
    expect(FOODS).toHaveLength(10);
    expect(new Set(FOODS.map((food) => food.id)).size).toBe(10);
    expect(nutritionFor(foodById('wheat-roti')!, 80)).toEqual({ kcal: 237.6, proteinG: 8.8, carbsG: 40, fatG: 3.2, fibreG: 2.4 });
    expect(dietInputSchema.safeParse(input({ slots: [{ name: 'X', logsAs: 'lunch', options: [{ name: 'A', note: '', ingredients: [{ foodId: 'not-a-food', grams: 10, label: null, proteinSource: false }] }] }] })).success).toBe(false);
  });
});

describe('scaling to a calorie target', () => {
  const paneer = foodById('paneer')!;
  const roti = foodById('wheat-roti')!;
  const make = (g1: number, g2: number): DietContent =>
    content([
      { name: 'B', logsAs: 'breakfast', options: [{ name: '1', note: '', ingredients: [{ foodId: 'paneer', name: 'Paneer', grams: g1, label: null, proteinSource: true, ...nutritionFor(paneer, g1) }, { foodId: 'wheat-roti', name: 'Wheat roti', grams: g2, label: null, proteinSource: false, ...nutritionFor(roti, g2) }] }] },
    ]);
  it('works out the factor from the day total, and has none without a target or a total', () => {
    const c = make(100, 80); // 265 + 237.6 = 502.6 kcal
    expect(scaleFactor(c, 1005.2)).toBeCloseTo(2);
    expect(scaleFactor(c, null)).toBeNull();
    expect(scaleFactor(content([]), 2000)).toBeNull();
  });
  it('scales to whole grams within 1 to 5000, works the nutrition out again, and lands near the target', () => {
    const c = make(100, 80);
    const scaled = scaleContent(c, 2);
    expect(scaled.slots[0]!.options[0]!.ingredients.map((i) => i.grams)).toEqual([200, 160]);
    expect(scaled.slots[0]!.options[0]!.ingredients[0]).toMatchObject({ kcal: 530, proteinG: 36.6 });
    expect(Math.abs(dayTotals(scaleContent(c, scaleFactor(c, 2100)!)).kcal - 2100) / 2100).toBeLessThan(0.02);
    expect(scaleContent(make(1, 1), 0.01).slots[0]!.options[0]!.ingredients.map((i) => i.grams)).toEqual([1, 1]);
    expect(scaleContent(make(4000, 4000), 5).slots[0]!.options[0]!.ingredients.map((i) => i.grams)).toEqual([5000, 5000]);
    expect(c.slots[0]!.options[0]!.ingredients[0]!.grams).toBe(100); // the original is untouched
  });
});
