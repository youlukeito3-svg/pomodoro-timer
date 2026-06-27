import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Modal, TextInput } from 'react-native';
import { colors } from '../theme/colors';
import ScreenHeader from '../components/ScreenHeader';
import { Habit, initialState } from '../store/gameStore';

export default function HabitsScreen() {
  const [habits, setHabits] = useState<Habit[]>(initialState.habits);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newIcon, setNewIcon] = useState('⭐');
  const [newExp, setNewExp] = useState('10');

  const doneCount = habits.filter(h => h.doneToday).length;

  const toggle = (id: string) => {
    setHabits(prev =>
      prev.map(h => {
        if (h.id !== id) return h;
        const doneToday = !h.doneToday;
        return { ...h, doneToday, streak: doneToday ? h.streak + 1 : Math.max(0, h.streak - 1) };
      })
    );
  };

  const addHabit = () => {
    if (!newTitle.trim()) return;
    const h: Habit = {
      id: Date.now().toString(),
      icon: newIcon,
      title: newTitle.trim(),
      streak: 0,
      baseExp: parseInt(newExp) || 10,
      doneTodayIds: [],
      doneToday: false,
    };
    setHabits(prev => [...prev, h]);
    setNewTitle(''); setNewIcon('⭐'); setNewExp('10');
    setModalVisible(false);
  };

  const getExp = (h: Habit) => {
    const multiplier = h.streak >= 7 ? 1.1 : 1.0;
    return Math.round(h.baseExp * multiplier);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="【 HABITS 】"
        right={
          <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtn}>
            <Text style={styles.addBtnText}>＋ 追加</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.progressText}>{doneCount} / {habits.length} 完了</Text>
        <View style={styles.progressBarOuter}>
          {habits.map((h, i) => (
            <View key={h.id} style={[styles.progressSeg, h.doneToday && styles.progressSegFilled]} />
          ))}
        </View>

        {habits.map(h => (
          <TouchableOpacity key={h.id} style={[styles.card, h.doneToday && styles.cardDone]} onPress={() => toggle(h.id)} activeOpacity={0.8}>
            <View style={[styles.checkBox, h.doneToday && styles.checkBoxDone]}>
              {h.doneToday && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <View style={styles.habitInfo}>
              <View style={styles.habitTitleRow}>
                <Text style={styles.habitIcon}>{h.icon}</Text>
                <Text style={[styles.habitTitle, h.doneToday && styles.habitTitleDone]}>{h.title}</Text>
              </View>
              <View style={styles.habitMeta}>
                <Text style={styles.streakText}>🔥 {h.streak}日連続</Text>
                <Text style={styles.expText}>+{getExp(h)} EXP</Text>
                {h.streak >= 7 && <Text style={styles.multiplier}>×{(getExp(h) / h.baseExp).toFixed(1)}</Text>}
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>◆ 習慣追加 ◆</Text>
            <Text style={styles.inputLabel}>アイコン</Text>
            <TextInput style={styles.input} value={newIcon} onChangeText={setNewIcon} />
            <Text style={styles.inputLabel}>習慣名</Text>
            <TextInput style={styles.input} value={newTitle} onChangeText={setNewTitle} placeholder="習慣の名前" placeholderTextColor={colors.textFaint} />
            <Text style={styles.inputLabel}>EXP</Text>
            <TextInput style={styles.input} value={newExp} onChangeText={setNewExp} keyboardType="numeric" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={addHabit}>
                <Text style={styles.confirmBtnText}>追加する</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 12, paddingBottom: 24 },
  addBtn: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.gold3, borderRadius: 2 },
  addBtnText: { color: colors.gold, fontFamily: 'monospace', fontSize: 11 },
  progressText: { color: colors.gold, fontFamily: 'monospace', fontSize: 12, marginBottom: 6 },
  progressBarOuter: { flexDirection: 'row', gap: 4, marginBottom: 14, height: 6 },
  progressSeg: { flex: 1, backgroundColor: colors.surface3, borderRadius: 1 },
  progressSegFilled: { backgroundColor: colors.vit },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6, borderRadius: 2,
  },
  cardDone: { borderColor: colors.vit + '60' },
  checkBox: {
    width: 22, height: 22, borderWidth: 2, borderColor: colors.border2, borderRadius: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  checkBoxDone: { backgroundColor: colors.vit, borderColor: colors.vit },
  checkMark: { color: colors.bg, fontSize: 13, fontWeight: 'bold' },
  habitInfo: { flex: 1 },
  habitTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  habitIcon: { fontSize: 16 },
  habitTitle: { color: colors.text, fontFamily: 'monospace', fontSize: 13 },
  habitTitleDone: { color: colors.textDim, textDecorationLine: 'line-through' },
  habitMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  streakText: { color: colors.textDim, fontFamily: 'monospace', fontSize: 10 },
  expText: { color: colors.gold3, fontFamily: 'monospace', fontSize: 10 },
  multiplier: { color: colors.gold, fontFamily: 'monospace', fontSize: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, padding: 20, width: '85%', gap: 8 },
  modalTitle: { color: colors.gold, fontFamily: 'monospace', fontSize: 12, textAlign: 'center', marginBottom: 4, letterSpacing: 2 },
  inputLabel: { color: colors.textDim, fontFamily: 'monospace', fontSize: 10 },
  input: { backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border, color: colors.text, fontFamily: 'monospace', fontSize: 13, paddingHorizontal: 10, paddingVertical: 6 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border2, paddingVertical: 8, alignItems: 'center' },
  cancelBtnText: { color: colors.textDim, fontFamily: 'monospace', fontSize: 12 },
  confirmBtn: { flex: 1, backgroundColor: colors.border2, paddingVertical: 8, alignItems: 'center' },
  confirmBtnText: { color: colors.gold2, fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold' },
});
