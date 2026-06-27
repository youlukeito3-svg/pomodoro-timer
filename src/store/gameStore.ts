import { useState } from 'react';

export interface Quest {
  id: string;
  rank: string;
  icon: string;
  title: string;
  exp: number;
  completed: boolean;
}

export interface Habit {
  id: string;
  icon: string;
  title: string;
  streak: number;
  baseExp: number;
  doneTodayIds: string[];
  doneToday: boolean;
}

export interface Skill {
  id: string;
  icon: string;
  name: string;
  level: number;
  expInLevel: number;
  expToNext: number;
}

export interface BodyLog {
  date: string;
  condition: number;
  weight: number | null;
  sleep: number | null;
  exercise: number | null;
}

export interface GameState {
  name: string;
  job: string;
  level: number;
  totalExp: number;
  hp: number;
  maxHp: number;
  exp: number;
  maxExp: number;
  quests: Quest[];
  habits: Habit[];
  skills: Skill[];
  bodyLogs: BodyLog[];
}

export const initialState: GameState = {
  name: 'Ariji',
  job: 'ARCANE ENGINEER',
  level: 12,
  totalExp: 12480,
  hp: 80,
  maxHp: 100,
  exp: 40,
  maxExp: 100,
  quests: [
    { id: 'q1', rank: 'D', icon: '💼', title: '週次レポート提出', exp: 100, completed: false },
    { id: 'q2', rank: 'C', icon: '📚', title: '本を1冊読む', exp: 200, completed: false },
    { id: 'q3', rank: 'A', icon: '🏃', title: 'フルマラソン完走', exp: 500, completed: false },
    { id: 'q4', rank: 'E', icon: '📝', title: '日記を書く', exp: 50, completed: true },
    { id: 'q5', rank: 'D', icon: '🧹', title: '部屋の掃除', exp: 100, completed: true },
  ],
  habits: [
    { id: 'h1', icon: '💪', title: '腕立て伏せ', streak: 7, baseExp: 10, doneTodayIds: [], doneToday: true },
    { id: 'h2', icon: '📚', title: '読書30分', streak: 0, baseExp: 10, doneTodayIds: [], doneToday: false },
    { id: 'h3', icon: '🏃', title: 'ジョギング', streak: 3, baseExp: 10, doneTodayIds: [], doneToday: true },
    { id: 'h4', icon: '🧘', title: '瞑想10分', streak: 0, baseExp: 10, doneTodayIds: [], doneToday: false },
    { id: 'h5', icon: '💧', title: '水2L飲む', streak: 1, baseExp: 10, doneTodayIds: [], doneToday: false },
  ],
  skills: [
    { id: 's1', icon: '💻', name: 'TypeScript', level: 5, expInLevel: 60, expToNext: 100 },
    { id: 's2', icon: '🌐', name: '英語', level: 3, expInLevel: 40, expToNext: 100 },
    { id: 's3', icon: '🎸', name: 'ギター', level: 2, expInLevel: 20, expToNext: 100 },
    { id: 's4', icon: '🎨', name: 'デザイン', level: 2, expInLevel: 30, expToNext: 100 },
  ],
  bodyLogs: [
    { date: '6/27(金)', condition: 3, weight: 65.5, sleep: 7.5, exercise: 30 },
    { date: '6/26(木)', condition: 2, weight: null, sleep: 6.0, exercise: null },
    { date: '6/25(水)', condition: 3, weight: null, sleep: 7.0, exercise: 45 },
  ],
};
