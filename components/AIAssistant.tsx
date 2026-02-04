import React, { useState, useRef, useEffect } from 'react';
import {
  Send, FileText, ClipboardCheck, Brain, Sparkles, Loader2, GraduationCap,
  RefreshCcw, MessageSquare, Upload, Database, X, CheckCircle2,
  Trophy, ChevronRight, ChevronLeft, FileDown, Printer, BookOpen,
  ArrowRight, Eye, Download, FileBox, Undo2, Home, AlertCircle, List,
  Layers, Trash2, PlusCircle, Image as ImageIcon, Library, Share2, Link as LinkIcon, Copy, Info,
  Settings as SettingsIcon, Globe, Calendar, Clock, BarChart3, Wand2
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { db } from '../services/db';
import { Subject, Lecture, QuizQuestion, QuizSettings, PublishedQuiz } from '../types';
import { translations } from '../i18n';

interface InternalQuestion {
  id: string;
  type: 'multiple' | 'boolean' | 'short';
  question: string;
  options: string[];
  correctAnswer: any;
  explanation: string;
}

export const AIAssistant: React.FC<{ lang?: 'ar' | 'en' }> = ({ lang = 'ar' }) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'quiz'>('chat');
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [contexts, setContexts] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('anonymous'); // ✅ FIXED

  // Quiz Logic States
  const [quizStep, setQuizStep] = useState<'setup' | 'solving' | 'result' | 'review'>('setup');
  const [quizQuestions, setQuizQuestions] = useState<InternalQuestion[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, any>>({});
  const [quizSettings, setQuizSettings] = useState({
    title: lang === 'ar' ? 'اختبار ذكي مخصص' : 'Custom Smart Quiz',
    count: 10,
    type: 'mixed' as 'multiple' | 'boolean' | 'mixed',
    language: lang,
    timeLimit: 15
  });

  const [quizLoading, setQuizLoading] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');

  const t = translations[lang];

  useEffect(() => {
    const loadData = async () => {
      const data = await db.getSubjects();
      setSubjects(data);

      // ✅ FIXED: Use existing getUser() method instead of non-existent getCurrentUserId()
      try {
        const user = await db.getUser();
        setCurrentUserId(user?.id || 'anonymous_' + Math.random().toString(36).substr(2, 9));
      } catch (e) {
        setCurrentUserId('anonymous_' + Math.random().toString(36).substr(2, 9));
      }
    };
    loadData();

    if (!(window as any).pdfjsLib) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      };
      document.head.appendChild(script);
    }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setLoading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        if (file.type === 'application/pdf') {
          const pdfjs = (window as any).pdfjsLib;
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
          let fullText = '';
          for (let j = 1; j <= Math.min(pdf.numPages, 15); j++) {
            const page = await pdf.getPage(j);
            const content = await page.getTextContent();
            fullText += content.items.map((it: any) => it.str).join(' ') + '\n';
          }
          setContexts(prev => [...prev, { id: Math.random(), title: file.name, data: fullText, type: 'text' }]);
        } else if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setContexts(prev => [...prev, { id: Math.random(), title: file.name, data: event.target?.result, type: 'image' }]);
          };
          reader.readAsDataURL(file);
        } else {
          const text = await file.text();
          setContexts(prev => [...prev, { id: Math.random(), title: file.name, data: text, type: 'text' }]);
        }
      } catch (err) { console.error(err); }
    }
    setLoading(false);
  };

  const generateAITest = async () => {
    if (contexts.length === 0) return alert("يرجى رفع ملف أولاً");
    setQuizLoading(true);
    setQuizQuestions([]);
    setUserAnswers({});
    setCurrentQuestionIdx(0);

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
      const combinedText = contexts.filter(c => c.type === 'text').map(c => c.data).join('\n\n');

      const prompt = `أنت خبير في بناء الاختبارات الأكاديمية. 
      المطلوب: قم بتحليل المحتوى المرفق واستخرج ${quizSettings.count} أسئلة من نوع "${quizSettings.type}".
      
      قاعدة اللغة: إذا كان المحتوى المرفق باللغة الإنجليزية، يجب أن تكون الأسئلة والخيارات والشرح باللغة الإنجليزية بالكامل. إذا كان بالعربية فاستخدم العربية.
      
      المحتوى المرجعي:
      ${combinedText.substring(0, 15000)}
      
      الرد يجب أن يكون JSON حصراً مصفوفة (Array) بهذا التنسيق:
      [{
        "id": "q1",
        "type": "multiple" | "boolean",
        "question": "نص السؤال",
        "options": ["اختيار 1", "اختيار 2", "اختيار 3", "اختيار 4"],
        "correctAnswer": 0, // رقم الاندكس للإجابة الصحيحة
        "explanation": "شرح بسيط لماذا هذه هي الإجابة الصحيحة"
      }]`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const questions = JSON.parse(response.text || '[]');
      setQuizQuestions(questions);
      setQuizStep('solving');
    } catch (e) {
      alert("فشل في توليد الأسئلة ذكياً.");
    } finally {
      setQuizLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || contexts.length === 0) return;
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
      const combinedText = contexts.filter(c => c.type === 'text').map(c => c.data).join('\n\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: userMsg,
        config: {
          systemInstruction: `أنت المعلم الخصوصي الذكي. 
          قاعدة اللغة: أجب بنفس لغة المحتوى المرفق أو لغة سؤال الطالب. إذا كان المحتوى إنجليزياً، اشرح بالإنجليزية بأسلوب مبسط.
          السياق المرجعي: ${combinedText.substring(0, 10000)}. 
          استخدم Markdown في التنسيق.`
        }
      });
      setMessages(prev => [...prev, { role: 'ai', text: response.text }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: "عذراً، حدث خطأ فني." }]);
    } finally { setLoading(false); }
  };

  // ✅ FIXED: Simplified publish without DB dependency
  const handlePublishQuiz = async () => {
    const testId = 'test_' + Math.random().toString(36).substr(2, 9);
    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${testId}`;

    setPublishedUrl(shareUrl);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 3000);

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const exportChatPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const content = messages.map(m => `
      <div style="margin-bottom: 25px; padding: 20px; border-radius: 15px; background: ${m.role === 'user' ? '#f8faff' : '#ffffff'}; border: 1px solid #e2e8f0; font-family: 'Cairo', sans-serif;">
        <p style="font-weight: 900; color: ${m.role === 'user' ? '#4f46e5' : '#10b981'}; margin-bottom: 10px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 5px;">
          ${m.role === 'user' ? 'الطالب (سؤال)' : 'المعلم الذكي (شرح)'}:
        </p>
        <div style="line-height: 1.8; white-space: pre-wrap; font-size: 14px; color: #1e293b;">${m.text}</div>
      </div>
    `).join('');

    printWindow.document.write(`
      <html dir="rtl">
        <head><title>تقرير شرح المعلم الخصوصي</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Cairo', sans-serif; padding: 50px; background: #fdfdfd; }
          .header { text-align: center; margin-bottom: 40px; border-bottom: 4px solid #4f46e5; padding-bottom: 20px; }
          h1 { color: #4f46e5; margin: 0; font-size: 28px; }
          .footer { text-align: center; margin-top: 50px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        </style></head>
        <body>
          <div class="header"><h1>منصة الطالب الذكي - تقرير الشرح</h1><p>تاريخ الجلسة: ${new Date().toLocaleDateString('ar-EG')}</p></div>
          ${content}
          <div class="footer">تم التوليد بواسطة الذكاء الاصطناعي - منصة الطالب الذكي 2025</div>
          <script>window.onload=()=>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const exportUnsolvedQuizPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Check questions language to set direction
    const isEn = quizQuestions[0]?.question?.match(/[a-zA-Z]/);
    const dir = isEn ? 'ltr' : 'rtl';

    const content = quizQuestions.map((q, i) => `
      <div style="margin-bottom: 40px; page-break-inside: avoid;">
        <div style="font-weight: 900; font-size: 16px; margin-bottom: 15px;">
          ${i + 1}. ${q.question}
        </div>
        <div style="margin-left: ${isEn ? '30px' : '0'}; margin-right: ${isEn ? '0' : '30px'};">
          ${q.type === 'multiple' || q.type === 'boolean' ?
        q.options.map((opt, oi) => `
            <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
              <div style="width: 18px; height: 18px; border: 1.5px solid #000; border-radius: 50%;"></div>
              <span>${opt}</span>
            </div>
          `).join('') :
        `<div style="height: 100px; border-bottom: 1px dashed #ccc; margin-top: 10px;"></div>`
      }
        </div>
      </div>
    `).join('');

    printWindow.document.write(`
      <html dir="${dir}">
        <head>
          <title>${quizSettings.title}</title>
          <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Cairo', 'Arial', sans-serif; padding: 40px; color: #000; }
            .exam-header { border: 2px solid #000; padding: 20px; margin-bottom: 40px; text-align: center; }
            .exam-title { font-size: 24px; font-weight: 900; margin-bottom: 10px; }
            .student-info { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; text-align: ${isEn ? 'left' : 'right'}; margin-top: 20px; font-weight: bold; border-top: 1px solid #000; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="exam-header">
            <div class="exam-title">${quizSettings.title}</div>
            <div>${isEn ? 'Smart Student Platform - AI Generated Quiz' : 'منصة الطالب الذكي - اختبار مولد ذكياً'}</div>
            <div class="student-info">
              <div>${isEn ? 'Student Name:' : 'اسم الطالب:'} _______________________</div>
              <div>${isEn ? 'Date:' : 'التاريخ:'} ${new Date().toLocaleDateString(isEn ? 'en-US' : 'ar-EG')}</div>
            </div>
          </div>
          ${content}
          <script>window.onload=()=>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const exportReviewPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const content = quizQuestions.map((q, i) => {
      const isCorrect = userAnswers[q.id] === q.correctAnswer;
      return `
        <div style="margin-bottom: 30px; border: 2px solid #e2e8f0; padding: 25px; border-radius: 25px; font-family: 'Cairo', sans-serif; page-break-inside: avoid;">
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <div style="width: 35px; height: 35px; border-radius: 10px; background: ${isCorrect ? '#10b981' : '#ef4444'}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 900; margin-left: 15px;">${i + 1}</div>
            <h3 style="margin: 0; color: #1e293b;">${q.question}</h3>
          </div>
          <div style="margin-right: 50px;">
            ${q.options.map((opt, oi) => `
              <div style="padding: 12px; border-radius: 12px; margin-bottom: 8px; border: 2px solid ${oi === q.correctAnswer ? '#10b981' : (userAnswers[q.id] === oi ? '#ef4444' : '#f1f5f9')}; background: ${oi === q.correctAnswer ? '#f0fdf4' : (userAnswers[q.id] === oi ? '#fef2f2' : '#ffffff')}; font-size: 13px;">
                <strong>${String.fromCharCode(65 + oi)}:</strong> ${opt} ${oi === q.correctAnswer ? '<span style="float:left; color:#10b981;">✔️ الإجابة الصحيحة</span>' : (userAnswers[q.id] === oi ? '<span style="float:left; color:#ef4444;">❌ اختيارك</span>' : '')}
              </div>
            `).join('')}
          </div>
          <div style="margin-top: 20px; padding: 15px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 15px; font-size: 13px;">
            <strong style="color: #b45309;">💡 توضيح المعلم:</strong> ${q.explanation}
          </div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <html dir="rtl">
        <head><title>مراجعة الاختبار - منصة الطالب الذكي</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Cairo', sans-serif; padding: 50px; background: #fff; }
          .header { text-align: center; margin-bottom: 40px; }
          h1 { color: #4f46e5; font-size: 32px; margin-bottom: 5px; }
          .score-box { background: #f8fafc; padding: 20px; border-radius: 20px; display: inline-block; border: 2px solid #e2e8f0; margin-bottom: 30px; }
        </style></head>
        <body>
          <div class="header">
            <h1>مراجعة الاختبار الذكي</h1>
            <div class="score-box">
              <strong>الدرجة النهائية:</strong> ${calculateScore()} / ${quizQuestions.length}
            </div>
          </div>
          ${content}
          <script>window.onload=()=>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const calculateScore = () => {
    let score = 0;
    quizQuestions.forEach(q => {
      if (userAnswers[q.id] === q.correctAnswer) score++;
    });
    return score;
  };

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-10rem)] ${lang === 'ar' ? 'rtl' : 'ltr'} font-cairo`}>
      {/* Sidebar Controls */}
      <div className="lg:col-span-3 space-y-4 flex flex-col overflow-y-auto no-scrollbar">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-800">
          <div className="flex flex-col gap-2">
            <button onClick={() => setActiveTab('chat')} className={`w-full flex items-center gap-3 p-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'chat' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
              <MessageSquare size={18} /> {t.ai_tab_chat}
            </button>
            <button onClick={() => { setActiveTab('quiz'); setQuizStep('setup'); }} className={`w-full flex items-center gap-3 p-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'quiz' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
              <ClipboardCheck size={18} /> {t.ai_tab_quiz}
            </button>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[2.5rem] border border-indigo-100 dark:border-slate-800 flex flex-col gap-4">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">{t.ai_source_active} ({contexts.length})</h4>
          <div className="flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar">
            {contexts.map(c => (
              <div key={c.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-indigo-50 flex items-center justify-between group shadow-sm">
                <div className="flex items-center gap-2 truncate">
                  {c.type === 'image' ? <ImageIcon size={14} className="text-amber-500" /> : <FileText size={14} className="text-indigo-500" />}
                  <span className="text-[11px] font-bold truncate max-w-[140px]">{c.title}</span>
                </div>
                <button onClick={() => setContexts(prev => prev.filter(x => x.id !== c.id))} className="text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"><X size={14} /></button>
              </div>
            ))}
            {contexts.length === 0 && <div className="text-center py-4 text-[10px] text-slate-300 font-bold">لا توجد ملفات</div>}
          </div>
          <div className="grid grid-cols-1 gap-2">
            <label className="w-full flex items-center justify-center gap-2 p-4 bg-indigo-600 text-white rounded-2xl text-[11px] font-black cursor-pointer shadow-lg hover:bg-indigo-700 transition-all">
              <PlusCircle size={16} /> رفع ملفات
              <input type="file" multiple className="hidden" accept=".pdf,.txt,image/*" onChange={handleFileUpload} />
            </label>
            <button onClick={() => setShowLibraryModal(true)} className="w-full flex items-center justify-center gap-2 p-4 bg-white border border-indigo-100 text-indigo-600 rounded-2xl text-[11px] font-black hover:bg-slate-50 transition-all"><Library size={16} /> المكتبة</button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="lg:col-span-9 bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl flex flex-col border border-slate-100 dark:border-slate-800 overflow-hidden relative">
        {activeTab === 'chat' ? (
          <>
            <div className="bg-slate-50/50 dark:bg-slate-800/50 px-10 py-5 border-b flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><Brain size={24} /></div>
                <div>
                  <h4 className="text-sm font-black">المعلم الخصوصي الذكي</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">يدعم العربية والإنجليزية آلياً</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={exportChatPDF} disabled={messages.length === 0} className="p-3 text-slate-400 hover:text-indigo-600 transition-all bg-white rounded-xl border shadow-sm" title="تصدير الشرح PDF"><Printer size={18} /></button>
                <button onClick={() => setMessages([])} className="p-3 text-slate-400 hover:text-rose-500 transition-all bg-white rounded-xl border shadow-sm"><RefreshCcw size={18} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar bg-white dark:bg-slate-950/20">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-20 text-center scale-90">
                  <Brain size={120} className="mb-8 text-indigo-400" />
                  <h3 className="text-3xl font-black">ناقش مادتك بذكاء...</h3>
                  <p className="font-bold text-lg max-w-xs mt-2">ارفع محاضراتك بالإنجليزية أو العربية وسأقوم بتبسيطها لك.</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                  <div className={`max-w-[85%] p-6 rounded-[2.5rem] text-[13px] font-bold leading-relaxed shadow-sm border border-slate-50 dark:border-slate-800 ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-50 dark:bg-slate-800 dark:text-white rounded-bl-none'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {loading && <Loader2 className="animate-spin text-indigo-600 mx-auto my-4" />}
            </div>
            <div className="p-8 border-t dark:border-slate-800">
              <div className="flex gap-4 bg-slate-50 dark:bg-slate-950 p-2 rounded-[2.5rem] border shadow-inner">
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 px-8 py-4 bg-transparent outline-none font-bold text-base dark:text-white" placeholder="اسألني أي شيء حول الملفات المرفوعة..." />
                <button onClick={handleSendMessage} disabled={loading || !input.trim() || contexts.length === 0} className="w-14 h-14 bg-indigo-600 text-white rounded-3xl flex items-center justify-center shadow-lg active:scale-90 transition-all disabled:opacity-30"><Send size={24} /></button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {quizStep === 'setup' && (
              <div className="flex-1 p-12 overflow-y-auto custom-scrollbar flex flex-col items-center justify-center text-center">
                <div className="max-w-xl w-full space-y-10">
                  <div className="w-24 h-24 bg-indigo-600 text-white rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl mb-6"><Sparkles size={48} /></div>
                  <h3 className="text-4xl font-black">{t.ai_quiz_title}</h3>
                  <p className="text-slate-500 font-bold text-lg">حدد إعدادات الاختبار المخصص لمستواك</p>

                  <div className="bg-slate-50 dark:bg-slate-800/50 p-10 rounded-[3.5rem] grid grid-cols-2 gap-8 text-right shadow-inner border dark:border-slate-700">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">{t.ai_quiz_count}</label>
                      <input type="number" value={quizSettings.count} onChange={e => setQuizSettings({ ...quizSettings, count: parseInt(e.target.value) || 5 })} className="w-full p-5 bg-white dark:bg-slate-900 rounded-3xl border-none font-black text-center text-2xl shadow-sm" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">{t.ai_quiz_type}</label>
                      <select value={quizSettings.type} onChange={e => setQuizSettings({ ...quizSettings, type: e.target.value as any })} className="w-full p-5 bg-white dark:bg-slate-900 rounded-3xl border-none font-black shadow-sm appearance-none text-center">
                        <option value="mixed">{t.ai_quiz_type_mixed}</option>
                        <option value="multiple">{t.ai_quiz_type_multi}</option>
                        <option value="boolean">{t.ai_quiz_type_bool}</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={generateAITest} disabled={quizLoading || contexts.length === 0} className="w-full py-7 bg-indigo-600 text-white rounded-[2.5rem] font-black text-2xl shadow-2xl flex items-center justify-center gap-4 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50">
                    {quizLoading ? <Loader2 className="animate-spin" size={32} /> : <Wand2 size={32} />} {t.ai_quiz_start}
                  </button>
                </div>
              </div>
            )}

            {quizStep === 'solving' && (
              <div className="flex-1 flex flex-col h-full bg-slate-50/10">
                <div className="px-10 py-6 bg-white dark:bg-slate-900 border-b flex justify-between items-center shadow-md">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-xl shadow-lg">{currentQuestionIdx + 1}</div>
                    <div>
                      <h4 className="font-black text-lg">جاري الاختبار...</h4>
                      <div className="w-48 h-2 bg-slate-100 dark:bg-slate-800 rounded-full mt-2 overflow-hidden shadow-inner">
                        <div className="h-full bg-indigo-600 transition-all duration-700" style={{ width: `${((currentQuestionIdx + 1) / quizQuestions.length) * 100}%` }}></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={exportUnsolvedQuizPDF} className="px-6 py-3 bg-white border-2 border-indigo-100 text-indigo-600 rounded-xl font-black text-xs flex items-center gap-2 hover:bg-indigo-50 transition-all shadow-sm"><Printer size={18} /> تصدير نسخة ورقية (PDF)</button>
                    <button onClick={() => setQuizStep('setup')} className="p-3 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all"><X size={20} /></button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
                  <div className="max-w-3xl mx-auto space-y-12 animate-in slide-in-from-bottom-4">
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white text-center leading-relaxed px-10">{quizQuestions[currentQuestionIdx].question}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {quizQuestions[currentQuestionIdx].options.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => setUserAnswers({ ...userAnswers, [quizQuestions[currentQuestionIdx].id]: i })}
                          className={`p-8 rounded-[3rem] text-right font-black text-lg transition-all border-4 flex items-center gap-6 group shadow-lg ${userAnswers[quizQuestions[currentQuestionIdx].id] === i ? 'border-indigo-600 bg-indigo-50 text-indigo-900 scale-[1.02]' : 'border-white dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-100 text-slate-600'}`}
                        >
                          <div className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0 font-black shadow-inner transition-colors ${userAnswers[quizQuestions[currentQuestionIdx].id] === i ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-300'}`}>{String.fromCharCode(65 + i)}</div>
                          <span className="flex-1">{opt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-white dark:bg-slate-900 border-t flex justify-between items-center shadow-lg">
                  <button onClick={() => setCurrentQuestionIdx(i => Math.max(0, i - 1))} disabled={currentQuestionIdx === 0} className="px-10 py-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-black disabled:opacity-20 flex items-center gap-2"><ChevronRight size={20} /> {t.ai_quiz_prev}</button>
                  {currentQuestionIdx === quizQuestions.length - 1 ? (
                    <button onClick={() => setQuizStep('result')} disabled={userAnswers[quizQuestions[currentQuestionIdx].id] === undefined} className="px-16 py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-xl hover:scale-105 transition-all"> {t.ai_quiz_submit} </button>
                  ) : (
                    <button onClick={() => setCurrentQuestionIdx(i => i + 1)} disabled={userAnswers[quizQuestions[currentQuestionIdx].id] === undefined} className="px-16 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:scale-105 transition-all"> {t.ai_quiz_next} <ChevronLeft size={20} /></button>
                  )}
                </div>
              </div>
            )}

            {quizStep === 'result' && (
              <div className="flex-1 p-12 flex flex-col items-center justify-center text-center animate-in zoom-in space-y-10">
                <div className="w-32 h-32 bg-indigo-100 rounded-full flex items-center justify-center mx-auto shadow-2xl border-[10px] border-white animate-bounce"><Trophy size={64} className="text-indigo-600" /></div>
                <h2 className="text-5xl font-black">{t.ai_quiz_report}</h2>
                <div className="grid grid-cols-2 gap-8 w-full max-w-lg">
                  <div className="bg-white dark:bg-slate-800 p-10 rounded-[3.5rem] shadow-xl border-2 border-emerald-100 flex flex-col items-center">
                    <span className="text-6xl font-black text-emerald-500">{calculateScore()}</span>
                    <span className="text-[11px] font-black text-slate-400 mt-2 uppercase tracking-widest">{t.ai_quiz_score_label}</span>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-10 rounded-[3.5rem] shadow-xl border-2 border-indigo-100 flex flex-col items-center">
                    <span className="text-6xl font-black text-indigo-600">{quizQuestions.length}</span>
                    <span className="text-[11px] font-black text-slate-400 mt-2 uppercase tracking-widest">{t.ai_quiz_total_label}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 justify-center">
                  <button onClick={() => setQuizStep('review')} className="px-10 py-5 bg-white border-2 border-indigo-600 text-indigo-600 rounded-3xl font-black shadow-xl flex items-center gap-3 hover:bg-indigo-50 transition-all"><Eye size={20} /> مراجعة الإجابات والشرح</button>
                  <button onClick={handlePublishQuiz} className="px-10 py-5 bg-emerald-600 text-white rounded-3xl font-black shadow-xl flex items-center gap-3 hover:scale-105 transition-all"><Share2 size={20} /> {copyFeedback ? 'تم نسخ الرابط!' : 'نشر الاختبار للآخرين'}</button>
                  <button onClick={() => setQuizStep('setup')} className="px-10 py-5 bg-indigo-600 text-white rounded-3xl font-black shadow-xl flex items-center gap-3 hover:scale-105 transition-all"><RefreshCcw size={20} /> {t.ai_quiz_retry}</button>
                </div>
              </div>
            )}

            {quizStep === 'review' && (
              <div className="flex-1 flex flex-col h-full">
                <div className="px-10 py-6 border-b flex justify-between items-center bg-slate-50/50">
                  <div>
                    <h4 className="text-2xl font-black">تحليل الأسئلة بالتفصيل 🎯</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">إليك الأخطاء والصواب مع الشرح التعليمي الكامل</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={exportReviewPDF} className="px-8 py-3 bg-white border-2 rounded-2xl font-black text-xs flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all"><Printer size={18} /> تصدير المراجعة PDF</button>
                    <button onClick={() => setQuizStep('result')} className="p-3 bg-slate-100 rounded-xl text-slate-500 hover:text-rose-500 transition-all"><X size={20} /></button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-12 space-y-10 custom-scrollbar bg-slate-50/30">
                  {quizQuestions.map((q, i) => (
                    <div key={i} className="bg-white dark:bg-slate-800 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-700 shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 transition-all">
                      <div className="p-10 space-y-8">
                        <div className="flex items-center gap-6">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg ${userAnswers[q.id] === q.correctAnswer ? 'bg-emerald-500' : 'bg-rose-500'}`}>{i + 1}</div>
                          <h4 className="text-xl font-black leading-relaxed">{q.question}</h4>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mr-12">
                          {q.options.map((opt, oi) => {
                            const isCorrect = oi === q.correctAnswer;
                            const isUserChoice = userAnswers[q.id] === oi;
                            return (
                              <div key={oi} className={`p-5 rounded-3xl border-2 font-bold text-sm flex items-center gap-5 transition-all ${isCorrect ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : isUserChoice ? 'bg-rose-50 border-rose-500 text-rose-700 shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400 opacity-60'}`}>
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-black shadow-sm ${isCorrect ? 'bg-emerald-500 text-white' : isUserChoice ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{String.fromCharCode(65 + oi)}</div>
                                <span className="flex-1">{opt}</span>
                                {isCorrect && <CheckCircle2 size={20} />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="p-8 bg-amber-50/50 dark:bg-amber-900/10 border-t border-amber-100 dark:border-amber-900/40 flex items-start gap-5">
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 shadow-lg"><Info size={24} /></div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">توضيح المعلم الخصوصي:</p>
                          <p className="text-base font-bold text-slate-700 dark:text-slate-300 leading-relaxed">{q.explanation}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-center pb-10">
                    <button onClick={() => setQuizStep('setup')} className="px-14 py-5 bg-indigo-600 text-white rounded-[2.5rem] font-black shadow-2xl hover:scale-105 transition-all">بدء تحدي جديد 🚀</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Library Ingest Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[4rem] p-12 shadow-2xl relative animate-in zoom-in border-4 border-white/10">
            <button onClick={() => setShowLibraryModal(false)} className={`absolute top-12 left-12 p-3 text-slate-400 hover:text-rose-500 transition-all rounded-2xl`}><X size={32} /></button>
            <div className="text-center mb-12">
              <div className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-inner"><Library size={48} /></div>
              <h3 className="text-4xl font-black dark:text-white">الاستيراد من المكتبة</h3>
            </div>
            <div className="max-h-[450px] overflow-y-auto space-y-8 custom-scrollbar pr-4">
              {subjects.map(sub => (
                <div key={sub.id} className="space-y-4">
                  <div className="flex items-center gap-4 px-6"><div className={`w-3.5 h-3.5 rounded-full ${sub.color} shadow-lg`}></div><span className="text-[12px] font-black text-slate-400 uppercase tracking-widest">{sub.name}</span></div>
                  <div className="grid grid-cols-1 gap-4">
                    {sub.lectures.map(lec => (
                      <button key={lec.id} onClick={() => {
                        setContexts(prev => [...prev, { id: Math.random(), title: lec.title, data: lec.content, type: 'text' }]);
                        setShowLibraryModal(false);
                      }} className="flex items-center justify-between p-6 bg-slate-50 dark:bg-slate-800 rounded-3xl border-2 border-transparent hover:border-indigo-500 transition-all text-right group shadow-md">
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 bg-white dark:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-colors shadow-sm"><FileText size={28} /></div>
                          <span className="font-black text-lg dark:text-white">{lec.title}</span>
                        </div>
                        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 opacity-0 group-hover:opacity-100 transition-all"><ArrowRight size={24} /></div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
