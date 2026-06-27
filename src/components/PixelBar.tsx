import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface Props {
  value: number;
  max: number;
  color: string;
  height?: number;
  segments?: number;
}

export default function PixelBar({ value, max, color, height = 10, segments = 10 }: Props) {
  const filled = Math.round((value / max) * segments);
  return (
    <View style={[styles.container, { height }]}>
      {Array.from({ length: segments }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            { height, backgroundColor: i < filled ? color : colors.surface3 },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 2,
  },
  segment: {
    flex: 1,
    borderRadius: 1,
  },
});
