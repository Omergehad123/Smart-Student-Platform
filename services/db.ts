
import { createClient } from '@supabase/supabase-js';
import { User, Subject, Task, Note, StudyStats, PublishedQuiz, QuizResponse, Flashcard } from '../types';
import { CONFIG } from './config';

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Disable LockManager to avoid "timed out waiting 10000ms" in sandboxed iframes
    lock: (name, acquire, fn) => fn(),
  }
});

const getSafeSession = async () => {
  try {
    // Try to get session with a very short timeout
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session;
    
    // Fallback to getUser if session is null
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return { user } as any;
    
    return null;
  } catch (e) {
    console.warn("getSafeSession failed:", e);
    return null;
  }
};

// Simple in-memory cache
let subjectsCache: Subject[] | null = null;
let tasksCache: Task[] | null = null;
let notesCache: Note[] | null = null;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
  let timeoutId: any;
  const timeoutPromise = new Promise<T>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      console.warn(`Query timed out after ${timeoutMs}ms`);
      // For writes, we might not want to resolve with fallback if we want to know it failed
      reject(new Error("Timeout"));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (e) {
    clearTimeout(timeoutId);
    console.error("Query error:", e);
    return fallback;
  }
};

const addXP = async (amount: number) => {
  try {
    const session = await getSafeSession();
    const user = session?.user;
    if (!user) return;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('xp')
      .eq('id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // Profile not found, create it
      await supabase.from('profiles').insert([{ 
        id: user.id, 
        full_name: user.user_metadata?.full_name || 'Student', 
        xp: amount 
      }]);
      window.dispatchEvent(new CustomEvent('xp-updated', { detail: amount }));
      return;
    }

    const newXP = (profile?.xp || 0) + amount;

    await supabase
      .from('profiles')
      .update({ xp: newXP })
      .eq('id', user.id);

    window.dispatchEvent(new CustomEvent('xp-updated', { detail: newXP }));
  } catch (e) {
    console.error("addXP failed silently to prevent blocking:", e);
  }
};

export const db = {
  getSafeSession,
  getUser: async (): Promise<User | null> => {
    try {
      const session = await getSafeSession();
      if (!session) return null;
      
      const user = session.user;

      let { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // Profile missing, create it
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert([{ id: user.id, full_name: user.user_metadata?.full_name || 'Student', xp: 0 }])
          .select()
          .single();
        
        if (createError) {
          console.error("Error creating profile:", createError);
          return null;
        }
        profile = newProfile;
      }

      if (!profile) return null;

      return {
        id: user.id,
        email: user.email || '',
        full_name: profile.full_name,
        xp: profile.xp,
        subjects_count: 0
      };
    } catch (e) {
      console.error("getUser Exception:", e);
      return null;
    }
  },
  saveUser: async (user: User) => user,
  signOut: async () => {
    db.clearCache();
    await supabase.auth.signOut();
  },
  clearCache: () => {
    subjectsCache = null;
    tasksCache = null;
    notesCache = null;
  },
  getSubjects: async (): Promise<Subject[]> => {
    if (subjectsCache) return subjectsCache;
    try {
      const session = await getSafeSession();
      if (!session) {
        console.warn("No session found in getSubjects");
        return [];
      }
      
      const user = session.user;

      const query = supabase
        .from('subjects')
        .select(`
          *,
          lectures (*)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      const { data: subjects, error } = await withTimeout(query as any, 8000, { data: [], error: null }) as { data: any[], error: any };
      
      if (error) throw error;
      
      const mapped = (subjects || []).map((s: any) => ({
        ...s,
        lectures: (s.lectures || []).map((l: any) => ({
          ...l,
          isCompleted: l.is_completed
        }))
      })) as Subject[];
      
      subjectsCache = mapped;
      return mapped;
    } catch (e) {
      console.error("getSubjects Critical Error:", e);
      return subjectsCache || [];
    }
  },
  saveSubject: async (sub: Partial<Subject>): Promise<Subject[]> => {
    try {
      const session = await getSafeSession();
      const user = session?.user;
      if (!user) return db.getSubjects();

      const { error } = await supabase.from('subjects').insert([{ name: sub.name, color: sub.color, user_id: user.id }]);
      if (error) {
        console.error("Error saving subject:", error);
        alert("فشل في إضافة المادة: " + error.message);
      } else {
        subjectsCache = null; // Invalidate cache
        await addXP(50).catch(e => console.error("XP Error:", e));
      }
    } catch (e) {
      console.error("Save Subject Exception:", e);
    }
    return db.getSubjects();
  },
  deleteSubject: async (id: number) => {
    await supabase.from('subjects').delete().eq('id', id);
    subjectsCache = null; // Invalidate cache
    return db.getSubjects();
  },
  addLecture: async (subId: number, lec: any) => {
    try {
      const session = await getSafeSession();
      const user = session?.user;
      if (!user) return db.getSubjects();

      let finalContent = lec.content;

      // Upload file if exists
      if (lec.type === 'file' && lec.file) {
        const file = lec.file;
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('files')
          .upload(filePath, file, { cacheControl: '3600', upsert: false });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          if (uploadError.message.includes('too large')) {
            alert("فشل الرفع: حجم الملف يتجاوز الحد المسموح به في قاعدة البيانات (5 ميجابايت).");
          } else {
            alert("فشل رفع الملف: " + uploadError.message);
          }
          return db.getSubjects();
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('files')
            .getPublicUrl(filePath);
          finalContent = publicUrl;
        }
      }

      const { error } = await supabase.from('lectures').insert([{ 
        title: lec.title,
        type: lec.type,
        content: finalContent,
        is_completed: false,
        subject_id: subId, 
        user_id: user.id,
        date: new Date().toLocaleDateString('ar-EG')
      }]);

      if (error) {
        console.error("Error adding lecture:", error);
        alert("فشل إضافة المحاضرة: " + error.message);
      } else {
        subjectsCache = null; // Invalidate cache
        addXP(20).catch(e => console.error("XP background error:", e));
      }
    } catch (e) {
      console.error("Add Lecture Exception:", e);
    }
    return db.getSubjects();
  },
  toggleLectureStatus: async (subId: number, lecId: number) => {
    const { data: lecture } = await supabase
      .from('lectures')
      .select('is_completed')
      .eq('id', lecId)
      .single();

    await supabase
      .from('lectures')
      .update({ is_completed: !lecture?.is_completed })
      .eq('id', lecId);

    // Update subject progress
    const { data: lectures } = await supabase.from('lectures').select('is_completed').eq('subject_id', subId);
    if (lectures && lectures.length > 0) {
      const completed = lectures.filter(l => l.is_completed).length;
      const progress = Math.round((completed / lectures.length) * 100);
      await supabase.from('subjects').update({ progress }).eq('id', subId);
    }

    await addXP(30);
    subjectsCache = null; // Invalidate cache
    return db.getSubjects();
  },
  editLecture: async (subId: number, lecId: number, updatedLec: any) => {
    await supabase.from('lectures').update(updatedLec).eq('id', lecId);
    subjectsCache = null; // Invalidate cache
    return db.getSubjects();
  },
  deleteLecture: async (subId: number, lecId: number) => {
    await supabase.from('lectures').delete().eq('id', lecId);
    subjectsCache = null; // Invalidate cache
    return db.getSubjects();
  },
  getTasks: async (): Promise<Task[]> => {
    if (tasksCache) return tasksCache;
    try {
      const session = await getSafeSession();
      const user = session?.user;
      if (!user) return [];

      const query = supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('day_index', { ascending: true });

      const { data, error } = await withTimeout(query as any, 8000, { data: [], error: null }) as { data: any[], error: any };

      if (error) {
        console.error("Error fetching tasks:", error);
        return tasksCache || [];
      }
      const mapped = (data || []).map((t: any) => ({
        ...t,
        dayIndex: t.day_index || 0,
        subjectColor: t.subject_color || 'bg-indigo-500'
      })) as Task[];
      
      tasksCache = mapped;
      return mapped;
    } catch (e) {
      console.error("getTasks Exception:", e);
      return tasksCache || [];
    }
  },
  saveTask: async (t: any) => {
    try {
      const session = await getSafeSession();
      const user = session?.user;
      if (!user) return db.getTasks();
      
      const dbTask = {
        title: t.title || 'Untitled',
        time: t.time || '09:00',
        duration: t.duration || '1h',
        day_index: Number(t.dayIndex !== undefined ? t.dayIndex : 0),
        subject_color: t.subjectColor || 'bg-indigo-500',
        user_id: user.id,
        status: 'upcoming'
      };

      const query = supabase.from('tasks').insert([dbTask]);
      const { error } = await withTimeout(query as any, 8000, { error: null }) as { error: any };
      if (error) {
        console.error("Error saving task:", error);
        alert("فشل في حفظ المهمة: " + error.message);
      } else {
        tasksCache = null; // Invalidate cache
        await addXP(10).catch(() => {});
      }
    } catch (e) {
      console.error("saveTask Exception:", e);
    }
    return db.getTasks();
  },
  saveBatchTasks: async (tasks: any[]) => {
    try {
      const session = await getSafeSession();
      const user = session?.user;
      if (!user) return db.getTasks();
      
      const tasksWithUser = tasks.map(t => ({
        title: t.title || 'Untitled Task',
        time: t.time || '09:00',
        duration: t.duration || '1h',
        day_index: Number(t.dayIndex !== undefined ? t.dayIndex : (t.day_index !== undefined ? t.day_index : 0)),
        subject_color: t.subjectColor || t.subject_color || 'bg-indigo-500',
        user_id: user.id,
        status: 'upcoming'
      }));

      const query = supabase.from('tasks').insert(tasksWithUser);
      const { error } = await withTimeout(query as any, 10000, { error: null }) as { error: any };
      
      if (error) {
        console.error("Error saving batch tasks:", error);
        alert("فشل في حفظ المهام: " + error.message);
      } else {
        tasksCache = null; // Invalidate cache
        await addXP(100).catch(() => {});
      }
    } catch (e) {
      console.error("Batch Tasks Exception:", e);
    }
    return db.getTasks();
  },
  deleteTask: async (id: number) => {
    await supabase.from('tasks').delete().eq('id', id);
    tasksCache = null; // Invalidate cache
    return db.getTasks();
  },
  toggleTask: async (id: number) => {
    const { data: task } = await supabase.from('tasks').select('status').eq('id', id).single();
    const newStatus = task?.status === 'completed' ? 'upcoming' : 'completed';
    await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
    tasksCache = null; // Invalidate cache
    return db.getTasks();
  },
  getNotes: async (): Promise<Note[]> => {
    try {
      const session = await getSafeSession();
      const user = session?.user;
      if (!user) return [];
      const query = supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      const { data, error } = await withTimeout(query as any, 5000, { data: [], error: null }) as { data: any[], error: any };
      if (error) {
        console.error("Error fetching notes:", error);
        return [];
      }
      return data || [];
    } catch (e) {
      console.error("getNotes Exception:", e);
      return [];
    }
  },
  saveNote: async (n: any) => {
    const session = await getSafeSession();
    const user = session?.user;
    if (!user) return [];
    const query = supabase.from('notes').insert([{ ...n, user_id: user.id, date: new Date().toLocaleDateString('ar-EG') }]);
    await withTimeout(query as any, 5000, { error: null }) as { error: any };
    return db.getNotes();
  },
  deleteNote: async (id: number) => {
    await supabase.from('notes').delete().eq('id', id);
    return db.getNotes();
  },
  getStudyStats: async (): Promise<StudyStats> => {
    const session = await getSafeSession();
    const user = session?.user;
    if (!user) return { sessionsCompleted: 0, totalMinutes: 0, topSubject: 'لا يوجد', focusRate: 0 };

    const { data } = await supabase.from('study_sessions').select('*').eq('user_id', user.id);
    if (!data || data.length === 0) return { sessionsCompleted: 0, totalMinutes: 0, topSubject: 'لا يوجد', focusRate: 0 };

    const totalMinutes = data.reduce((acc, curr) => acc + curr.duration_minutes, 0);
    const subjects = data.map(d => d.subject);
    const topSubject = subjects.sort((a, b) => subjects.filter(v => v === a).length - subjects.filter(v => v === b).length).pop() || 'لا يوجد';

    return {
      sessionsCompleted: data.length,
      totalMinutes,
      topSubject,
      focusRate: 85 // Mock focus rate
    };
  },
  saveStudySession: async (m: number, s: string) => {
    const session = await getSafeSession();
    const user = session?.user;
    if (!user) return db.getStudyStats();

    await supabase.from('study_sessions').insert([{ user_id: user.id, duration_minutes: m, subject: s }]);
    addXP(Math.floor(m / 2)).catch(() => {});
    return db.getStudyStats();
  },
  // Blackboard Real-time methods
  updateBlackboardData: async (id: string, data: any) => {
    await supabase.from('blackboard_sessions').update({ data, updated_at: new Date().toISOString() }).eq('id', id);
  },
  createBlackboardSession: async () => {
    try {
      const session = await getSafeSession();
      const user = session?.user;
      const { data, error } = await supabase.from('blackboard_sessions').insert([{ creator_id: user?.id, data: [] }]).select().single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.error("Create Blackboard Session Error:", e);
      return null;
    }
  },
  getBlackboardSession: async (id: string) => {
    try {
      // Only query if ID looks like a UUID to avoid 400 errors
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) return null;

      const { data, error } = await supabase.from('blackboard_sessions').select('data').eq('id', id).single();
      if (error) return null;
      return data;
    } catch (e) {
      return null;
    }
  },
  // Mind Map
  saveMindMap: async (title: string, data: any) => {
    const session = await getSafeSession();
    const user = session?.user;
    if (!user) return;
    await supabase.from('mind_maps').insert([{ user_id: user.id, title, data }]);
    addXP(30).catch(() => {});
  },
  getMindMaps: async () => {
    const { data } = await supabase.from('mind_maps').select('*').order('created_at', { ascending: false });
    return data || [];
  },
  // Quizzes
  publishQuiz: async (quiz: PublishedQuiz) => {
    try {
      const session = await getSafeSession();
      const user = session?.user;
      const { error } = await supabase.from('published_quizzes').insert([{
        id: quiz.id,
        creator_id: user?.id || null,
        settings: quiz.settings,
        questions: quiz.questions
      }]);
      if (error) throw error;
      addXP(100).catch(() => {});
    } catch (e) {
      console.warn("publishQuiz DB error, saving to local only:", e);
      const localQuizzes = JSON.parse(localStorage.getItem('local_published_quizzes') || '{}');
      localQuizzes[quiz.id] = quiz;
      localStorage.setItem('local_published_quizzes', JSON.stringify(localQuizzes));
    }
  },
  getPublishedQuiz: async (id: string): Promise<PublishedQuiz | null> => {
    try {
      const { data, error } = await supabase.from('published_quizzes').select('*').eq('id', id).single();
      if (error) throw error;
      if (data) {
        return {
          id: data.id,
          creatorId: data.creator_id,
          settings: data.settings,
          questions: data.questions,
          createdAt: data.created_at
        };
      }
    } catch (e) {
      console.warn("getPublishedQuiz DB error, checking local:", e);
    }
    const localQuizzes = JSON.parse(localStorage.getItem('local_published_quizzes') || '{}');
    return localQuizzes[id] || null;
  },
  submitQuizResponse: async (response: QuizResponse) => {
    const session = await getSafeSession();
    const user = session?.user;
    await supabase.from('quiz_responses').insert([{
      quiz_id: response.quizId,
      user_id: user?.id,
      score: response.score,
      total_questions: response.totalQuestions,
      answers: response.answers
    }]);
    addXP(20).catch(() => {});
  },
  // Presentations
  savePresentation: async (title: string, slides: any[], lang: string) => {
    const session = await getSafeSession();
    const user = session?.user;
    if (!user) return;
    await supabase.from('presentations').insert([{
      user_id: user.id,
      title,
      slides,
      lang
    }]);
    addXP(150).catch(() => {});
  },
  getPresentations: async () => {
    const { data } = await supabase.from('presentations').select('*').order('created_at', { ascending: false });
    return data || [];
  },
  // AI Chat
  getChatSessions: async () => {
    try {
      const session = await getSafeSession();
      const user = session?.user;
      if (!user) return JSON.parse(localStorage.getItem('local_chat_sessions') || '[]');
      
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("getChatSessions DB error, falling back to local:", e);
      return JSON.parse(localStorage.getItem('local_chat_sessions') || '[]');
    }
  },
  createChatSession: async (title: string) => {
    const localId = 'local_' + Math.random().toString(36).substr(2, 9);
    const localSession = { id: localId, title, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), isLocal: true };

    try {
      const session = await getSafeSession();
      const user = session?.user;
      if (!user) {
        const locals = JSON.parse(localStorage.getItem('local_chat_sessions') || '[]');
        localStorage.setItem('local_chat_sessions', JSON.stringify([localSession, ...locals]));
        return localSession;
      }

      const { data, error } = await supabase
        .from('chat_sessions')
        .insert([{ user_id: user.id, title }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (e) {
      const locals = JSON.parse(localStorage.getItem('local_chat_sessions') || '[]');
      localStorage.setItem('local_chat_sessions', JSON.stringify([localSession, ...locals]));
      return localSession;
    }
  },
  deleteChatSession: async (id: string) => {
    try {
      if (id.startsWith('local_')) {
        const locals = JSON.parse(localStorage.getItem('local_chat_sessions') || '[]');
        localStorage.setItem('local_chat_sessions', JSON.stringify(locals.filter((s: any) => s.id !== id)));
        localStorage.removeItem(`local_msgs_${id}`);
        return;
      }
      await supabase.from('chat_sessions').delete().eq('id', id);
    } catch (e) {
      const locals = JSON.parse(localStorage.getItem('local_chat_sessions') || '[]');
      localStorage.setItem('local_chat_sessions', JSON.stringify(locals.filter((s: any) => s.id !== id)));
    }
  },
  saveChatMessage: async (role: 'user' | 'ai', text: string, sessionId?: string | null) => {
    if (sessionId && sessionId.startsWith('local_')) {
      const msgs = JSON.parse(localStorage.getItem(`local_msgs_${sessionId}`) || '[]');
      msgs.push({ role, text, created_at: new Date().toISOString() });
      localStorage.setItem(`local_msgs_${sessionId}`, JSON.stringify(msgs));
      return;
    }

    const session = await getSafeSession();
    const user = session?.user;
    if (!user) return;
    
    const payload: any = { user_id: user.id, role, content: text };
    if (sessionId) payload.session_id = sessionId;

    try {
      const { error } = await supabase.from('ai_conversations').insert([payload]);
      if (error && payload.session_id) {
        delete payload.session_id;
        await supabase.from('ai_conversations').insert([payload]);
      }
      if (sessionId) {
        try { await supabase.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId); } catch (e) {}
      }
    } catch (e) {
      console.error("saveChatMessage error:", e);
    }
  },
  getChatMessages: async (sessionId?: string | null) => {
    if (sessionId && sessionId.toString().startsWith('local_')) {
      return JSON.parse(localStorage.getItem(`local_msgs_${sessionId}`) || '[]');
    }

    try {
      const session = await getSafeSession();
      if (!session?.user) return JSON.parse(localStorage.getItem(`local_msgs_${sessionId}`) || '[]');

      let query = supabase.from('ai_conversations').select('*').order('created_at', { ascending: true });
      if (sessionId) query = query.eq('session_id', sessionId);
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(m => ({ role: m.role, text: m.content }));
    } catch (e) {
      console.warn("getChatMessages DB error, falling back to local if exists:", e);
      if (sessionId) {
        return JSON.parse(localStorage.getItem(`local_msgs_${sessionId}`) || '[]');
      }
      return [];
    }
  },
  // AI Images
  saveAIImage: async (imageUrl: string, prompt: string) => {
    const session = await getSafeSession();
    const user = session?.user;
    if (!user) return;
    await supabase.from('ai_images').insert([{
      user_id: user.id,
      image_url: imageUrl,
      prompt
    }]);
    addXP(40).catch(() => {});
  },
  getAIImages: async () => {
    const { data } = await supabase.from('ai_images').select('*').order('created_at', { ascending: false });
    return data || [];
  }
};
