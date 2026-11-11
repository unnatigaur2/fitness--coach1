// The editor for a diet's content, used by templates and plans (CF07, docs/design/CF07-nutrition-management-ui.md
// §2.2 to §2.5): targets, a note, meal slots (a custom slot "logs as" one of the four app meals), options
// with ingredients from the FitSphere food list, the protein source first, and live totals against the
// targets. The server checks and fills in everything again; this only helps the coach build.
import { dayTotals, DIET_DISCLAIMER, FOODS, MAX_INGREDIENTS, MAX_OPTIONS, MAX_SLOTS, MEAL_TYPES, optionTotals, type DietContent, type DietOption, type DietSlot, type Food, type Nutrition } from '@fitsphere-coach/shared';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, Field, Icon, PrimaryButton, SecondaryButton, textStyles } from '../components/ui';
import { fonts, radius, useTheme } from '../theme';
import { ActionLink, Card, Chip, NumField, SectionLabel } from '../workouts/parts';
import { deviationText, DIET_TEXTS, ingredientFrom, ingredientSummary, MEAL_LABELS, newOption, numText, offTarget, totalsText, withGrams, withProteinSource } from './texts';

type Props = { content: DietContent; onChange: (content: DietContent) => void; disabled?: boolean };
type Editing = { slot: number; option: number } | null;

export function DietEditor({ content, onChange, disabled }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<number | null>(0);
  const [editing, setEditing] = useState<Editing>(null);

  const setSlot = (index: number, slot: DietSlot) => onChange({ ...content, slots: content.slots.map((existing, i) => (i === index ? slot : existing)) });
  const total = dayTotals(content);
  const hasOptions = content.slots.some((slot) => slot.options.length > 0);
  const calorieOff = offTarget(total.kcal, content.calorieTarget);
  const proteinOff = offTarget(total.proteinG, content.proteinTarget);

  const slot = editing ? content.slots[editing.slot] : undefined;
  const option = slot && editing ? slot.options[editing.option] : undefined;

  return (
    <View pointerEvents={disabled ? 'none' : 'auto'} style={{ opacity: disabled ? 0.6 : 1 }}>
      <SectionLabel>Targets for this plan</SectionLabel>
      <View style={styles.pair}>
        <NumField label="Calories" suffix="kcal" value={content.calorieTarget} min={500} max={10000} onChange={(calorieTarget) => onChange({ ...content, calorieTarget })} />
        <NumField label="Protein" suffix="g" value={content.proteinTarget} min={10} max={500} onChange={(proteinTarget) => onChange({ ...content, proteinTarget })} />
      </View>

      {hasOptions ? (
        <>
          <SectionLabel>Day total · option 1 of each slot</SectionLabel>
          <Totals totals={total} />
          <View style={{ marginTop: 8, gap: 8 }}>
            {content.calorieTarget !== null ? <Text style={[textStyles.small, { color: calorieOff ? colors.warning : colors.inkMuted }]}>Calories {deviationText(total.kcal, content.calorieTarget)} (target {content.calorieTarget})</Text> : null}
            {content.proteinTarget !== null ? <Text style={[textStyles.small, { color: proteinOff ? colors.warning : colors.inkMuted }]}>Protein {deviationText(total.proteinG, content.proteinTarget)} (target {content.proteinTarget} g)</Text> : null}
            {calorieOff || proteinOff ? <Banner kind="info">{DIET_TEXTS.offTargetBanner}</Banner> : null}
          </View>
        </>
      ) : null}

      <SectionLabel>Meal slots</SectionLabel>
      <Text style={[textStyles.small, { color: colors.inkMuted, marginBottom: 8 }]}>{DIET_TEXTS.slotInfo}</Text>
      <View style={{ gap: 8 }}>
        {content.slots.map((slotItem, index) => {
          const expanded = open === index;
          return (
            <Card key={index}>
              <Pressable onPress={() => setOpen(expanded ? null : index)} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${slotItem.name}, logs as ${MEAL_LABELS[slotItem.logsAs]}, ${slotItem.options.length} options`} style={styles.slotHead}>
                <View style={[styles.slotIcon, { backgroundColor: colors.accentTint }]}>
                  <Icon name="coffee" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[textStyles.listTitle, { color: colors.ink }]}>{slotItem.name}</Text>
                  <Text style={[textStyles.small, { color: colors.inkMuted }]}>
                    Logs as {MEAL_LABELS[slotItem.logsAs]} · {slotItem.options.length} {slotItem.options.length === 1 ? 'option' : 'options'}
                  </Text>
                </View>
                <Icon name={expanded ? 'chevron-down' : 'chevron-right'} color={colors.inkSubtle} />
              </Pressable>
              {expanded ? (
                <View style={[styles.slotBody, { borderTopColor: colors.border }]}>
                  <Field label="Slot name" value={slotItem.name} maxLength={30} onChangeText={(name) => setSlot(index, { ...slotItem, name })} />
                  <View style={{ gap: 6 }}>
                    <Text style={[textStyles.label, { color: colors.inkMuted }]}>LOGS AS</Text>
                    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Logs as">
                      {MEAL_TYPES.map((type) => (
                        <Chip key={type} label={MEAL_LABELS[type]} selected={slotItem.logsAs === type} onPress={() => setSlot(index, { ...slotItem, logsAs: type })} />
                      ))}
                    </View>
                  </View>
                  {slotItem.options.map((optionItem, i) => (
                    <Pressable key={i} onPress={() => setEditing({ slot: index, option: i })} accessibilityRole="button" accessibilityLabel={`${slotItem.name} option ${i + 1}, ${optionItem.name}`} style={[styles.optionRow, { borderTopColor: colors.border }]}>
                      <Text style={[styles.optionNumber, { color: colors.accent }]}>{i + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[textStyles.listTitle, { color: colors.ink }]}>{optionItem.name}</Text>
                        <Text style={[textStyles.small, { color: colors.inkMuted }]}>{optionItem.ingredients.length === 0 ? 'No ingredients yet' : totalsText(optionTotals(optionItem))}</Text>
                      </View>
                      <Icon name="chevron-right" color={colors.inkSubtle} />
                    </Pressable>
                  ))}
                  <View style={styles.slotActions}>
                    <ActionLink
                      icon="plus"
                      label={`Add option (${MAX_OPTIONS} max)`}
                      disabled={slotItem.options.length >= MAX_OPTIONS}
                      onPress={() => {
                        setSlot(index, { ...slotItem, options: [...slotItem.options, newOption(slotItem.options.length + 1)] });
                        setEditing({ slot: index, option: slotItem.options.length });
                      }}
                    />
                    <ActionLink
                      icon="trash-2"
                      label="Remove slot"
                      tone="danger"
                      disabled={content.slots.length <= 1}
                      onPress={() => {
                        onChange({ ...content, slots: content.slots.filter((_, j) => j !== index) });
                        setOpen(null);
                      }}
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>
      <View style={{ marginTop: 10 }}>
        <ActionLink
          icon="plus"
          label="Add slot"
          disabled={content.slots.length >= MAX_SLOTS}
          onPress={() => {
            onChange({ ...content, slots: [...content.slots, { name: 'Custom', logsAs: 'snack', options: [] }] });
            setOpen(content.slots.length);
          }}
        />
      </View>

      <View style={{ marginTop: 16 }}>
        <Field label="Note for the client" value={content.note} maxLength={300} onChangeText={(note) => onChange({ ...content, note })} placeholder="Swap rice for roti on rest days" />
      </View>
      <Text style={[textStyles.small, { color: colors.inkSubtle, marginTop: 12 }]}>{DIET_DISCLAIMER}</Text>

      <OptionModal
        visible={editing !== null && option !== undefined}
        slotName={slot?.name ?? ''}
        option={option ?? newOption(1)}
        onChange={(next) => editing && slot && setSlot(editing.slot, { ...slot, options: slot.options.map((existing, i) => (i === editing.option ? next : existing)) })}
        onRemove={() => {
          if (editing && slot) setSlot(editing.slot, { ...slot, options: slot.options.filter((_, i) => i !== editing.option) });
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

function Totals({ totals }: { totals: Nutrition }) {
  const { colors } = useTheme();
  const cells: [string, string][] = [
    [numText(totals.kcal), 'kcal'],
    [`${numText(totals.proteinG)} g`, 'protein'],
    [`${numText(totals.carbsG)} g`, 'carbs'],
    [`${numText(totals.fatG)} g`, 'fat'],
    [`${numText(totals.fibreG)} g`, 'fibre'],
  ];
  return (
    <View accessibilityLabel={`Totals: ${totalsText(totals)}`} style={[styles.totals, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {cells.map(([value, label]) => (
        <View key={label} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.totalValue, { color: colors.ink }]}>{value}</Text>
          <Text style={[textStyles.small, { color: colors.inkMuted }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}
export { Totals };

/** One option: its name, ingredients (protein source first), quantities and a note. */
function OptionModal({ visible, slotName, option, onChange, onRemove, onClose }: { visible: boolean; slotName: string; option: DietOption; onChange: (option: DietOption) => void; onRemove: () => void; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [adding, setAdding] = useState(false);
  const [openIngredient, setOpenIngredient] = useState<number | null>(null);
  const hasProtein = option.ingredients.some((ingredient) => ingredient.proteinSource);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={`Back to ${slotName}`} style={styles.back}>
            <Icon name="chevron-left" size={26} color={colors.ink} />
            <Text style={[textStyles.label, { color: colors.inkMuted, fontSize: 15 }]}>{slotName.toUpperCase()}</Text>
          </Pressable>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{option.name.toUpperCase()}</Text>
          <View style={{ marginTop: 16 }}>
            <Field label="Option name" value={option.name} maxLength={60} onChangeText={(name) => onChange({ ...option, name })} />
          </View>
          <SectionLabel>Totals for this option</SectionLabel>
          <Totals totals={optionTotals(option)} />

          <SectionLabel>Ingredients · protein source first</SectionLabel>
          {option.ingredients.length > 0 && !hasProtein ? <Banner kind="info">{DIET_TEXTS.proteinInfo}</Banner> : null}
          <Card style={{ marginTop: 8 }}>
            {option.ingredients.length === 0 ? <Text style={[textStyles.body, { color: colors.inkMuted, padding: 14 }]}>No ingredients yet. Add the protein source first.</Text> : null}
            {option.ingredients.map((ingredient, i) => {
              const expanded = openIngredient === i;
              return (
                <View key={`${i}-${ingredient.foodId}`} style={i === 0 ? undefined : { borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Pressable onPress={() => setOpenIngredient(expanded ? null : i)} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${ingredient.name}, ${ingredientSummary(ingredient)}`} style={styles.ingredientHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={[textStyles.listTitle, { color: colors.ink }]}>{ingredient.name}</Text>
                      <Text style={[textStyles.small, { color: colors.inkMuted }]}>
                        {ingredientSummary(ingredient)}{ingredient.proteinSource ? ' · Protein source' : ''}
                      </Text>
                    </View>
                    <Text style={[textStyles.small, { color: colors.inkMuted }]}>{numText(ingredient.kcal)} kcal</Text>
                  </Pressable>
                  {expanded ? (
                    <View style={{ gap: 10, paddingHorizontal: 14, paddingBottom: 12 }}>
                      <View style={styles.pair}>
                        <NumField label="Amount" suffix="g" decimal value={ingredient.grams} min={1} max={5000} onChange={(grams) => grams !== null && onChange({ ...option, ingredients: option.ingredients.map((x, j) => (j === i ? withGrams(x, grams) : x)) })} />
                      </View>
                      <View style={styles.chips}>
                        <ActionLink
                          icon={ingredient.proteinSource ? 'check-square' : 'square'}
                          label="Protein source"
                          onPress={() => {
                            onChange({ ...option, ingredients: withProteinSource(option.ingredients, i, !ingredient.proteinSource) });
                            setOpenIngredient(null);
                          }}
                        />
                        <ActionLink icon="trash-2" label="Remove" tone="danger" onPress={() => onChange({ ...option, ingredients: option.ingredients.filter((_, j) => j !== i) })} />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
            <View style={{ borderTopWidth: option.ingredients.length === 0 ? 0 : 1, borderTopColor: colors.border, padding: 12 }}>
              <ActionLink icon="plus" label="Add ingredient" disabled={option.ingredients.length >= MAX_INGREDIENTS} onPress={() => setAdding(true)} />
            </View>
          </Card>

          <View style={{ marginTop: 16 }}>
            <Field label="Note for the client" value={option.note} maxLength={200} onChangeText={(note) => onChange({ ...option, note })} placeholder="Use 1 tsp oil" />
          </View>
          <Text style={[textStyles.small, { color: colors.inkSubtle, marginTop: 12 }]}>{DIET_DISCLAIMER}</Text>
          <View style={{ marginTop: 20, gap: 10 }}>
            <PrimaryButton label="Done" onPress={onClose} />
            <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel="Remove option" style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 16, letterSpacing: 1, color: colors.danger }}>REMOVE OPTION</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      <FoodPicker
        visible={adding}
        onClose={() => setAdding(false)}
        onAdd={(food, grams, label) => {
          // The first ingredient of an option starts as its protein source; the coach can change that.
          const next = ingredientFrom(food, grams, label, !hasProtein && food.per100g.proteinG >= 10);
          onChange({ ...option, ingredients: next.proteinSource ? withProteinSource([...option.ingredients, next], option.ingredients.length, true) : [...option.ingredients, next] });
          setAdding(false);
        }}
      />
    </Modal>
  );
}

/** The ten fixed foods, filtered by what is typed, then how much (grams or one of the food's servings). */
function FoodPicker({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (food: Food, grams: number, label: string | null) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Food | null>(null);
  const [grams, setGrams] = useState<number | null>(100);
  const [label, setLabel] = useState<string | null>(null);
  const foods = FOODS.filter((food) => food.name.toLowerCase().includes(search.trim().toLowerCase()));

  function close() {
    setPicked(null);
    setSearch('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close food list" style={styles.back}>
            <Icon name="chevron-left" size={26} color={colors.ink} />
            <Text style={[textStyles.label, { color: colors.inkMuted, fontSize: 15 }]}>OPTION</Text>
          </Pressable>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>ADD INGREDIENT</Text>
          <Text style={[textStyles.body, { color: colors.inkMuted, marginTop: 6 }]}>{DIET_TEXTS.foodInfo}</Text>
          <View style={{ marginTop: 16 }}>
            <Field label="Search foods" value={search} onChangeText={setSearch} placeholder="Search foods" autoCapitalize="none" autoCorrect={false} />
          </View>
          {foods.length === 0 ? <Text style={[textStyles.body, { color: colors.inkMuted, textAlign: 'center', marginTop: 24 }]}>No foods match.</Text> : null}
          <View style={{ marginTop: 16, gap: 8 }}>
            {foods.map((food) => {
              const on = picked?.id === food.id;
              return (
                <Pressable
                  key={food.id}
                  onPress={() => {
                    setPicked(food);
                    setGrams(100);
                    setLabel(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={food.name}
                  style={[styles.foodRow, { backgroundColor: colors.surface, borderColor: on ? colors.accent : colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[textStyles.listTitle, { color: colors.ink }]}>{food.name}</Text>
                    <Text style={[textStyles.small, { color: colors.inkMuted }]}>
                      {food.group} · per 100 g · {numText(food.per100g.kcal)} kcal · {numText(food.per100g.proteinG)} g protein
                    </Text>
                  </View>
                  {on ? <Icon name="check" color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
          {picked ? (
            <View style={{ marginTop: 18, gap: 12 }}>
              <Text style={[textStyles.label, { color: colors.inkMuted }]}>{`QUANTITY OF ${picked.name.toUpperCase()}`}</Text>
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Serving">
                <Chip label="Grams" selected={label === null} onPress={() => setLabel(null)} />
                {picked.portions.map((portion) => (
                  <Chip
                    key={portion.label}
                    label={`${portion.label} · ${numText(portion.grams)} g`}
                    selected={label === portion.label}
                    onPress={() => {
                      setLabel(portion.label);
                      setGrams(portion.grams);
                    }}
                  />
                ))}
              </View>
              <View style={styles.pair}>
                <NumField key={`${picked.id}-${label}`} label="Amount" suffix="g" decimal value={grams} min={1} max={5000} onChange={setGrams} />
              </View>
            </View>
          ) : null}
        </ScrollView>
        <View style={{ padding: 16, paddingBottom: insets.bottom + 16, gap: 10 }}>
          <PrimaryButton label={picked ? `Add ${picked.name}` : 'Pick a food'} disabled={!picked || grams === null} onPress={() => picked && grams !== null && onAdd(picked, grams, label)} />
          <SecondaryButton label="Cancel" onPress={close} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  slotHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 64 },
  slotIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  slotBody: { borderTopWidth: 1, padding: 14, gap: 12 },
  slotActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 12, minHeight: 56 },
  optionNumber: { width: 20, fontFamily: fonts.display, fontSize: 14, letterSpacing: 1 },
  totals: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 6 },
  totalValue: { fontFamily: fonts.display, fontSize: 18 },
  back: { height: 44, marginLeft: -6, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 36, marginTop: 8 },
  ingredientHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, minHeight: 56 },
  foodRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 14, minHeight: 60 },
});
