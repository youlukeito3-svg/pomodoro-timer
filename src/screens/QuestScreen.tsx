import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert } from 'react-native';
import { colors } from '../theme/colors';
import ScreenHeader from '../components/ScreenHeader';
import { Quest, initialState } from '../store/gameStore';

const RANK_COLORS: Record<string, string> = {
  S: '#c44a3a', A: '#c9a84c', B: '#7a6ac9', C: '#4a7ab0', D: '#4aaa6a', E: colors.textDim,
};

export default function QuestScreen() {
  const [quests, setQuests] = useState<Quest[]>(initialState.quests);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRank, setNewRank] = useState('D');
  const [newExp, setNewExp] = useState('100');
  const [newIcon, setNewIcon] = useState('📜');

  const active = quests.filter(q => !q.completed);
  const done = quests.filter(q => q.completed);

  const complete = (id: string) => {
    setQuests(prev => prev.map(q => q.id === id ? { ...q, completed: true } : q));
  };

  const addQuest = () => {
    if (!newTitle.trim()) return;
    const q: Quest = {
      id: Date.now().toString(),
      rank: newRank,
      icon: newIcon,
      title: newTitle.trim(),
      exp: parseInt(newExp) || 100,
      completed: false,
    };
    setQuests(prev => [...prev, q]);
    setNewTitle(''); setNewRank('D'); setNewExp('100'); setNewIcon('📜');
    setModalVisible(false);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="【 QUEST 】"
        right={
          <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtn}>
            <Text style={styles.addBtnText}>＋ 追加</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionHead}>進行中 ({active.length})</Text>
        {active.map(q => (
          <View key={q.id} style={styles.card}>
            <View style={[styles.rankBadge, { borderColor: RANK_COLORS[q.rank] || colors.textDim }]}>
              <Text style={[styles.rankText, { color: RANK_COLORS[q.rank] || colors.textDim }]}>{q.rank}</Text>
            </View>
            <Text style={styles.questIcon}>{q.icon}</Text>
            <Text style={styles.questTitle} numberOfLines={1}>{q.title}</Text>
            <Text style={styles.expTag}>+{q.exp}</Text>
            <TouchableOpacity style={styles.completeBtn} onPress={() => complete(q.id)}>
              <Text style={styles.completeBtnText}>完了</Text>
            </TouchableOpacity>
          </View>
        ))}

        <Text style={[styles.sectionHead, { marginTop: 16 }]}>完了済み ({done.length})</Text>
        {done.map(q => (
          <View key={q.id} style={[styles.card, styles.cardDone]}>
            <View style={[styles.rankBadge, { borderColor: colors.textFaint }]}>
              <Text style={[styles.rankText, { color: colors.textFaint }]}>{q.rank}</Text>
            </View>
            <Text style={[styles.questIcon, styles.dimmed]}>{q.icon}</Text>
            <Text style={[styles.questTitle, styles.dimmed, styles.strikethrough]} numberOfLines={1}>{q.title}</Text>
            <Text style={[styles.expTag, styles.dimmed]}>+{q.exp}</Text>
            <Text style={styles.checkmark}>✦</Text>
          </View>
        ))}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>◆ 新規クエスト追加 ◆</Text>
            <Text style={styles.inputLabel}>アイコン</Text>
            <TextInput style={styles.input} value={newIcon} onChangeText={setNewIcon} />
            <Text style={styles.inputLabel}>タイトル</Text>
            <TextInput style={styles.input} value={newTitle} onChangeText={setNewTitle} placeholder="クエスト名" placeholderTextColor={colors.textFaint} />
            <Text style={styles.inputLabel}>ランク</Text>
            <View style={styles.rankRow}>
              {['E','D','C','B','A','S'].map(r => (
                <TouchableOpacity key={r} style={[styles.rankPick, newRank === r && { backgroundColor: colors.border2 }]} onPress={() => setNewRank(r)}>
                  <Text style={[styles.rankPickText, { color: RANK_COLORS[r] }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.inputLabel}>EXP報酬</Text>
            <TextInput style={styles.input} value={newExp} onChangeText={setNewExp} keyboardType="numeric" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={addQuest}>
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
  sectionHead: { color: colors.textDim, fontFamily: 'monospace', fontSize: 11, marginBottom: 8, letterSpacing: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6, borderRadius: 2,
  },
  cardDone: { opacity: 0.6 },
  rankBadge: {
    width: 22, height: 22, borderWidth: 1, borderRadius: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { fontFamily: 'monospace', fontSize: 11, fontWeight: 'bold' },
  questIcon: { fontSize: 16 },
  questTitle: { flex: 1, color: colors.text, fontFamily: 'monospace', fontSize: 12 },
  dimmed: { color: colors.textFaint },
  strikethrough: { textDecorationLine: 'line-through' },
  expTag: { color: colors.gold, fontFamily: 'monospace', fontSize: 11 },
  completeBtn: { borderWidth: 1, borderColor: colors.gold3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2 },
  completeBtnText: { color: colors.gold, fontFamily: 'monospace', fontSize: 10 },
  checkmark: { color: colors.gold3, fontSize: 14 },
  // modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2, padding: 20, width: '85%', gap: 8 },
  modalTitle: { color: colors.gold, fontFamily: 'monospace', fontSize: 12, textAlign: 'center', marginBottom: 4, letterSpacing: 2 },
  inputLabel: { color: colors.textDim, fontFamily: 'monospace', fontSize: 10 },
  input: { backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border, color: colors.text, fontFamily: 'monospace', fontSize: 13, paddingHorizontal: 10, paddingVertical: 6 },
  rankRow: { flexDirection: 'row', gap: 8 },
  rankPick: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 2 },
  rankPickText: { fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border2, paddingVertical: 8, alignItems: 'center' },
  cancelBtnText: { color: colors.textDim, fontFamily: 'monospace', fontSize: 12 },
  confirmBtn: { flex: 1, backgroundColor: colors.border2, paddingVertical: 8, alignItems: 'center' },
  confirmBtnText: { color: colors.gold2, fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold' },
});
