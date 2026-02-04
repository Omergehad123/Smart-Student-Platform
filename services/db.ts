import { User, Subject, Lecture, Task, Note, StudyStats, PublishedQuiz } from '../types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from './config';

const hasValidSupabaseUrl = typeof CONFIG.SUPABASE_URL === 'string' && CONFIG.SUPABASE_URL.startsWith('http');
const hasValidAnonKey = typeof CONFIG.SUPABASE_ANON_KEY === 'string';
const isSupabaseReady = hasValidSupabaseUrl && hasValidAnonKey;

export let supabase: SupabaseClient | null = null;
if (isSupabaseReady) {
  try {
    // Now types are always `string` due to the guards above
    supabase = createClient(CONFIG.SUPABASE_URL as string, CONFIG.SUPABASE_ANON_KEY as string, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  } catch (e) {
    console.warn("Supabase integration skipped - Using Local Storage mode.");
  }
}

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';

const KEYS = {
  USER: 'smart_student_user',
  SUBJECTS: 'smart_student_subjects',
  TASKS: 'smart_student_tasks',
  NOTES: 'smart_student_notes',
  STATS: 'smart_student_stats',
  QUIZZES: 'smart_student_quizzes'
};

const local = {
  get: (key: string) => {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : null;
    } catch (e) { return null; }
  },
  set: (key: string, val: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { }
  }
};

export const db = {
  saveUser: async (user: User) => {
    local.set(KEYS.USER, user);
    if (supabase) {
      try {
        await supabase.from('profiles').upsert({
          id: MOCK_USER_ID,
          email: user.email,
          full_name: user.full_name,
          xp: user.xp || 120
        });
      } catch (e) { }
    }
    return user;
  },

  getUser: async (): Promise<User | null> => {
    const localUser = local.get(KEYS.USER);
    if (supabase) {
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', MOCK_USER_ID).maybeSingle();
        if (data && !error) {
          local.set(KEYS.USER, data);
          return data as User;
        }
      } catch (e) { }
    }
    return localUser;
  },

  getSubjects: async (): Promise<Subject[]> => {
    const localData = local.get(KEYS.SUBJECTS) || [];
    if (supabase) {
      try {
        const { data, error } = await supabase.from('subjects').select('*').eq('user_id', MOCK_USER_ID);
        if (!error && data && data.length > 0) {
          local.set(KEYS.SUBJECTS, data);
          return data as Subject[];
        }
      } catch (e) { }
    }
    return localData;
  },

  saveSubject: async (sub: Partial<Subject>): Promise<Subject[]> => {
    const current = await db.getSubjects();
    const newSub: Subject = {
      id: Date.now(),
      name: sub.name || 'مادة جديدة',
      color: sub.color || 'bg-indigo-500',
      progress: 0,
      lectures: [],
      ...sub
    };
    const updated = [...current, newSub];
    local.set(KEYS.SUBJECTS, updated);
    if (supabase) {
      try {
        await supabase.from('subjects').insert({
          user_id: MOCK_USER_ID,
          name: newSub.name,
          color: newSub.color,
          progress: 0,
          lectures: []
        });
      } catch (e) { }
    }
    return updated;
  },

  deleteSubject: async (id: number) => {
    const current = await db.getSubjects();
    const updated = current.filter((s: any) => s.id !== id);
    local.set(KEYS.SUBJECTS, updated);
    if (supabase) {
      try { await supabase.from('subjects').delete().eq('id', id); } catch (e) { }
    }
    return updated;
  },

  addLecture: async (subjectId: number, lecture: any) => {
    const subjects = await db.getSubjects();
    const updated = subjects.map((s: any) => {
      if (s.id === subjectId) {
        const newLec = { ...lecture, id: Date.now(), isCompleted: false, date: new Date().toLocaleDateString('ar-EG') };
        const updatedLecs = [...(s.lectures || []), newLec];
        const completed = updatedLecs.filter((l: any) => l.isCompleted).length;
        const progress = updatedLecs.length > 0 ? Math.round((completed / updatedLecs.length) * 100) : 0;
        if (supabase) supabase.from('subjects').update({ lectures: updatedLecs, progress }).eq('id', subjectId).then();
        return { ...s, lectures: updatedLecs, progress };
      }
      return s;
    });
    local.set(KEYS.SUBJECTS, updated);
    return updated;
  },

  editLecture: async (subjectId: number, lectureId: number, lectureUpdate: any) => {
    const subjects = await db.getSubjects();
    const updated = subjects.map((s: any) => {
      if (s.id === subjectId) {
        const updatedLecs = (s.lectures || []).map((l: any) => l.id === lectureId ? { ...l, ...lectureUpdate } : l);
        const completed = updatedLecs.filter((l: any) => l.isCompleted).length;
        const progress = updatedLecs.length > 0 ? Math.round((completed / updatedLecs.length) * 100) : 0;
        if (supabase) supabase.from('subjects').update({ lectures: updatedLecs, progress }).eq('id', subjectId).then();
        return { ...s, lectures: updatedLecs, progress };
      }
      return s;
    });
    local.set(KEYS.SUBJECTS, updated);
    return updated;
  },

  deleteLecture: async (subjectId: number, lectureId: number) => {
    const subjects = await db.getSubjects();
    const updated = subjects.map((s: any) => {
      if (s.id === subjectId) {
        const updatedLecs = (s.lectures || []).filter((l: any) => l.id !== lectureId);
        const completed = updatedLecs.filter((l: any) => l.isCompleted).length;
        const progress = updatedLecs.length > 0 ? Math.round((completed / updatedLecs.length) * 100) : 0;
        if (supabase) supabase.from('subjects').update({ lectures: updatedLecs, progress }).eq('id', subjectId).then();
        return { ...s, lectures: updatedLecs, progress };
      }
      return s;
    });
    local.set(KEYS.SUBJECTS, updated);
    return updated;
  },

  toggleLectureStatus: async (subjectId: number, lectureId: number) => {
    const subjects = await db.getSubjects();
    const updated = subjects.map((s: any) => {
      if (s.id === subjectId) {
        const updatedLecs = (s.lectures || []).map((l: any) => l.id === lectureId ? { ...l, isCompleted: !l.isCompleted } : l);
        const completed = updatedLecs.filter((l: any) => l.isCompleted).length;
        const progress = updatedLecs.length > 0 ? Math.round((completed / updatedLecs.length) * 100) : 0;
        if (supabase) supabase.from('subjects').update({ lectures: updatedLecs, progress }).eq('id', subjectId).then();
        return { ...s, lectures: updatedLecs, progress };
      }
      return s;
    });
    local.set(KEYS.SUBJECTS, updated);
    return updated;
  },

  getTasks: async (): Promise<Task[]> => {
    const localTasks = local.get(KEYS.TASKS) || [];
    if (supabase) {
      try {
        const { data, error } = await supabase.from('tasks').select('*').eq('user_id', MOCK_USER_ID).order('created_at', { ascending: false });
        if (!error && data && data.length > 0) {
          local.set(KEYS.TASKS, data);
          return data as Task[];
        }
      } catch (e) { }
    }
    return localTasks;
  },

  saveTask: async (task: any) => {
    const current = await db.getTasks();
    const newTask = { ...task, id: Date.now(), status: 'upcoming' };
    const updated = [newTask, ...current];
    local.set(KEYS.TASKS, updated);
    if (supabase) {
      try {
        await supabase.from('tasks').insert({
          user_id: MOCK_USER_ID,
          title: task.title,
          time: task.time,
          duration: task.duration,
          day_index: task.dayIndex,
          subject_color: task.subjectColor || 'bg-indigo-500',
          status: 'upcoming'
        });
      } catch (e) { }
    }
    return updated;
  },

  saveBatchTasks: async (newTasks: any[]) => {
    const current = await db.getTasks();
    const processed = newTasks.map(t => ({ ...t, id: Date.now() + Math.random(), status: 'upcoming' }));
    const updated = [...processed, ...current];
    local.set(KEYS.TASKS, updated);
    if (supabase) {
      try {
        await supabase.from('tasks').insert(processed.map(t => ({
          user_id: MOCK_USER_ID,
          title: t.title,
          time: t.time,
          duration: t.duration,
          day_index: t.dayIndex,
          subject_color: t.subjectColor || 'bg-indigo-500',
          status: 'upcoming'
        })));
      } catch (e) { }
    }
    return updated;
  },

  toggleTask: async (id: number) => {
    const current = await db.getTasks();
    const updated = current.map((t: any) => t.id === id ? { ...t, status: t.status === 'completed' ? 'upcoming' : 'completed' } : t);
    local.set(KEYS.TASKS, updated);
    if (supabase) {
      try {
        const task = updated.find((t: any) => t.id === id);
        await supabase.from('tasks').update({ status: task.status }).eq('id', id);
      } catch (e) { }
    }
    return updated;
  },

  deleteTask: async (id: number) => {
    const current = await db.getTasks();
    const updated = current.filter((t: any) => t.id !== id);
    local.set(KEYS.TASKS, updated);
    if (supabase) {
      try { await supabase.from('tasks').delete().eq('id', id); } catch (e) { }
    }
    return updated;
  },

  getNotes: async (): Promise<Note[]> => {
    const localNotes = local.get(KEYS.NOTES) || [];
    if (supabase) {
      try {
        const { data, error } = await supabase.from('notes').select('*').eq('user_id', MOCK_USER_ID).order('created_at', { ascending: false });
        if (!error && data && data.length > 0) {
          local.set(KEYS.NOTES, data);
          return data as Note[];
        }
      } catch (e) { }
    }
    return localNotes;
  },

  saveNote: async (note: any) => {
    const current = await db.getNotes();
    const newNote = { ...note, id: Date.now(), date: new Date().toLocaleDateString('ar-EG') };
    const updated = [newNote, ...current];
    local.set(KEYS.NOTES, updated);
    if (supabase) {
      try {
        await supabase.from('notes').insert({
          user_id: MOCK_USER_ID,
          title: note.title,
          text: note.text,
          translation: note.translation || '',
          category: note.category,
          date: new Date().toLocaleDateString('ar-EG')
        });
      } catch (e) { }
    }
    return updated;
  },

  deleteNote: async (id: number) => {
    const current = await db.getNotes();
    const updated = current.filter((n: any) => n.id !== id);
    local.set(KEYS.NOTES, updated);
    if (supabase) {
      try { await supabase.from('notes').delete().eq('id', id); } catch (e) { }
    }
    return updated;
  },

  getStudyStats: async (): Promise<StudyStats> => {
    return local.get(KEYS.STATS) || { sessionsCompleted: 0, totalMinutes: 0, topSubject: 'غير محدد', focusRate: 0 };
  },

  saveStudySession: async (minutes: number, subjectName: string) => {
    const stats = await db.getStudyStats();
    const updated = {
      ...stats,
      sessionsCompleted: stats.sessionsCompleted + 1,
      totalMinutes: stats.totalMinutes + minutes,
      topSubject: subjectName
    };
    local.set(KEYS.STATS, updated);
    return updated;
  },

  // NEW: Quiz methods
  getQuizzes: async (): Promise<PublishedQuiz[]> => {
    const localQuizzes = local.get(KEYS.QUIZZES) || [];
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('quizzes')
          .select('*')
          .eq('user_id', MOCK_USER_ID)
          .order('created_at', { ascending: false });
        if (!error && data && data.length > 0) {
          local.set(KEYS.QUIZZES, data);
          return data as PublishedQuiz[];
        }
      } catch (e) { }
    }
    return localQuizzes;
  },

  publishQuiz: async (quiz: PublishedQuiz): Promise<PublishedQuiz> => {
    // Local storage fallback
    const currentQuizzes = local.get(KEYS.QUIZZES) || [];
    const newQuiz = {
      ...quiz,
      localId: Date.now(),
      id: quiz.id.startsWith('quiz_') ? quiz.id : 'quiz_' + Math.random().toString(36).substr(2, 9)
    };
    const updatedQuizzes = [newQuiz, ...currentQuizzes];
    local.set(KEYS.QUIZZES, updatedQuizzes);

    // Supabase sync - matches your exact quiz structure
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('quizzes')
          .insert({
            id: quiz.id,                    // quiz_abc123 format
            user_id: MOCK_USER_ID,
            creator_id: quiz.creatorId || MOCK_USER_ID,  // "current_user" string
            settings: quiz.settings,         // { timeLimit, shuffleQuestions }
            questions: quiz.questions,       // Array of questions
            created_at: quiz.createdAt       // ISO string
          })
          .select()
          .single();

        if (!error && data) {
          // Update local storage with Supabase data
          local.set(KEYS.QUIZZES, updatedQuizzes.map((q: any) =>
            q.id === quiz.id ? { ...data, localId: q.localId } : q
          ));
          return data as PublishedQuiz;
        }
      } catch (e) {
        console.warn('Supabase quiz save failed, using local storage:', e);
      }
    }

    return newQuiz as PublishedQuiz;
  },


  calculateTotalXP: (subjects: Subject[], tasks: Task[], notes: Note[], stats: StudyStats): number => {
    let total = 120;
    if (subjects) subjects.forEach(s => { if (s.lectures) total += (s.lectures.filter((l: any) => l.isCompleted).length) * 20; });
    if (tasks) total += tasks.filter(t => t.status === 'completed').length * 10;
    if (notes) total += notes.length * 15;
    return total;
  },
};
