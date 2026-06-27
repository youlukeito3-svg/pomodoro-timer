import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface Props {
  title: string;
  right?: React.ReactNode;
}

export default function ScreenHeader({ title, right }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.cornerTL} />
      <View style={styles.titleRow}>
        <Text style={styles.deco}>◈</Text>
        <Text style={styles.title}> {title} </Text>
        <Text style={styles.deco}>◈</Text>
        {right && <View style={styles.right}>{right}</View>}
      </View>
      <View style={styles.cornerTR} />
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border2,
  },
  cornerTL: {},
  cornerTR: {},
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deco: {
    color: colors.gold,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  title: {
    color: colors.gold2,
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    letterSpacing: 3,
  },
  right: {
    position: 'absolute',
    right: 0,
  },
  divider: {},
});
