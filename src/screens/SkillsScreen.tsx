import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Modal, TextInput } from 'react-native';
import { colors } from '../theme/colors';
import ScreenHeader from '../components/ScreenHeader';
import PixelBar from '../components/PixelBar';
import { Skill, initialState } from '../store/gameStore';

export default function SkillsScreen() {
  const [skills, setSkills] = useState<Skill[]>(initialState.skills);
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('🌟');

  const totalLevel = skills.reduce((s, sk) => s + sk.level, 0);

  const practice = (id: string) => {
    setSkills(prev =>
      prev.map(sk => {
        if (sk.id !== id) return sk;
        const newExp = sk.expInLevel + 20;
        if (newExp >= sk.expToNext) {
          return { ...sk, level: sk.level + 1, expInLevel: newExp - sk.expToNext, expToNext: sk.expToNext + 20 };
        }
        return { ...sk, expInLevel: newExp };
      })
    );
  };

  const deleteSkill = (id: string) => {
    setSkills(prev => prev.filter(sk => sk.id !== id));
  };

  const addSkill = () => {
    if (!newName.trim()) return;
    const sk: Skill = {
      id: Date.now().toString(),
      icon: newIcon,
      name: newName.trim(),
      level: 1,
      expInLevel: 0,
      expToNext: 100,
    };
    setSkills(prev => [...prev, sk]);
    setNewName(''); setNewIcon('🌟');
    setModalVisible(false);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="【 SKILLS 】"
        right={
          <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtn}>
            <Text style={styles.addBtnText}>＋ 追加</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          <Text style={styles.statItem}>スキル数: <Text style={styles.statVal}>{skills.length}</Text></Text>
          <Text style={styles.statItem}>総レベル: <Text style={styles.statVal}>{totalLevel}</Text></Text>
        </View>

        {skills.map(sk => (
          <View key={sk.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.skillIcon}>{sk.icon}</Text>
              <Text style={styles.skillName}>{sk.name}</Text>
              <Text style={styles.lvBadge}>Lv <Text style={styles.lvNum}>{sk.level}</Text></Text>
            </View>
            <PixelBar value={sk.expInLevel} max={sk.expToNext} color={colors.purple} height={8} />
            <Text style={styles.expProgress}>{sk.expInLevel} / {sk.expToNext} EXP</Text>
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.practiceBtn} onPress={() => practice(sk.id)}>
                <Text style={styles.practiceBtnText}>練習 +20 EXP</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteSkill(sk.id)}>
                <Text style={styles.deleteBtnText}>削除</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>◆ スキル追加 ◆</Text>
            <Text style={styles.inputLabel}>アイコン</Text>
            <TextInput style={styles.input} value={newIcon} onChangeText={setNewIcon} />
            <Text style={styles.inputLabel}>スキル名</Text>
            <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="スキル名" placeholderTextColor={colors.textFaint} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={addSkill}>
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
  statsRow: { flexDirection: 'row', gap: 20, marginBottom: 12 },
  statItem: { color: colors.textDim, fontFamily: 'monospace', fontSize: 11 },
  statVal: { color: colors.gold, fontWeight: 'bold' },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    padding: 12, marginBottom: 10, borderRadius: 2, gap: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skillIcon: { fontSize: 18 },
  skillName: { flex: 1, color: colors.text, fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold' },
  lvBadge: { color: colors.textDim, fontFamily: 'monospace', fontSize: 11 },
  lvNum: { color: colors.gold2, fontSize: 16, fontWeight: 'bold' },
  expProgress: { color: colors.textFaint, fontFamily: 'monospace', fontSize: 9, textAlign: 'right' },
  cardActions: { flexDirection: 'row', gap: 8 },
  practiceBtn: { flex: 1, borderWidth: 1, borderColor: colors.gold3, paddingVertical: 6, alignItems: 'center', borderRadius: 2 },
  practiceBtnText: { color: colors.gold, fontFamily: 'monospace', fontSize: 11 },
  deleteBtn: { borderWidth: 1, borderColor: colors.border2, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 2 },
  deleteBtnText: { color: colors.textDim, fontFamily: 'monospace', fontSize: 11 },
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
