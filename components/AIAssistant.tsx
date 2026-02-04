
import React, { useState, useRef, useEffect } from 'react';
import {
  Send, FileText, ClipboardCheck, Brain, Sparkles, Loader2,
  MessageSquare, X, CheckCircle2, Trophy, ChevronRight, ChevronLeft,
  Printer, BookOpen, ArrowRight, Eye, RefreshCcw, PlusCircle,
  Library, Share2, Info, Wand2, Layers, PieChart, FileDown, Undo2,
  Link as LinkIcon, Save, Plus, Trash2, Globe, FileSignature, Clock, ImageIcon, Copy
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { db } from '../services/db';
import { Subject, Lecture, PublishedQuiz } from '../types';
import { translations } from '../i18n';

interface InternalQuestion {
  id: string;
  type: 'multiple' | 'boolean' | 'short';
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface InfographicData {
  title: string;
  subtitle: string;
  leftSide: { name: string; items: { label: string, desc: string }[]; };
  rightSide: { name: string; items: { label: string, desc: string }[]; };
  summary: string;
  imagePrompt: string;
  imageUrl?: string;
}

export const AIAssistant: React.FC<{ lang?: 'ar' | 'en' }> = ({ lang = 'ar' }) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'quiz' | 'flashcards' | 'infographic'>('chat');
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [contexts, setContexts] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [showLibraryModal, setShowLibraryModal] = useState(false);

  // Flashcards State
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Infographic State
  const [infoData, setInfoData] = useState<InfographicData | null>(null);
  const [isGeneratingInfo, setIsGeneratingInfo] = useState(false);

  // Quiz Logic States
  const [quizStep, setQuizStep] = useState<'setup' | 'solving' | 'result' | 'review'>('setup');
  const [quizQuestions, setQuizQuestions] = useState<InternalQuestion[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, any>>({});
  const [quizSettings, setQuizSettings] = useState({
    title: lang === 'ar' ? 'اختبار مراجعة ذكي' : 'Smart Revision Quiz',
    count: 10,
    timeLimit: 15,
    type: 'mixed' as 'multiple' | 'boolean' | 'mixed'
  });
  const [publishedQuizId, setPublishedQuizId] = useState<string | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const t = translations[lang];

  useEffect(() => {
    db.getSubjects().then(s => setSubjects(Array.isArray(s) ? s : []));
    if (!(window as any).pdfjsLib) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      };
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setLoading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        if (file.type === 'application/pdf') {
          const pdfjs = (window as any).pdfjsLib;
          if (!pdfjs) continue;
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
          let fullText = '';
          for (let j = 1; j <= Math.min(pdf.numPages, 15); j++) {
            const page = await pdf.getPage(j);
            const content = await page.getTextContent();
            fullText += content.items.map((it: any) => it.str).join(' ') + '\n';
          }
          setContexts(prev => [...prev, { id: Math.random(), title: file.name, data: fullText, type: 'text' }]);
        } else {
          const text = await file.text();
          setContexts(prev => [...prev, { id: Math.random(), title: file.name, data: text, type: 'text' }]);
        }
      } catch (err) { console.error(err); }
    }
    setLoading(false);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || loading || (contexts || []).length === 0) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
      const contextText = (contexts || []).map(c => c.data).join('\n\n');
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: userMsg,
        config: { systemInstruction: `أنت مساعد تعليمي ذكي في منصة "الطالب الذكي". المرجع المتاح لك:\n${contextText.substring(0, 15000)}\nتعرف تلقائياً على لغة الطالب وأجب بنفس اللغة.` }
      });
      setMessages(prev => [...prev, { role: 'ai', text: response.text }]);
    } catch (e) { setMessages(prev => [...prev, { role: 'ai', text: "حدث خطأ فني." }]); } finally { setLoading(false); }
  };

  const generateAITest = async () => {
    if ((contexts || []).length === 0) return alert("يرجى رفع ملف أولاً لتوليد الأسئلة منه.");
    setQuizLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
      const context = (contexts || []).map(c => c.data).join('\n\n');
      const prompt = `تعرف على لغة النص وأنشئ ${quizSettings.count} أسئلة JSON من نوع ${quizSettings.type}. النص:\n${context.substring(0, 12000)}\nالتنسيق: [{"id":"q1","type":"multiple","question":"..","options":[".."],"correctAnswer":0,"explanation":".."}]`;
      const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt, config: { responseMimeType: "application/json" } });
      const parsed = JSON.parse(res.text || '[]');
      setQuizQuestions(Array.isArray(parsed) ? parsed : []);
      setQuizStep('solving');
      setCurrentQuestionIdx(0);
      setUserAnswers({});
    } catch (e) { alert("فشل التوليد الذكي."); } finally { setQuizLoading(false); }
  };

  const calculateScore = () => (quizQuestions || []).reduce((acc, q) => acc + (userAnswers[q.id] === q.correctAnswer ? 1 : 0), 0);

  const getCommonPdfStyle = (isAr: boolean) => `
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
      body { padding: 40px; background: #fff; font-family: 'Cairo', sans-serif; color: #1e293b; line-height: 1.6; }
      .header-card { border: 3px solid #4f46e5; border-radius: 30px; padding: 30px; margin-bottom: 40px; background: #f8faff; text-align: center; }
      .header-card h1 { color: #4f46e5; margin: 0; font-size: 26pt; font-weight: 900; }
      .student-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-weight: bold; font-size: 12pt; }
      .card { margin-bottom: 30px; border: 2px solid #e2e8f0; border-radius: 25px; padding: 30px; page-break-inside: avoid; }
      .q-num { width: 35px; height: 35px; background: #4f46e5; color: white; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 900; margin-${isAr ? 'left' : 'right'}: 15px; shrink: 0; }
      .footer { margin-top: 60px; text-align: center; color: #94a3b8; font-size: 10pt; border-top: 2px solid #f1f5f9; padding-top: 20px; font-weight: 700; }
      @media print { .no-print { display: none; } * { -webkit-print-color-adjust: exact; } }
    </style>
  `;

  const exportBlankQuizPDF = () => {
    if ((quizQuestions || []).length === 0) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const isAr = (quizQuestions || [])[0]?.question.match(/[\u0600-\u06FF]/);
    const content = (quizQuestions || []).map((q, i) => `
      <div class="card">
        <div style="display: flex; align-items: flex-start; margin-bottom: 25px;">
          <div class="q-num">${i + 1}</div>
          <h3 style="margin: 0; font-size: 16pt; line-height: 1.5; color: #1e293b;">${q.question}</h3>
        </div>
        <div style="margin-${isAr ? 'right' : 'left'}: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          ${(q.options || []).map(opt => `
            <div style="padding: 15px 20px; border: 2px solid #cbd5e1; border-radius: 15px; font-size: 12pt; display: flex; align-items: center; gap: 15px;">
              <div style="width: 20px; height: 20px; border-radius: 50%; border: 3px solid #6366f1;"></div>
              <span>${opt}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    win.document.write(`
      <html dir="${isAr ? 'rtl' : 'ltr'}">
        <head><title>Printable Quiz - ${quizSettings.title}</title>${getCommonPdfStyle(!!isAr)}</head>
        <body>
          <div class="header-card">
            <h1>اختبار تقييم المستوى</h1>
            <div class="student-info">
               <div style="text-align: ${isAr ? 'right' : 'left'}">اسم الطالب: ................................................</div>
               <div style="text-align: ${isAr ? 'right' : 'left'}">المادة: ${(contexts || [])[0]?.title || 'مراجعة عامة'}</div>
               <div style="text-align: ${isAr ? 'right' : 'left'}">التاريخ: ${new Date().toLocaleDateString('ar-EG')}</div>
               <div style="text-align: ${isAr ? 'right' : 'left'}">الزمن: ${quizSettings.timeLimit} دقيقة</div>
            </div>
          </div>
          ${content}
          <div class="footer">منصة الطالب الذكي • عالمك التعليمي المتكامل • 2025</div>
        </body><script>window.onload=()=>window.print();</script></html>
    `);
    win.document.close();
  };

  const exportReviewPDF = () => {
    if ((quizQuestions || []).length === 0) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const isAr = (quizQuestions || [])[0]?.question.match(/[\u0600-\u06FF]/);
    const score = calculateScore();
    const total = quizQuestions.length;

    const content = (quizQuestions || []).map((q, i) => {
      const isCorrect = userAnswers[q.id] === q.correctAnswer;
      const userChoice = q.options[userAnswers[q.id]] !== undefined ? q.options[userAnswers[q.id]] : (isAr ? 'بدون إجابة' : 'No Answer');
      const correctChoice = q.options[q.correctAnswer];

      return `
        <div class="card" style="border-color: ${isCorrect ? '#10b981' : '#ef4444'};">
          <div style="display: flex; align-items: flex-start; margin-bottom: 20px;">
            <div class="q-num" style="background: ${isCorrect ? '#10b981' : '#ef4444'};">${i + 1}</div>
            <h3 style="margin: 0; font-size: 16pt; line-height: 1.5; color: #1e293b;">${q.question}</h3>
          </div>
          <div style="margin-${isAr ? 'right' : 'left'}: 50px;">
            <div style="padding: 10px; background: ${isCorrect ? '#f0fff4' : '#fff5f5'}; border-radius: 10px; margin-bottom: 10px; font-weight: bold;">
              ${isAr ? 'إجابتك:' : 'Your Answer:'} ${userChoice} ${isCorrect ? '✅' : '❌'}
            </div>
            ${!isCorrect ? `<div style="padding: 10px; background: #f0fdf4; border-radius: 10px; margin-bottom: 10px; font-weight: bold;">${isAr ? 'الإجابة الصحيحة:' : 'Correct Answer:'} ${correctChoice}</div>` : ''}
            <div style="padding: 15px; background: #fffbeb; border-radius: 10px; margin-top: 15px; font-size: 11pt; border: 1px solid #fef3c7;">
              <b>${isAr ? 'الشرح:' : 'Explanation:'}</b> ${q.explanation}
            </div>
          </div>
        </div>
      `;
    }).join('');

    win.document.write(`
      <html dir="${isAr ? 'rtl' : 'ltr'}">
        <head><title>Quiz Review - ${quizSettings.title}</title>${getCommonPdfStyle(!!isAr)}</head>
        <body>
          <div class="header-card">
            <h1>${isAr ? 'تقرير مراجعة الاختبار' : 'Quiz Review Report'}</h1>
            <div class="student-info">
               <div style="text-align: ${isAr ? 'right' : 'left'}">${isAr ? 'النتيجة النهائية:' : 'Final Score:'} ${score} من ${total}</div>
               <div style="text-align: ${isAr ? 'right' : 'left'}">${isAr ? 'النسبة:' : 'Percentage:'} ${Math.round((score / total) * 100)}%</div>
               <div style="text-align: ${isAr ? 'right' : 'left'}">${isAr ? 'المادة:' : 'Subject:'} ${(contexts || [])[0]?.title || (isAr ? 'مراجعة عامة' : 'General Review')}</div>
               <div style="text-align: ${isAr ? 'right' : 'left'}">${isAr ? 'التاريخ:' : 'Date:'} ${new Date().toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}</div>
            </div>
          </div>
          ${content}
          <div class="footer">${isAr ? 'منصة الطالب الذكي • تقرير مراجعة الأداء • 2025' : 'Smart Student Platform • Performance Review Report • 2025'}</div>
        </body><script>window.onload=()=>window.print();</script></html>
    `);
    win.document.close();
  };

  const exportFlashcardsPDF = () => {
    if ((flashcards || []).length === 0) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const isAr = (flashcards || [])[0]?.front.match(/[\u0600-\u06FF]/);

    const content = (flashcards || []).map((card, i) => `
      <div style="display: flex; gap: 0; margin-bottom: 30px; page-break-inside: avoid; border: 2px dashed #4f46e5; border-radius: 25px; overflow: hidden;">
        <div style="flex: 1; padding: 40px; background: #fff; position: relative; border-inline-end: 2px dashed #4f46e5; display: flex; flex-direction: column; justify-content: center; min-height: 220px; text-align: center;">
          <span style="position: absolute; top: 15px; ${isAr ? 'right' : 'left'}: 20px; font-size: 9pt; font-weight: 900; color: #4f46e5; opacity: 0.4;">المفهوم - ${i + 1}</span>
          <h3 style="margin: 0; font-size: 18pt; color: #1e293b;">${card.front}</h3>
        </div>
        <div style="flex: 1; padding: 40px; background: #f8fafc; position: relative; display: flex; flex-direction: column; justify-content: center; min-height: 220px; text-align: center;">
          <span style="position: absolute; top: 15px; ${isAr ? 'right' : 'left'}: 20px; font-size: 9pt; font-weight: 900; color: #64748b; opacity: 0.4;">الشرح / التعريف</span>
          <p style="margin: 0; font-size: 13pt; color: #334155; font-weight: bold; line-height: 1.6;">${card.back}</p>
        </div>
      </div>
    `).join('');

    win.document.write(`
      <html dir="${isAr ? 'rtl' : 'ltr'}">
        <head><title>Smart Flashcards Export</title>${getCommonPdfStyle(!!isAr)}</head>
        <body>
          <div class="header-card" style="margin-bottom: 50px;">
            <h1>بطاقات المراجعة الذكية</h1>
            <p style="font-weight: bold; color: #64748b; margin-top: 10px;">قم بطباعة الورقة وقص البطاقات من الخطوط المتقطعة</p>
          </div>
          <div style="display: grid; grid-template-columns: 1fr; gap: 0;">${content}</div>
          <div class="footer">توليد تلقائي بواسطة المساعد الذكي - منصة الطالب الذكي 2025</div>
        </body><script>window.onload=()=>window.print();</script></html>
    `);
    win.document.close();
  };

  const generateCards = async () => {
    if ((contexts || []).length === 0) return alert("ارفع ملفاً أولاً");
    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
      const context = (contexts || []).map(c => c.data).join('\n\n');
      const prompt = `تعرف على لغة النص وأنشئ 10 بطاقات ذاكرة تعليمية JSON: ${context.substring(0, 8000)}. التنسيق: [{"front":"..","back":".."}]`;
      const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt, config: { responseMimeType: "application/json" } });
      const parsed = JSON.parse(res.text || '[]');
      setFlashcards(Array.isArray(parsed) ? parsed : []);
      setCurrentCardIdx(0);
      setIsFlipped(false);
    } catch (e) { alert("فشل التوليد"); } finally { setLoading(false); }
  };

  const generateInfographic = async () => {
    if ((contexts || []).length === 0) return alert("ارفع ملفاً أولاً");
    setIsGeneratingInfo(true);
    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
      const context = (contexts || []).map(c => c.data).join('\n\n');
      const prompt = `حول النص التالي إلى إنفوجرافيك JSON احترافي للمقارنة أو التوضيح: ${context.substring(0, 8000)}. التنسيق: {"title":"..","subtitle":"..","leftSide":{"name":"..","items":[{"label":"..","desc":".."}]},"rightSide":{"name":"..","items":[{"label":"..","desc":".."}]},"summary":"..","imagePrompt":"Detailed English artistic prompt to generate a 4k educational flat illustration explaining this academic topic, high contrast, clean style"}`;
      const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt, config: { responseMimeType: "application/json" } });
      const data = JSON.parse(res.text || '{}');

      // Generate Visual for Infographic
      if (data.imagePrompt) {
        try {
          const imgRes = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: `Professional educational flat vector illustration, scientific look, no text: ${data.imagePrompt}` }] },
            config: { imageConfig: { aspectRatio: "16:9" } }
          });
          const imgPart = imgRes.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
          if (imgPart?.inlineData) {
            data.imageUrl = `data:image/png;base64,${imgPart.inlineData.data}`;
          }

        } catch (ie) { console.error("Img gen failed", ie); }
      }

      setInfoData(data);
    } catch (e) { alert("فشل التحليل"); } finally { setLoading(false); setIsGeneratingInfo(false); }
  };

  const exportInfographicPDF = () => {
    if (!infoData) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const isAr = infoData.title.match(/[\u0600-\u06FF]/);

    win.document.write(`
      <html dir="${isAr ? 'rtl' : 'ltr'}">
        <head><title>Infographic Poster - ${infoData.title}</title>${getCommonPdfStyle(!!isAr)}
        <style>
          .grid-info { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
          .side-box { padding: 35px; border-radius: 40px; border: 4px solid; position: relative; }
          .left { border-color: #f43f5e; background: #fff1f2; }
          .right { border-color: #4f46e5; background: #f8faff; }
          .summary-box { margin-top: 50px; background: #0f172a; color: #fff; padding: 45px; border-radius: 50px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
          .main-img { width: 100%; height: 400px; object-fit: cover; border-radius: 40px; margin-bottom: 50px; border: 10px solid #f1f5f9; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
          .badge { position: absolute; top: -15px; left: 30px; background: #fff; padding: 5px 20px; border-radius: 15px; font-weight: 900; font-size: 10pt; border: 2px solid; }
        </style></head>
        <body>
          <div style="text-align: center; margin-bottom: 50px;">
            <h1 style="font-size: 36pt; color: #1e293b; margin: 0;">${infoData.title}</h1>
            <p style="font-size: 16pt; color: #64748b; font-weight: bold; margin-top: 10px;">لوحة تعليمية تفاعلية مولدة بالذكاء الاصطناعي</p>
          </div>
          
          ${infoData.imageUrl ? `<img src="${infoData.imageUrl}" class="main-img" />` : ''}

          <div class="grid-info">
            <div class="side-box left">
               <div class="badge" style="border-color: #f43f5e; color: #e11d48;">الجانب الأول</div>
               <h2 style="color: #e11d48; border-bottom: 3px solid #fda4af; padding-bottom: 15px; font-size: 20pt;">${infoData.leftSide?.name}</h2>
               ${(infoData.leftSide?.items || []).map(it => `<div style="margin-top:25px;"><b>• ${it.label}:</b><br/><span style="font-size:11pt; color: #475569;">${it.desc}</span></div>`).join('')}
            </div>
            <div class="side-box right">
               <div class="badge" style="border-color: #4f46e5; color: #4f46e5;">الجانب الثاني</div>
               <h2 style="color: #4f46e5; border-bottom: 3px solid #c7d2fe; padding-bottom: 15px; font-size: 20pt;">${infoData.rightSide?.name}</h2>
               ${(infoData.rightSide?.items || []).map(it => `<div style="margin-top:25px;"><b>• ${it.label}:</b><br/><span style="font-size:11pt; color: #475569;">${it.desc}</span></div>`).join('')}
            </div>
          </div>

          <div class="summary-box">
            <h3 style="color: #818cf8; margin-bottom: 20px; font-size: 18pt;">الخلاصة العلمية:</h3>
            <p style="font-size: 15pt; line-height: 1.8; color: #e2e8f0;">${infoData.summary}</p>
          </div>
          <div class="footer">منصة الطالب الذكي • عالمك التعليمي المتكامل • 2025</div>
        </body><script>window.onload=()=>window.print();</script></html>
    `);
    win.document.close();
  };

  const handleSubmit = () => {
    setQuizStep('result');
  };

  const handlePublishQuiz = async () => {
    if (!quizQuestions.length) return;
    setLoading(true);
    try {
      const quizId = 'quiz_' + Math.random().toString(36).substr(2, 9);

      const quiz: PublishedQuiz = {
        id: quizId,
        title: quizSettings.title || 'Smart Revision Quiz',        // ✅ REQUIRED top-level
        creatorId: `current_user`,
        settings: {
          title: quizSettings.title || 'Smart Revision Quiz',     // ✅ For settings
          timeLimit: quizSettings.timeLimit,
          showResults: true,                                     // ✅ REQUIRED  
          shuffleQuestions: true,
        },
        questions: quizQuestions.map(q => ({
          id: q.id,
          type: q.type as any,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation
        })),
        createdAt: new Date().toISOString()
      };

      // Save to database
      await db.publishQuiz(quiz);
      setPublishedQuizId(quizId);

      // Build share link
      const shareUrl = `${window.location.origin}${window.location.pathname}#share=${quizId}`;

      // Attempt to copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert(lang === 'ar' ? "تم نشر الاختبار ونسخ الرابط بنجاح! شاركه مع زملائك الآن." : "Quiz published and link copied successfully! Share it now.");
      } catch (err) {
        // Fallback copy logic
        const textArea = document.createElement("textarea");
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert(lang === 'ar' ? "تم النشر! انسخ هذا الرابط: " + shareUrl : "Published! Copy this link: " + shareUrl);
      }
    } catch (e) {
      alert("فشل نشر الاختبار.");
    } finally {
      setLoading(false);
    }
  };



  const currentQuestion = quizQuestions[currentQuestionIdx];

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-10rem)] ${lang === 'ar' ? 'rtl' : 'ltr'} font-cairo`}>
      <div className="lg:col-span-3 space-y-4 flex flex-col overflow-y-auto no-scrollbar">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-800">
          <div className="flex flex-col gap-2">
            <button onClick={() => setActiveTab('chat')} className={`w-full flex items-center gap-3 p-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'chat' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}><MessageSquare size={18} /> الدردشة والتلخيص</button>
            <button onClick={() => { setActiveTab('quiz'); setQuizStep('setup'); setPublishedQuizId(null); }} className={`w-full flex items-center gap-3 p-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'quiz' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}><ClipboardCheck size={18} /> الاختبار الذكي</button>
            <button onClick={() => setActiveTab('flashcards')} className={`w-full flex items-center gap-3 p-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'flashcards' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}><Layers size={18} /> بطاقات المذاكرة</button>
            <button onClick={() => setActiveTab('infographic')} className={`w-full flex items-center gap-3 p-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'infographic' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}><PieChart size={18} /> الإنفوجرافيك</button>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[2.5rem] border border-indigo-100 dark:border-slate-800 flex flex-col gap-4">
          <h4 className="text-[10px] font-black text-slate-400 uppercase px-2">{t.ai_source_active} ({(contexts || []).length})</h4>
          <div className="flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar">
            {(contexts || []).map(c => (
              <div key={c.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-indigo-50 flex items-center justify-between group shadow-sm">
                <div className="flex items-center gap-2 truncate"><FileText size={14} className="text-indigo-500" /><span className="text-[11px] font-bold truncate max-w-[140px]">{c.title}</span></div>
                <button onClick={() => setContexts(prev => prev.filter(x => x.id !== c.id))} className="text-rose-400 opacity-0 group-hover:opacity-100"><X size={14} /></button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2">
            <label className="w-full flex items-center justify-center gap-2 p-4 bg-indigo-600 text-white rounded-2xl text-[11px] font-black cursor-pointer shadow-lg hover:bg-indigo-700 transition-all"><PlusCircle size={16} /> رفع ملفات <input type="file" multiple className="hidden" accept=".pdf,.txt" onChange={handleFileUpload} /></label>
            <button onClick={() => setShowLibraryModal(true)} className="w-full flex items-center justify-center gap-2 p-4 bg-white border border-indigo-100 text-indigo-600 rounded-2xl text-[11px] font-black hover:bg-slate-50 transition-all"><Library size={16} /> المكتبة</button>
          </div>
        </div>
      </div>

      <div className="lg:col-span-9 bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl flex flex-col border border-slate-100 dark:border-slate-800 overflow-hidden relative">
        {activeTab === 'chat' && (
          <>
            <div className="bg-slate-50/50 dark:bg-slate-800/50 px-10 py-5 border-b flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-4"><div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><Brain size={24} /></div><div><h4 className="text-sm font-black">المعلم الخصوصي الذكي</h4><p className="text-[9px] font-bold text-slate-400">تحليل فوري ونقاش أكاديمي</p></div></div>
              <button onClick={() => window.print()} className="p-3 text-slate-400 hover:text-indigo-600 bg-white rounded-xl border shadow-sm"><Printer size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar bg-white dark:bg-slate-950/20">
              {(messages || []).length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-20 text-center scale-90">
                  <Brain size={120} className="mb-8 text-indigo-400" />
                  <h3 className="text-3xl font-black">أنا جاهز لشرح دروسك...</h3>
                  <p className="font-bold text-lg max-w-xs mt-2">ارفع أي ملف وسنقوم بتحليله معاً فوراً.</p>
                </div>
              )}
              {(messages || []).map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                  <div className={`max-w-[85%] p-6 rounded-[2.5rem] text-[13px] font-bold leading-relaxed shadow-sm border border-slate-50 dark:border-slate-800 ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-50 dark:bg-slate-800 dark:text-white rounded-bl-none'}`}>{m.text}</div>
                </div>
              ))}
              {loading && <Loader2 className="animate-spin text-indigo-600 mx-auto i" />}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-8 border-t dark:border-slate-800">
              <div className="flex gap-4 bg-slate-50 dark:bg-slate-950 p-2 rounded-[2.5rem] border shadow-inner">
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 px-8 py-4 bg-transparent outline-none font-bold text-base dark:text-white" placeholder="اسألني أي شيء حول الملفات المرفوعة..." />
                <button onClick={handleSendMessage} disabled={loading || !input.trim() || (contexts || []).length === 0} className="w-14 h-14 bg-indigo-600 text-white rounded-3xl flex items-center justify-center shadow-lg active:scale-90 transition-all disabled:opacity-30"><Send size={24} /></button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'quiz' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {quizStep === 'setup' && (
              <div className="flex-1 p-12 overflow-y-auto flex flex-col items-center justify-center text-center">
                <div className="max-w-2xl w-full space-y-8">
                  <div className="w-24 h-24 bg-indigo-600 text-white rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl mb-4"><Sparkles size={48} /></div>
                  <h3 className="text-4xl font-black">{t.ai_quiz_title}</h3>
                  <p className="text-slate-500 font-bold">حدد إعدادات الاختبار المخصص لمستواك</p>

                  <div className="bg-slate-50 dark:bg-slate-800/50 p-10 rounded-[3.5rem] grid grid-cols-3 gap-6 text-right shadow-inner border dark:border-slate-700">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">عدد الأسئلة</label>
                      <input type="number" value={quizSettings.count} onChange={e => setQuizSettings({ ...quizSettings, count: parseInt(e.target.value) || 5 })} className="w-full p-5 bg-white dark:bg-slate-900 rounded-3xl border-none font-black text-center text-2xl shadow-sm" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">المدة (د)</label>
                      <input type="number" value={quizSettings.timeLimit} onChange={e => setQuizSettings({ ...quizSettings, timeLimit: parseInt(e.target.value) || 10 })} className="w-full p-5 bg-white dark:bg-slate-900 rounded-3xl border-none font-black text-center text-2xl shadow-sm" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">نوع الأسئلة</label>
                      <select value={quizSettings.type} onChange={e => setQuizSettings({ ...quizSettings, type: e.target.value as any })} className="w-full p-5 bg-white dark:bg-slate-900 rounded-3xl border-none font-black shadow-sm appearance-none text-center">
                        <option value="mixed">مختلط</option>
                        <option value="multiple">اختياري</option>
                        <option value="boolean">صح/خطأ</option>
                      </select>
                    </div>
                  </div>

                  <button onClick={generateAITest} disabled={quizLoading || (contexts || []).length === 0} className="w-full py-8 bg-indigo-600 text-white rounded-[2.5rem] font-black text-2xl shadow-xl flex items-center justify-center gap-4 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50">
                    {quizLoading ? <Loader2 className="animate-spin" size={32} /> : <Sparkles size={32} />} {lang === 'ar' ? 'ابدأ التحدي التفاعلي الآن' : 'Start Interaction Now'}
                  </button>
                </div>
              </div>
            )}

            {quizStep === 'solving' && (quizQuestions || []).length > 0 && (
              <div className="flex-1 flex flex-col h-full bg-slate-50/10">
                <div className="px-10 py-6 bg-white border-b flex justify-between items-center shadow-md">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-xl shadow-lg">{currentQuestionIdx + 1}</div>
                    <div><h4 className="font-black">جاري الاختبار...</h4><div className="w-40 h-2 bg-slate-100 dark:bg-slate-800 rounded-full mt-1 overflow-hidden"><div className="h-full bg-indigo-600" style={{ width: `${((currentQuestionIdx + 1) / (quizQuestions || []).length) * 100}%` }}></div></div></div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={exportBlankQuizPDF} className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-black text-[10px] flex items-center gap-2 shadow-sm hover:bg-indigo-600 hover:text-white transition-all"><FileSignature size={14} /> تصدير اختبار ورقي فارغ</button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-12">
                  <div className="max-w-3xl mx-auto space-y-12 animate-in slide-in-from-bottom-4">
                    <h2 className="text-3xl font-black text-center leading-relaxed">{currentQuestion?.question}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {(currentQuestion?.options || []).map((opt, i) => (
                        <button key={i} onClick={() => setUserAnswers({ ...userAnswers, [currentQuestion.id]: i })} className={`p-8 rounded-[3rem] text-right font-black text-lg transition-all border-4 flex items-center gap-6 shadow-lg ${userAnswers[currentQuestion.id] === i ? 'border-indigo-600 bg-indigo-50' : 'bg-white hover:border-indigo-100'}`}>
                          <div className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0 font-black ${userAnswers[currentQuestion.id] === i ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>{String.fromCharCode(65 + i)}</div><span className="flex-1">{opt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-8 bg-white border-t flex justify-between items-center shadow-lg">
                  <button onClick={() => setCurrentQuestionIdx(i => Math.max(0, i - 1))} disabled={currentQuestionIdx === 0} className="px-10 py-4 bg-slate-100 rounded-2xl font-black flex items-center gap-2"><ChevronRight size={20} /> السابق</button>
                  {currentQuestionIdx === (quizQuestions || []).length - 1 ? (
                    <button onClick={handleSubmit} disabled={userAnswers[currentQuestion?.id] === undefined} className="px-16 py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-xl">تسليم الإجابات 🏁</button>
                  ) : (
                    <button onClick={() => setCurrentQuestionIdx(i => i + 1)} disabled={userAnswers[currentQuestion?.id] === undefined} className="px-16 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl">التالي <ChevronLeft size={20} /></button>
                  )}
                </div>
              </div>
            )}

            {quizStep === 'result' && (
              <div className="flex-1 p-12 flex flex-col items-center justify-center text-center animate-in zoom-in space-y-12">
                <div className="w-32 h-32 bg-indigo-100 rounded-full flex items-center justify-center mx-auto shadow-2xl border-[10px] border-white animate-bounce"><Trophy size={64} className="text-indigo-600" /></div>
                <h2 className="text-6xl font-black">تقرير المراجعة النهائي 🎯</h2>

                <div className="grid grid-cols-2 gap-8 w-full max-w-2xl">
                  <div className="bg-white dark:bg-slate-800 p-10 rounded-[3.5rem] shadow-xl border-2 border-slate-100 flex flex-col items-center group hover:scale-105 transition-all">
                    <span className="text-8xl font-black text-slate-800 leading-none">{(quizQuestions || []).length}</span>
                    <span className="text-[14px] font-black text-slate-400 mt-4 uppercase tracking-[0.2em]">إجمالي الأسئلة</span>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-10 rounded-[3.5rem] shadow-xl border-2 border-emerald-100 flex flex-col items-center group hover:scale-105 transition-all">
                    <span className="text-8xl font-black text-emerald-500 leading-none">{calculateScore()}</span>
                    <span className="text-[14px] font-black text-slate-400 mt-4 uppercase tracking-[0.2em]">الإجابات الصحيحة</span>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-4 pt-10">
                  <button onClick={() => setQuizStep('setup')} className="px-10 py-5 bg-indigo-600 text-white rounded-3xl font-black shadow-xl flex items-center gap-3 transition-all hover:scale-105">
                    <RefreshCcw size={22} /> بدء اختبار جديد
                  </button>
                  <button onClick={() => setQuizStep('review')} className="px-10 py-5 bg-indigo-100 text-indigo-600 rounded-3xl font-black shadow-xl flex items-center gap-3 transition-all hover:scale-105">
                    <Eye size={22} /> مراجعة الإجابات والشرح
                  </button>
                  <button onClick={handlePublishQuiz} className="px-10 py-5 bg-white border-2 border-emerald-600 text-emerald-600 rounded-3xl font-black shadow-xl flex items-center gap-3 transition-all hover:scale-105 hover:bg-emerald-50">
                    <Share2 size={22} /> نشر الاختبار ونسخ الرابط
                  </button>
                </div>
              </div>
            )}

            {quizStep === 'review' && (
              <div className="flex-1 flex flex-col h-full bg-slate-50/30">
                <div className="px-10 py-6 border-b flex justify-between items-center bg-white shadow-sm">
                  <div><h4 className="text-2xl font-black">تحليل الأسئلة بالتفصيل 🎯</h4></div>
                  <div className="flex gap-2">
                    <button onClick={exportReviewPDF} className="px-6 py-3 bg-amber-500 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-lg hover:bg-amber-600 transition-all"><Printer size={18} /> طباعة تقرير الإجابات (PDF)</button>
                    <button onClick={() => setQuizStep('result')} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"><X size={20} /></button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-12 space-y-10 custom-scrollbar">
                  {(quizQuestions || []).map((q, i) => {
                    const isCorrect = userAnswers[q.id] === q.correctAnswer;
                    return (
                      <div key={i} className="bg-white p-10 rounded-[2.5rem] border-2 border-slate-100 shadow-xl overflow-hidden animate-in slide-in-from-bottom-4">
                        <div className="flex items-center gap-6 mb-8"><div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg ${isCorrect ? 'bg-emerald-500' : 'bg-rose-500'}`}>{i + 1}</div><h4 className="text-xl font-black">{q.question}</h4></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                          {(q.options || []).map((opt, oi) => {
                            const isChoice = userAnswers[q.id] === oi;
                            const isAns = oi === q.correctAnswer;
                            return (<div key={oi} className={`p-5 rounded-2xl border-2 font-bold text-sm flex items-center gap-4 ${isAns ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : isChoice ? 'bg-rose-50 border-rose-500 text-rose-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}><div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black ${isAns ? 'bg-emerald-500 text-white' : isChoice ? 'bg-rose-500 text-white' : 'bg-slate-200'}`}>{String.fromCharCode(65 + oi)}</div>{opt}</div>);
                          })}
                        </div>
                        <div className="p-6 bg-amber-50/50 border-t border-amber-100 flex items-start gap-4"><div className="w-10 h-10 bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 rounded-xl"><Info size={20} /></div><p className="text-sm font-bold text-slate-700 leading-relaxed">{q.explanation}</p></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'flashcards' && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 overflow-y-auto">
            {(flashcards || []).length === 0 ? (
              <div className="text-center space-y-8 animate-in fade-in">
                <Layers size={100} className="text-indigo-400 mx-auto" />
                <h2 className="text-3xl font-black">بطاقات المذاكرة الذكية</h2>
                <p className="text-slate-500 font-bold max-w-sm mx-auto">سأقوم بتلخيص مادتك في بطاقات وجه وخلفية لمساعدتك على الحفظ.</p>
                <button onClick={generateCards} disabled={loading || (contexts || []).length === 0} className="px-12 py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50">
                  {loading ? <Loader2 className="animate-spin mx-auto" /> : "توليد البطاقات الآن"}
                </button>
              </div>
            ) : (
              <div className="w-full max-w-md animate-in zoom-in">
                <div onClick={() => setIsFlipped(!isFlipped)} className={`relative h-96 w-full cursor-pointer transition-all duration-700 preserve-3d shadow-[0_40px_80px_rgba(0,0,0,0.15)] rounded-[3.5rem] ${isFlipped ? 'rotate-y-180' : ''}`}>
                  <div className="absolute inset-0 bg-white dark:bg-slate-800 border-[10px] border-indigo-50 dark:border-indigo-950 flex flex-col items-center justify-center p-12 text-center backface-hidden rounded-[3.5rem]">
                    <span className="text-[10px] font-black text-indigo-400 uppercase mb-6">المصطلح / المفهوم</span>
                    <h3 className="text-3xl font-black leading-tight">{flashcards[currentCardIdx]?.front}</h3>
                    <div className="mt-12 flex items-center gap-2 text-slate-300 font-black text-[10px]"><RefreshCcw size={12} /> انقر للقلب</div>
                  </div>
                  <div className="absolute inset-0 bg-indigo-600 text-white flex flex-col items-center justify-center p-12 text-center backface-hidden rotate-y-180 rounded-[3.5rem] shadow-inner">
                    <span className="text-[10px] font-black text-indigo-300 uppercase mb-6">التعريف / الشرح</span>
                    <p className="text-xl font-bold leading-relaxed">{flashcards[currentCardIdx]?.back}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-12 px-6">
                  <button onClick={() => { setCurrentCardIdx(i => Math.max(0, i - 1)); setIsFlipped(false); }} className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-90 transition-all border border-indigo-50"><ChevronRight size={24} /></button>
                  <div className="text-center"><p className="text-xl font-black">{currentCardIdx + 1}</p><p className="text-[10px] font-black text-slate-400">من أصل {(flashcards || []).length}</p></div>
                  <button onClick={() => { setCurrentCardIdx(i => Math.min((flashcards || []).length - 1, i + 1)); setIsFlipped(false); }} className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-90 transition-all border border-indigo-50"><ChevronLeft size={24} /></button>
                </div>
                <div className="flex gap-2 mt-8">
                  <button onClick={exportFlashcardsPDF} className="flex-1 py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-xs hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2 border-2 border-indigo-100 shadow-sm"><Printer size={16} /> طباعة البطاقات (PDF)</button>
                  <button onClick={() => setFlashcards([])} className="p-4 bg-rose-50 text-rose-400 rounded-2xl hover:bg-rose-500 hover:text-white transition-all"><Undo2 size={20} /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'infographic' && (
          <div className="flex-1 flex flex-col p-12 overflow-y-auto">
            {!infoData ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in">
                <PieChart size={100} className="text-indigo-400" />
                <h2 className="text-3xl font-black">الإنفوجرافيك الذكي</h2>
                <p className="text-slate-500 font-bold max-w-sm mx-auto">سأقوم بتحويل النصوص المعقدة إلى هيكل بصري منظم للمقارنة والاستيعاب السريع.</p>
                <button onClick={generateInfographic} disabled={loading || (contexts || []).length === 0} className="px-12 py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-xl">
                  {loading ? <Loader2 className="animate-spin mx-auto" /> : "تحليل وبناء الإنفوجرافيك"}
                </button>
              </div>
            ) : (
              <div className="space-y-12 animate-in zoom-in">
                <div className="flex justify-between items-center">
                  <div className="text-right space-y-2">
                    <h2 className="text-4xl font-black">{infoData.title}</h2>
                    <p className="text-slate-500 font-bold text-lg">{infoData.subtitle}</p>
                  </div>
                  <button onClick={exportInfographicPDF} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg flex items-center gap-3 transition-all hover:scale-105">
                    <Printer size={20} /> تصدير اللوحة (PDF)
                  </button>
                </div>

                {infoData.imageUrl && (
                  <div className="w-full h-80 rounded-[4rem] overflow-hidden shadow-2xl border-8 border-white dark:border-slate-800">
                    <img src={infoData.imageUrl} className="w-full h-full object-cover" alt="Visual Concept" />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="p-10 bg-rose-50 rounded-[3.5rem] border-2 border-rose-100 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full bg-rose-500 opacity-20"></div>
                    <h3 className="text-2xl font-black text-rose-600 mb-8 border-b-2 border-rose-200 pb-4">{infoData.leftSide?.name}</h3>
                    <div className="space-y-6">
                      {(infoData.leftSide?.items || []).map((item, i) => (
                        <div key={i} className="flex gap-4">
                          <div className="w-8 h-8 bg-rose-500 text-white rounded-full flex items-center justify-center shrink-0 shadow-lg text-[10px] font-black">{i + 1}</div>
                          <div><b className="block text-lg mb-1">{item.label}</b><span className="text-xs text-slate-500 font-bold leading-relaxed">{item.desc}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="p-10 bg-indigo-50 rounded-[3.5rem] border-2 border-indigo-100 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full bg-indigo-600 opacity-20"></div>
                    <h3 className="text-2xl font-black text-indigo-600 mb-8 border-b-2 border-indigo-200 pb-4">{infoData.rightSide?.name}</h3>
                    <div className="space-y-6">
                      {(infoData.rightSide?.items || []).map((item, i) => (
                        <div key={i} className="flex gap-4">
                          <div className="w-8 h-8 bg-indigo-500 text-white rounded-full flex items-center justify-center shrink-0 shadow-lg text-[10px] font-black">{i + 1}</div>
                          <div><b className="block text-lg mb-1">{item.label}</b><span className="text-xs text-slate-500 font-bold leading-relaxed">{item.desc}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-12 bg-slate-900 text-white rounded-[4rem] shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                  <div className="relative z-10">
                    <h4 className="font-black text-indigo-400 text-xs uppercase mb-6 flex items-center gap-2 tracking-widest"><Brain size={18} /> خلاصة المعلم الخصوصي:</h4>
                    <p className="text-2xl font-bold leading-relaxed text-indigo-50">{infoData.summary}</p>
                  </div>
                </div>
                <button onClick={() => setInfoData(null)} className="w-full py-6 text-slate-400 font-black text-xs hover:text-rose-500 transition-all uppercase tracking-[0.3em]"><Undo2 className="inline ml-2" size={14} /> تحليل محتوى دراسي جديد</button>
              </div>
            )}
          </div>
        )}
      </div>

      {showLibraryModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[4rem] p-12 shadow-2xl relative animate-in zoom-in border-4 border-white/10">
            <button onClick={() => setShowLibraryModal(false)} className="absolute top-12 left-12 p-3 text-slate-400 hover:text-rose-500 rounded-2xl"><X size={32} /></button>
            <div className="text-center mb-12"><div className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6"><Library size={48} /></div><h3 className="text-4xl font-black dark:text-white">الاستيراد من المكتبة</h3></div>
            <div className="max-h-[450px] overflow-y-auto space-y-8 custom-scrollbar">
              {(subjects || []).map(sub => (
                <div key={sub.id} className="space-y-4">
                  <div className="flex items-center gap-4 px-6"><div className={`w-3.5 h-3.5 rounded-full ${sub.color} shadow-lg`}></div><span className="text-[12px] font-black text-slate-400 uppercase tracking-widest">{sub.name}</span></div>
                  <div className="grid grid-cols-1 gap-4">
                    {(sub.lectures || []).map(lec => (
                      <button key={lec.id} onClick={() => { setContexts(prev => [...prev, { id: Math.random(), title: lec.title, data: lec.content, type: 'text' }]); setShowLibraryModal(false); }} className="flex items-center justify-between p-6 bg-slate-50 dark:bg-slate-800 rounded-3xl border-2 border-transparent hover:border-indigo-500 transition-all shadow-md text-right group">
                        <div className="flex items-center gap-5"><div className="w-12 h-12 bg-white dark:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-colors shadow-sm"><FileText size={28} /></div><span className="font-black text-lg dark:text-white">{lec.title}</span></div>
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

      <style>{`
        .rotate-y-180 { transform: rotateY(180deg); }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #4f46e5; border-radius: 10px; }
      `}</style>
    </div>
  );
};
