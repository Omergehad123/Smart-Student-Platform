export interface User {
  id: string;
  email: string;
  full_name: string;
  xp: number;
  subjects_count: number;
}

export interface Lecture {
  id: number;
  title: string;
  type: 'file' | 'link';
  content: string;
  date: string;
  isCompleted: boolean;
  notes?: string;
}

export interface Subject {
  id: number;
  name: string;
  color: string;
  progress: number;
  lectures: Lecture[];
  category?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface Task {
  id: number;
  title: string;
  time: string;
  duration: string;
  status: 'upcoming' | 'completed' | 'urgent' | 'pending';
  dayIndex: number;
  subjectColor?: string;
  isExam?: boolean;
}

export interface Note {
  id: number;
  title: string;
  text: string;
  translation?: string;
  category: string;
  date: string;
  created_at: string;
}

export interface StudyStats {
  sessionsCompleted: number;
  totalMinutes: number;
  topSubject: string;
  focusRate: number;
}

export interface QuizQuestion {
  id: string
  question: string
  options: string[]
  correctAnswer: number
}

export interface QuizSettings {
  timeLimit: number
  shuffleQuestions: boolean
  showResults: boolean
}

export interface PublishedQuiz {
  id: string
  title: string
  creatorId: string
  questions: QuizQuestion[]
  settings: QuizSettings
  createdAt: string
}

export type PageId =
  | 'dashboard'
  | 'subjects'
  | 'planner'
  | 'timer'
  | 'ai-assistant'
  | 'mindmap'
  | 'creator'
  | 'voice'
  | 'blackboard'
  | 'editor'
  | 'mynotes'
  | 'pricing'
  | 'privacy'
  | 'contact';

