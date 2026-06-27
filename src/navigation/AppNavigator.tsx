import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import { colors } from '../theme/colors';
import StatusScreen from '../screens/StatusScreen';
import QuestScreen from '../screens/QuestScreen';
import HabitsScreen from '../screens/HabitsScreen';
import SkillsScreen from '../screens/SkillsScreen';
import BodyScreen from '../screens/BodyScreen';

const Tab = createBottomTabNavigator();

const TABS = [
  { name: 'STATUS', component: StatusScreen, icon: '⚔️', label: 'STATUS' },
  { name: 'QUEST', component: QuestScreen, icon: '📜', label: 'QUEST' },
  { name: 'HABITS', component: HabitsScreen, icon: '🔥', label: 'HABITS' },
  { name: 'SKILLS', component: SkillsScreen, icon: '📈', label: 'SKILLS' },
  { name: 'BODY', component: BodyScreen, icon: '🛡️', label: 'BODY' },
];

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border2,
          borderTopWidth: 1,
          height: 56,
          paddingBottom: 4,
          paddingTop: 4,
        },
        tabBarActiveTintColor: colors.gold2,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: {
          fontFamily: 'monospace',
          fontSize: 8,
          letterSpacing: 1,
        },
        tabBarIcon: ({ focused }) => {
          const tab = TABS.find(t => t.name === route.name);
          return (
            <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.5 }}>
              {tab?.icon}
            </Text>
          );
        },
      })}
    >
      {TABS.map(tab => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{ tabBarLabel: tab.label }}
        />
      ))}
    </Tab.Navigator>
  );
}
