import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { colors } from './src/theme/colors';

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: colors.gold,
            background: colors.bg,
            card: colors.surface,
            text: colors.text,
            border: colors.border2,
            notification: colors.hp,
          },
        }}
      >
        <StatusBar style="light" backgroundColor={colors.bg} />
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
