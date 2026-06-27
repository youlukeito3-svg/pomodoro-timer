import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import ScreenHeader from '../components/ScreenHeader';
import PixelBar from '../components/PixelBar';
import { BodyLog, initialState } from '../store/gameStore';

const CONDITIONS = ['😵', '😔', '😐', '😊', '🤩'];

export default function BodyScreen() {
  const [logs, setLogs] = useState<BodyLog[]>(initialState.bodyLogs);
  const [condition, setCondition] = useState(3);
  const [weight, setWeight] = useState('65.5');
  const [sleep, setSleep] = useState('7.5');
  const [exercise, setExercise] = useState('30');

  const avgSleep = logs.filter(l => l.sleep !== null).reduce((s, l) => s + (l.sleep ?? 0), 0) / logs.filter(l => l.sleep !== null).length;
  const avgExercise = logs.filter(l => l.exercise !== null).reduce((s, l) => s + (l.exercise ?? 0), 0) / logs.filter(l => l.exercise !== null).length;

  const record = () => {
    const today = '6/27(金)';
    const newLog: BodyLog = {
      date: today,
      condition,
      weight: parseFloat(weight) || null,
      sleep: parseFloat(sleep) || null,
      exercise: parseInt(exercise) || null,
    };
    setLogs(prev => [newLog, ...prev.filter(l => l.date !== today)]);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="【 BODY 】" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>今日のログ — 6月27日(金)</Text>

          <Text style={styles.fieldLabel}>コンディション</Text>
          <View style={styles.conditionRow}>
            {CONDITIONS.map((c, i) => (
              <TouchableOpacity key={i} style={[styles.conditionBtn, condition === i && styles.conditionBtnActive]} onPress={() => setCondition(i)}>
                <Text style={styles.conditionEmoji}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>体重 (kg)</Text>
              <TextInput style={styles.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>睡眠 (時間)</Text>
              <TextInput style={styles.input} value={sleep} onChangeText={setSleep} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>運動 (分)</Text>
              <TextInput style={styles.input} value={exercise} onChangeText={setExercise} keyboardType="numeric" />
            </View>
          </View>

          <TouchableOpacity style={styles.recordBtn} onPress={record}>
            <Text style={styles.recordBtnText}>記録する (+5 EXP)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>直近14日の統計</Text>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>平均睡眠</Text>
            <Text style={styles.statValue}>{avgSleep.toFixed(1)}時間</Text>
            <PixelBar value={avgSleep} max={10} color={colors.mp} height={6} segments={14} />
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>平均運動</Text>
            <Text style={styles.statValue}>{Math.round(avgExercise)}分</Text>
            <PixelBar value={avgExercise} max={60} color={colors.vit} height={6} segments={14} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>履歴</Text>
          {logs.map((log, i) => (
            <View key={i} style={styles.historyRow}>
              <Text style={styles.historyDate}>{log.date}</Text>
              <Text style={styles.historyEmoji}>{CONDITIONS[log.condition]}</Text>
              {log.sleep !== null && <Text style={styles.historyTag}>💤{log.sleep}h</Text>}
              {log.exercise !== null && <Text style={styles.historyTag}>🏃{log.exercise}m</Text>}
              {log.exercise === null && <Text style={styles.historyTagDim}>—</Text>}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 12, paddingBottom: 24, gap: 16 },
  section: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    padding: 12, borderRadius: 2, gap: 10,
  },
  sectionTitle: {
    color: colors.gold, fontFamily: 'monospace', fontSize: 11, letterSpacing: 1,
    borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6,
  },
  fieldLabel: { color: colors.textDim, fontFamily: 'monospace', fontSize: 10 },
  conditionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  conditionBtn: { padding: 8, borderRadius: 2, borderWidth: 1, borderColor: 'transparent' },
  conditionBtnActive: { borderColor: colors.gold, backgroundColor: colors.surface3 },
  conditionEmoji: { fontSize: 24 },
  inputRow: { flexDirection: 'row', gap: 8 },
  inputGroup: { flex: 1, gap: 4 },
  input: {
    backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border,
    color: colors.text, fontFamily: 'monospace', fontSize: 14,
    paddingHorizontal: 8, paddingVertical: 6, textAlign: 'center',
  },
  recordBtn: {
    backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.gold3,
    paddingVertical: 10, alignItems: 'center', borderRadius: 2,
  },
  recordBtnText: { color: colors.gold, fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold' },
  statCard: { gap: 4 },
  statLabel: { color: colors.textDim, fontFamily: 'monospace', fontSize: 10 },
  statValue: { color: colors.text, fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold' },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  historyDate: { color: colors.textDim, fontFamily: 'monospace', fontSize: 11, width: 60 },
  historyEmoji: { fontSize: 16 },
  historyTag: { color: colors.text, fontFamily: 'monospace', fontSize: 11 },
  historyTagDim: { color: colors.textFaint, fontFamily: 'monospace', fontSize: 11 },
});
