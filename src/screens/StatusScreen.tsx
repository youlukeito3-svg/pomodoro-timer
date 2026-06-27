import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import PixelCharacter from '../components/PixelCharacter';
import PixelBar from '../components/PixelBar';
import ScreenHeader from '../components/ScreenHeader';
import { initialState } from '../store/gameStore';

const s = initialState;

const PARAMS = [
  { label: 'STR', value: 24, color: colors.hp },
  { label: 'INT', value: 38, color: colors.purple },
  { label: 'DEX', value: 20, color: colors.gold },
  { label: 'VIT', value: 18, color: colors.vit },
  { label: 'WIS', value: 32, color: colors.mp },
];

export default function StatusScreen() {
  const doneHabits = s.habits.filter(h => h.doneToday).length;
  const activeQuests = s.quests.filter(q => !q.completed).length;
  const totalSkills = s.skills.length;

  return (
    <View style={styles.root}>
      <ScreenHeader title="【 STATUS 】" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>◆ ADVENTURER STATUS ◆</Text>

          {/* Character card */}
          <View style={styles.charCard}>
            <View style={styles.charLeft}>
              <View style={styles.charFrame}>
                <PixelCharacter size={64} />
              </View>
            </View>
            <View style={styles.charRight}>
              <Text style={styles.charName}>{s.name}</Text>
              <Text style={styles.charJob}>{s.job}</Text>
              <View style={styles.lvRow}>
                <Text style={styles.lvLabel}>LV</Text>
                <Text style={styles.lvValue}>{s.level}</Text>
              </View>
              <Text style={styles.totalExp}>TOTAL EXP : {s.totalExp.toLocaleString()}</Text>
            </View>
          </View>

          {/* HP / EXP bars */}
          <View style={styles.barsSection}>
            <View style={styles.barRow}>
              <Text style={styles.barLabel}>HP</Text>
              <PixelBar value={s.hp} max={s.maxHp} color={colors.hp} />
              <Text style={styles.barVal}>{s.hp}/{s.maxHp}</Text>
            </View>
            <View style={styles.barRow}>
              <Text style={styles.barLabel}>EXP</Text>
              <PixelBar value={s.exp} max={s.maxExp} color={colors.purple} />
              <Text style={styles.barVal}>{s.exp}/{s.maxExp}</Text>
            </View>
            <Text style={styles.nextLv}>▶ NEXT LV : {s.maxExp - s.exp} EXP</Text>
          </View>

          {/* Parameters */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PARAMETERS</Text>
            <View style={styles.paramsGrid}>
              {PARAMS.map(p => (
                <View key={p.label} style={styles.paramItem}>
                  <Text style={[styles.paramLabel, { color: p.color }]}>{p.label}</Text>
                  <Text style={[styles.paramValue, { color: p.color }]}>{p.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Today's progress */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TODAY'S PROGRESS</Text>
            <View style={styles.progressGrid}>
              <View style={styles.progressItem}>
                <Text style={styles.progressNum}>{doneHabits}/{s.habits.length}</Text>
                <Text style={styles.progressDesc}>習慣達成</Text>
              </View>
              <View style={styles.progressItem}>
                <Text style={styles.progressNum}>{activeQuests}</Text>
                <Text style={styles.progressDesc}>進行中QST</Text>
              </View>
              <View style={styles.progressItem}>
                <Text style={styles.progressNum}>{totalSkills}</Text>
                <Text style={styles.progressDesc}>習得スキル</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 12 },
  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: 2,
    padding: 14,
    gap: 14,
  },
  panelTitle: {
    color: colors.gold,
    fontFamily: 'monospace',
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 2,
  },
  charCard: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  charLeft: {},
  charFrame: {
    borderWidth: 2,
    borderColor: colors.border2,
    backgroundColor: colors.surface3,
    padding: 4,
  },
  charRight: { flex: 1, gap: 3 },
  charName: {
    color: colors.gold2,
    fontFamily: 'monospace',
    fontSize: 20,
    fontWeight: 'bold',
  },
  charJob: {
    color: colors.textDim,
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
  },
  lvRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  lvLabel: { color: colors.textDim, fontFamily: 'monospace', fontSize: 11 },
  lvValue: { color: colors.gold2, fontFamily: 'monospace', fontSize: 28, fontWeight: 'bold' },
  totalExp: { color: colors.textDim, fontFamily: 'monospace', fontSize: 10 },
  barsSection: { gap: 8 },
  barRow: { gap: 6 },
  barLabel: { color: colors.textDim, fontFamily: 'monospace', fontSize: 10, marginBottom: 2 },
  barVal: { color: colors.text, fontFamily: 'monospace', fontSize: 10, textAlign: 'right', marginTop: 2 },
  nextLv: { color: colors.gold3, fontFamily: 'monospace', fontSize: 10, textAlign: 'right' },
  section: { gap: 8 },
  sectionTitle: {
    color: colors.textDim,
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 4,
  },
  paramsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  paramItem: { alignItems: 'center', gap: 2 },
  paramLabel: { fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold' },
  paramValue: { fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold' },
  progressGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  progressItem: { alignItems: 'center', gap: 4 },
  progressNum: { color: colors.gold2, fontFamily: 'monospace', fontSize: 22, fontWeight: 'bold' },
  progressDesc: { color: colors.textDim, fontFamily: 'monospace', fontSize: 9 },
});
