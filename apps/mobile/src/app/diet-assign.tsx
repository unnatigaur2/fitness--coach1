// Assign a diet template to clients (CF07, docs/design/CF07-nutrition-management-ui.md §2.6): each client gets
// their own draft copy. Nothing goes live until the coach publishes it.
import type { ClientSummary, DietTemplateDetail } from '@fitsphere-coach/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccount } from '../account/AccountProvider';
import { useAuth } from '../auth/AuthProvider';
import { TEXTS } from '../auth/texts';
import { loadClients } from '../clients/service';
import { coachLabel } from '../clients/texts';
import { Banner, Icon, PrimaryButton, PushedLayout, textStyles } from '../components/ui';
import { assignDietPlans, loadDietPlans, loadDietTemplate } from '../nutrition/service';
import { DIET_GOAL_LABELS, DIET_TEXTS } from '../nutrition/texts';
import { Card, DateStepper, SectionLabel, SwitchRow, Tag } from '../workouts/parts';
import { addDays, failureText, todayIst } from '../workouts/texts';
import { fonts, radius, useTheme } from '../theme';

export default function WorkoutAssign() {
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();
  const { deps } = useAuth();
  const { state } = useAccount();
  const router = useRouter();
  const { colors } = useTheme();
  const [template, setTemplate] = useState<DietTemplateDetail | null>(null);
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [withDraft, setWithDraft] = useState<Set<string>>(new Set());
  const [withActive, setWithActive] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string[]>([]);
  const [scale, setScale] = useState(true);
  const [startDate, setStartDate] = useState(() => addDays(todayIst(), 1));
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const myId = state?.kind === 'coach' ? state.me.user.id : null;

  useEffect(() => {
    if (!templateId) return;
    let current = true;
    void (async () => {
      const [t, list, plans] = await Promise.all([loadDietTemplate(deps, templateId), loadClients(deps), loadDietPlans(deps)]);
      if (!current) return;
      const failure = [t.kind, list.kind, plans.kind].find((kind) => kind !== 'ok');
      if (failure) {
        if (failure === 'signedOut') router.replace('/sign-in?expired=1');
        else setProblem(failureText(failure === 'notFound' || failure === 'offline' ? failure : 'unavailable', TEXTS));
        return;
      }
      if (t.kind === 'ok') setTemplate(t.body);
      if (list.kind === 'ok') setClients(list.body.clients);
      if (plans.kind === 'ok') {
        setWithDraft(new Set(plans.body.plans.filter((p) => p.status === 'draft').map((p) => p.traineeId)));
        setWithActive(new Set(plans.body.plans.filter((p) => p.status === 'active').map((p) => p.traineeId)));
      }
    })();
    return () => {
      current = false;
    };
  }, [deps, templateId, router]);

  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
  const replacing = (clients ?? []).filter((c) => picked.includes(c.id) && withActive.has(c.id));

  async function create() {
    if (!templateId) return;
    setWorking(true);
    setProblem(null);
    const result = await assignDietPlans(deps, templateId, picked, startDate, scale);
    setWorking(false);
    if (result.kind === 'ok') {
      router.replace('/nutrition?tab=plans' as never);
    } else if (result.kind === 'signedOut') {
      router.replace('/sign-in?expired=1');
    } else {
      setProblem(failureText(result.kind, TEXTS));
    }
  }

  return (
    <PushedLayout backLabel="Template" onBack={() => (router.canGoBack() ? router.back() : router.replace('/nutrition'))} title="Assign plan">
      <Text style={[styles.sub, { color: colors.inkMuted }]}>Each client gets their own draft to review. Nothing goes live until you publish.</Text>
      {problem ? (
        <View style={{ marginTop: 16 }}>
          <Banner kind="error">{problem}</Banner>
        </View>
      ) : null}
      {!template && !problem ? (
        <View style={{ marginTop: 40 }}>
          <ActivityIndicator color={colors.accent} accessibilityLabel="Loading" />
        </View>
      ) : null}

      {template ? (
        <>
          <Card style={{ marginTop: 16 }}>
            <View style={styles.templateRow}>
              <View style={{ flex: 1 }}>
                <Text style={[textStyles.listTitle, { color: colors.ink }]}>{template.name}</Text>
                <Text style={[textStyles.small, { color: colors.inkMuted }]}>
                  {DIET_GOAL_LABELS[template.goal]}{template.content.calorieTarget ? ` · ${template.content.calorieTarget} kcal` : ''} · {template.content.slots.length} slots
                </Text>
              </View>
              <Tag label={template.visibility === 'gym' ? 'Gym' : 'Mine'} tone={template.visibility === 'gym' ? 'accent' : 'plain'} />
            </View>
          </Card>

          <SectionLabel>Clients</SectionLabel>
          {clients && clients.length === 0 ? <Text style={[textStyles.body, { color: colors.inkMuted }]}>You have no clients yet. Add a client first.</Text> : null}
          <View style={{ gap: 8 }}>
            {clients?.map((client) => {
              const on = picked.includes(client.id);
              const blocked = withDraft.has(client.id);
              return (
                <Pressable
                  key={client.id}
                  onPress={() => toggle(client.id)}
                  disabled={blocked}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: blocked }}
                  accessibilityLabel={client.name}
                  style={[styles.row, { backgroundColor: colors.surface, borderColor: on ? colors.accent : colors.border, opacity: blocked ? 0.5 : 1 }]}
                >
                  <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.initial, { color: colors.onPrimary }]}>{client.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[textStyles.listTitle, { color: colors.ink }]}>{client.name}</Text>
                    <Text numberOfLines={1} style={[textStyles.small, { color: colors.inkMuted }]}>
                      {blocked ? 'Draft already exists' : withActive.has(client.id) ? 'Has an active plan' : 'No plan yet'} · {coachLabel(client.coachId, client.coachName, myId)}
                    </Text>
                  </View>
                  <View style={[styles.box, on ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.border }]}>{on ? <Icon name="check" size={18} color={colors.onPrimary} /> : null}</View>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: 18, gap: 16 }}>
            <DateStepper label="Start date" value={startDate} onChange={setStartDate} />
            {replacing.map((client) => (
              <Banner key={client.id} kind="info">{DIET_TEXTS.replaceInfo(client.name)}</Banner>
            ))}
            <Card>
              <SwitchRow title={DIET_TEXTS.scaleTitle} sub={scale ? DIET_TEXTS.scaleOn : DIET_TEXTS.scaleOff} value={scale} onChange={setScale} last />
            </Card>
            <Banner kind="info">{DIET_TEXTS.assignInfo}</Banner>
          </View>
          <View style={{ marginTop: 20 }}>
            <PrimaryButton
              label={picked.length === 0 ? 'Pick clients' : `Create ${picked.length} ${picked.length === 1 ? 'draft' : 'drafts'}`}
              disabled={picked.length === 0}
              loading={working}
              onPress={() => void create()}
            />
          </View>
        </>
      ) : null}
    </PushedLayout>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: 6, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  templateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 14, minHeight: 60 },
  avatar: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fonts.display, fontSize: 16 },
  box: { width: 26, height: 26, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
