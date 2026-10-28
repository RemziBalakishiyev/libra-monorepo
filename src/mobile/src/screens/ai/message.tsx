import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { PressableScale } from '@/components/pressable-scale';
import { Sheet } from '@/components/sheet';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AssistantAnswer, AssistantFact, AssistantMessage } from '@/lib/api/assistant';
import { formatNumber } from '@/lib/money';

const outcomeTitles: Record<AssistantAnswer['outcome'], string> = {
  Answer: 'Cavab',
  InsufficientData: 'Kifayət qədər məlumat yoxdur',
  ClarificationNeeded: 'Dəqiqləşdirmə lazımdır',
  Refusal: 'Bu suala cavab verilmir',
};

const availabilityNotes: Record<AssistantFact['availability'], string | null> = {
  Available: null,
  NoRecords: 'Qeyd yoxdur',
  Partial: 'Qismən məlumat',
  Unavailable: 'Oxuna bilmədi',
};

/** The figure as the server computed it. Never parsed out of the assistant's prose. */
function factValue(fact: AssistantFact): string {
  if (fact.availability === 'NoRecords') {
    return 'Qeyd yoxdur';
  }
  if (fact.availability === 'Unavailable') {
    return '—';
  }
  if (fact.value === null) {
    return fact.text ?? '—';
  }
  // Money keeps both decimals; counts and durations keep none. Anything else gets one.
  const isMoney = /^[A-Z]{3}$/.test(fact.unit ?? '');
  const digits = Number.isInteger(fact.value) ? 0 : isMoney ? 2 : 1;
  return `${formatNumber(fact.value, digits)}${fact.unit ? ` ${fact.unit}` : ''}`;
}

/** What the figure is about, when the fact names it: the category behind a total, for instance. */
function factDetail(fact: AssistantFact): string | null {
  return fact.value !== null && fact.text ? fact.text : null;
}

/**
 * One turn in the conversation.
 *
 * An assistant turn renders its figures from the snapshot stored with it, which is why an answer from
 * yesterday keeps yesterday's numbers instead of silently adopting today's.
 */
export function AssistantMessageRow({ message, index, onFollowUp, onOpenSource }: {
  message: AssistantMessage;
  index: number;
  onFollowUp: (question: string) => void;
  onOpenSource: (route: string) => void;
}) {
  const { colors } = useTheme();
  const [sourcesOpen, setSourcesOpen] = useState(false);

  if (message.role === 'user') {
    return (
      <Entrance index={Math.min(index, 3)} from="below" distance={6}>
        <View style={[styles.question, { backgroundColor: colors.primarySoft }]} testID={`assistant-question-${message.id}`}>
          <AppText variant="bodyStrong" color="primaryText">
            {message.text}
          </AppText>
        </View>
      </Entrance>
    );
  }

  const answer = message.answer;
  if (!answer) {
    return null;
  }

  // Only the facts this answer actually cited become cards; the rest of the snapshot stays in "Mənbələr".
  const citedIds = [...new Set(answer.observations.flatMap((observation) => observation.factIds))];
  const cited = citedIds.map((id) => answer.snapshot.facts.find((fact) => fact.id === id)).filter((fact): fact is AssistantFact => Boolean(fact));

  return (
    <Entrance index={Math.min(index, 3)} from="below" distance={6}>
      <View style={[styles.answer, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`assistant-answer-${message.id}`}>
        {answer.outcome !== 'Answer' ? (
          <View style={styles.outcome}>
            <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
            <AppText variant="meta" color="textSecondary" testID="assistant-outcome">
              {outcomeTitles[answer.outcome]}
            </AppText>
          </View>
        ) : null}

        {answer.isFixture ? (
          <View style={[styles.fixture, { backgroundColor: colors.warningSoft }]} testID="assistant-fixture-badge">
            <Ionicons name="flask-outline" size={13} color={colors.warningText} />
            <AppText variant="caption" color="warningText">
              Nümunə cavab (fixture)
            </AppText>
          </View>
        ) : null}

        <AppText testID="assistant-summary">{answer.clarification ?? answer.summary}</AppText>

        {cited.length > 0 ? (
          <View style={styles.metrics}>
            {cited.map((fact) => (
              <View key={fact.id} style={[styles.metric, { backgroundColor: colors.surfaceSubtle }]} testID={`assistant-metric-${fact.id}`}>
                <AppText variant="caption" color="textSecondary" numberOfLines={2}>
                  {fact.label}
                </AppText>
                <AppText variant="bodyStrong" style={styles.tabular}>
                  {factValue(fact)}
                </AppText>
                {factDetail(fact) ?? availabilityNotes[fact.availability] ? (
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {factDetail(fact) ?? availabilityNotes[fact.availability]}
                  </AppText>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {answer.observations.length > 0 ? (
          <View style={styles.list}>
            {answer.observations.map((observation, position) => (
              <View key={position} style={styles.bullet}>
                <View style={[styles.dot, { backgroundColor: colors.primaryText }]} />
                <AppText variant="caption" color="textSecondary" style={styles.flex}>
                  {observation.text}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        {/* Suggestions are labelled apart from observations: one says what the records show, the other
            proposes something. Nothing here is ever acted on by the app. */}
        {answer.suggestions.length > 0 ? (
          <View style={[styles.suggestions, { borderTopColor: colors.border }]}>
            <AppText variant="meta" color="textSecondary">
              Təkliflər
            </AppText>
            {answer.suggestions.map((suggestion, position) => (
              <View key={position} style={styles.bullet}>
                <View style={[styles.dot, styles.hollow, { borderColor: colors.primaryText }]} />
                <AppText variant="caption" color="textSecondary" style={styles.flex}>
                  {suggestion}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Mənbələr"
            accessibilityHint="Bu cavabın əsaslandığı qeydləri göstərir"
            onPress={() => setSourcesOpen(true)}
            scaleTo={0.97}
            style={[styles.sources, { borderColor: colors.border }]}
            testID="assistant-sources-open">
            <Ionicons name="layers-outline" size={14} color={colors.textSecondary} />
            <AppText variant="caption" color="textSecondary">
              Mənbələr ({answer.snapshot.facts.length})
            </AppText>
          </PressableScale>
        </View>

        {answer.followUps.length > 0 ? (
          <View style={styles.followUps}>
            {answer.followUps.map((question) => (
              <PressableScale
                key={question}
                accessibilityRole="button"
                accessibilityLabel={question}
                onPress={() => onFollowUp(question)}
                scaleTo={0.97}
                style={[styles.followUp, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}
                testID="assistant-follow-up">
                <AppText variant="caption" color="primaryText" numberOfLines={2}>
                  {question}
                </AppText>
              </PressableScale>
            ))}
          </View>
        ) : null}

        <SourcesSheet visible={sourcesOpen} answer={answer} onClose={() => setSourcesOpen(false)} onOpenSource={onOpenSource} />
      </View>
    </Entrance>
  );
}

/** Every figure the answer was built from, with the period it covers and when it was read. */
function SourcesSheet({ visible, answer, onClose, onOpenSource }: { visible: boolean; answer: AssistantAnswer; onClose: () => void; onOpenSource: (route: string) => void }) {
  const { colors } = useTheme();
  const collected = new Date(answer.snapshot.collectedAtUtc);

  return (
    <Sheet visible={visible} onClose={onClose} title="Mənbələr" maxWidth={460} testID="assistant-sources">
      <View style={styles.sourceList}>
        <AppText variant="caption" color="textSecondary" testID="assistant-sources-period">
          Dövr: {answer.snapshot.rangeFrom === answer.snapshot.rangeTo ? answer.snapshot.rangeFrom : `${answer.snapshot.rangeFrom} – ${answer.snapshot.rangeTo}`} · Məlumat{' '}
          {collected.toLocaleString('az-AZ')} tarixində toplanıb
        </AppText>

        {answer.snapshot.facts.map((fact) => (
          <View key={fact.id} style={[styles.sourceRow, { borderBottomColor: colors.border }]} testID={`assistant-source-${fact.id}`}>
            <View style={styles.flex}>
              <AppText variant="caption" color="textSecondary" numberOfLines={2}>
                {fact.label}
              </AppText>
              <AppText variant="bodyStrong" style={styles.tabular}>
                {factValue(fact)}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {factDetail(fact) ? `${factDetail(fact)} · ` : ''}
                {fact.period}
                {fact.caveat ? ` · ${fact.caveat}` : ''}
              </AppText>
            </View>
            {fact.sourceRoute ? (
              <Button
                title="Aç"
                variant="ghost"
                size="sm"
                onPress={() => {
                  onClose();
                  onOpenSource(fact.sourceRoute!);
                }}
                testID={`assistant-source-open-${fact.id}`}
              />
            ) : null}
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  question: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  answer: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  outcome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  fixture: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metric: {
    minWidth: 128,
    flexGrow: 1,
    flexBasis: 0,
    gap: 1,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  list: {
    gap: Spacing.xs,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 6,
  },
  hollow: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  suggestions: {
    gap: 2,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    flexDirection: 'row',
  },
  sources: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: MinTouchTarget - 12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  followUps: {
    gap: Spacing.xs,
  },
  followUp: {
    minHeight: MinTouchTarget - 10,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sourceList: {
    gap: Spacing.sm,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
