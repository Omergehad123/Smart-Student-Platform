
import React, { useState, useEffect } from 'react';
import {
  Sparkles, Presentation, Download, Wand2, Loader2,
  Upload, CheckCircle2, FileUp, ImageIcon,
  ArrowRight, ArrowLeft, Image as LucideImage,
  FileDown, X
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import PptxGenJS from 'pptxgenjs';
import { translations } from '../i18n';

interface Slide {
  title: string;
  content: string[];
  imagePrompt: string;
  imageUrl?: string;
  layout: 'split' | 'overlay' | 'grid';
}

export const AICreator: React.FC<{ lang?: 'ar' | 'en' }> = ({ lang = 'ar' }) => {
  const t = translations[lang];
  const [topic, setTopic] = useState('');
  const [slideCount, setSlideCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [generationStep, setGenerationStep] = useState<'idle' | 'text' | 'images' | 'completed'>('idle');
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [project, setProject] = useState<{ title: string; slides: Slide[] } | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  useEffect(() => {
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
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingFile(true);
    setFileName(file.name);
    try {
      if (file.type === 'application/pdf') {
        const pdfjs = (window as any).pdfjsLib;
        if (!pdfjs) throw new Error("PDF.js not loaded");
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += content.items.map((it: any) => it.str).join(' ') + '\n';
        }
        setFileContent(fullText);
      } else {
        const text = await file.text();
        setFileContent(text);
      }
    } catch (err) {
      alert("خطأ في معالجة الملف.");
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim() && !fileContent) return alert("يرجى إدخال عنوان أو رفع ملف مرجعي.");
    setLoading(true);
    setGenerationStep('text');

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY || '' });
      const prompt = `أنت خبير في تصميم العروض التقديمية التعليمية. قم بإنشاء محتوى عرض تقديمي عن: "${topic || 'الملف المرفق'}". 
      عدد الشرائح المطلوبة: ${slideCount}. 
      اللغة: ${lang === 'ar' ? 'العربية' : 'الإنجليزية'}.
      المحتوى المرجعي: ${fileContent?.substring(0, 10000) || 'لا يوجد، اعتمد على معلوماتك.'}
      
      يجب أن يكون الرد JSON فقط بهذا التنسيق:
      {
        "slides": [
          {
            "title": "عنوان الشريحة",
            "content": ["نقطة 1", "نقطة 2", "نقطة 3"],
            "imagePrompt": "Detailed descriptive English prompt for educational illustration (NO TEXT)",
            "layout": "split"
          }
        ]
      }`;

      const textRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(textRes.text || '{}');
      let slides: Slide[] = data.slides || [];

      setGenerationStep('images');
      const finalSlides: Slide[] = [];

      for (let i = 0; i < slides.length; i++) {
        setCurrentImgIndex(i + 1);
        const slide = slides[i];
        try {
          const imgRes = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: `Professional educational illustration, 4k, cinematic lighting, strictly NO TEXT on image: ${slide.imagePrompt}` }] },
          });

          let b64 = "";
          const parts = imgRes.candidates?.[0]?.content?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.inlineData) b64 = `data:image/png;base64,${part.inlineData.data}`;
            }
          }
          finalSlides.push({ ...slide, imageUrl: b64 });
        } catch (e) {
          finalSlides.push(slide);
        }
      }

      setProject({ title: topic || fileName || "Presentation", slides: finalSlides });
      setGenerationStep('completed');
    } catch (e) {
      alert("فشل في توليد العرض التقديمي.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPPTX = () => {
    if (!project) return;
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';

    project.slides.forEach((slide) => {
      const s = pptx.addSlide();
      s.background = { color: 'F8FAFC' };

      s.addText(slide.title, {
        x: 0.5, y: 0.4, w: '90%', h: 0.8,
        fontSize: 24, color: '4F46E5', bold: true, align: lang === 'ar' ? 'right' : 'left', fontFace: 'Cairo'
      });

      slide.content.forEach((text, idx) => {
        s.addText(text, {
          x: lang === 'ar' ? 4.5 : 0.5, y: 1.5 + (idx * 0.5), w: 5, h: 0.5,
          fontSize: 14, color: '334155', align: lang === 'ar' ? 'right' : 'left', fontFace: 'Cairo',
          bullet: { type: 'number' }
        });
      });

      if (slide.imageUrl) {
        s.addImage({
          data: slide.imageUrl,
          x: lang === 'ar' ? 0.5 : 5.5, y: 1.4, w: 4, h: 3.5,
          sizing: { type: 'contain', w: 4, h: 3.5 }
        });
      }
    });

    pptx.writeFile({ fileName: `${project.title}.pptx` });
  };

  const handleDownloadPDF = () => {
    if (!project) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const slidesHtml = project.slides.map((slide, i) => `
      <div class="slide-container" style="page-break-after: always; min-height: 100vh; padding: 40px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: flex-start; background: #ffffff;">
        <h2 style="color: #4f46e5; font-size: 28pt; margin-bottom: 40px; border-bottom: 4px solid #4f46e5; padding-bottom: 15px; font-weight: 900; font-family: 'Cairo', sans-serif;">${slide.title}</h2>
        <div style="display: flex; gap: 50px; flex: 1; align-items: flex-start;">
          <div style="flex: 1.2;">
            <ul style="list-style-type: none; padding: 0; margin: 0;">
              ${slide.content.map(point => `
                <li style="font-size: 16pt; margin-bottom: 20px; color: #334155; position: relative; padding-${lang === 'ar' ? 'right' : 'left'}: 30px; line-height: 1.6; font-weight: 700; font-family: 'Cairo', sans-serif;">
                  <span style="position: absolute; ${lang === 'ar' ? 'right' : 'left'}: 0; top: 12px; width: 12px; height: 12px; background: #4f46e5; border-radius: 50%;"></span>
                  ${point}
                </li>
              `).join('')}
            </ul>
          </div>
          <div style="flex: 1; text-align: center;">
            ${slide.imageUrl ? `<img src="${slide.imageUrl}" style="max-width: 100%; max-height: 450px; border-radius: 25px; border: 1px solid #e2e8f0; box-shadow: 0 15px 35px rgba(0,0,0,0.05);" />` : ''}
          </div>
        </div>
        <div style="margin-top: auto; padding-top: 20px; text-align: center; color: #94a3b8; font-size: 12pt; border-top: 1px solid #f1f5f9; font-family: 'Cairo', sans-serif;">
           <b>${project.title}</b> | ${lang === 'ar' ? 'الشريحة' : 'Slide'} ${i + 1}
        </div>
      </div>
    `).join('');

    printWindow.document.write(`
      <html dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
        <head>
          <title>${project.title} - Export PDF</title>
          <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
          <style>
            body { margin: 0; padding: 0; background: #f8fafc; font-family: 'Cairo', sans-serif; }
            @media print {
              body { background: white; }
              .slide-container { margin: 0 !important; border: none !important; height: 100vh !important; page-break-after: always; }
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="background:#4f46e5; color:white; padding:15px; text-align:center;">
             <button onclick="window.print()" style="background:white; color:#4f46e5; border:none; padding:10px 25px; border-radius:12px; font-weight:900;">إبدأ الطباعة</button>
          </div>
          ${slidesHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className={`flex flex-col space-y-10 animate-in fade-in duration-700 font-cairo pb-32 ${lang === 'ar' ? 'rtl' : 'ltr'}`}>
      <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-slate-800 space-y-8 relative overflow-hidden">
        <div className="text-center space-y-2">
          <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white shadow-xl mx-auto mb-4">
            <Presentation size={36} />
          </div>
          <h2 className="text-3xl font-black dark:text-white leading-tight">{t.creator_title}</h2>
          <p className="text-slate-500 font-bold text-sm">{t.creator_desc}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-6 space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-4">{t.creator_topic_label}</label>
            <input value={topic} onChange={e => setTopic(e.target.value)} className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-base font-black focus:ring-4 focus:ring-indigo-100 border-none dark:text-white transition-all" placeholder="عنوان العرض..." />
          </div>
          <div className="lg:col-span-2 space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-4">{t.creator_slides_label}</label>
            <input type="number" min="1" max="25" value={slideCount} onChange={e => setSlideCount(Math.max(1, parseInt(e.target.value) || 10))} className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-center text-xl font-black focus:ring-4 focus:ring-indigo-100 border-none dark:text-white transition-all" />
          </div>
          <div className="lg:col-span-4 flex gap-2">
            <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 rounded-2xl border-2 border-dashed font-black text-[10px] cursor-pointer transition-all ${fileContent ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 hover:border-indigo-400 text-slate-400'}`}>
              {isProcessingFile ? <Loader2 className="animate-spin" /> : fileContent ? <CheckCircle2 /> : <FileUp />}
              <span className="truncate">{fileContent ? fileName : t.creator_upload_label}</span>
              <input type="file" className="hidden" accept=".pdf,.txt" onChange={handleFileUpload} />
            </label>
            <button onClick={handleGenerate} disabled={loading || isProcessingFile} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50">
              {loading ? <Loader2 className="animate-spin" /> : <Wand2 size={18} />} {t.creator_btn}
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 space-y-8 animate-in fade-in">
          <div className="relative">
            <div className="w-32 h-32 border-[10px] border-indigo-600/10 border-t-indigo-600 rounded-full animate-spin shadow-xl"></div>
            <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600 animate-pulse" size={24} />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-black dark:text-white mb-2">
              {generationStep === 'text' ? t.creator_processing_text : `${t.creator_processing_img} ${currentImgIndex}...`}
            </h3>
          </div>
        </div>
      )}

      {project && !loading && (
        <div className="space-y-6 animate-in zoom-in duration-700">
          <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-5 rounded-[2rem] shadow-xl border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-black">{activeSlide + 1}</div>
              <h3 className="font-black text-sm dark:text-white truncate max-w-md">{project.slides[activeSlide].title}</h3>
            </div>
            <div className="flex gap-2">
              <button onClick={handleDownloadPDF} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[10px] shadow-lg flex items-center gap-2 transition-all"><FileDown size={14} /> تصدير (PDF)</button>
              <button onClick={handleDownloadPPTX} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[10px] shadow-lg flex items-center gap-2 transition-all"><Download size={14} /> تصدير (PPTX)</button>
              <button onClick={() => setProject(null)} className="p-3 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all"><X size={16} /></button>
            </div>
          </div>

          <div className="bg-slate-950 rounded-[3rem] aspect-video relative overflow-hidden group shadow-2xl border-4 border-white/5">
            {project.slides.map((slide, i) => (
              <div key={i} className={`absolute inset-0 transition-all duration-1000 ${activeSlide === i ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'}`}>
                <div className={`flex flex-col md:flex-row h-full ${lang === 'ar' ? 'md:flex-row-reverse' : ''}`}>
                  <div className="flex-1 p-8 md:p-14 flex flex-col justify-center bg-slate-900/90 backdrop-blur-2xl">
                    <h3 className={`text-xl md:text-2xl font-black text-white mb-6 border-indigo-600 leading-tight ${lang === 'ar' ? 'border-r-4 pr-4' : 'border-l-4 pl-4'}`}>{slide.title}</h3>
                    <ul className="space-y-3">
                      {slide.content.map((p, pi) => (
                        <li key={pi} className="text-xs md:text-base text-slate-300 font-bold flex items-start gap-3">
                          <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 shrink-0 shadow-[0_0_10px_rgba(79,70,229,0.5)]"></div>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex-1 relative overflow-hidden">
                    {slide.imageUrl ? (
                      <img src={slide.imageUrl} className="w-full h-full object-cover" alt="Slide Visual" />
                    ) : (
                      <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                        <LucideImage size={64} className="text-slate-700 animate-pulse" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className={`absolute inset-y-0 ${lang === 'ar' ? 'left-0' : 'right-0'} w-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity`}>
              <button onClick={() => setActiveSlide(s => Math.min(project.slides.length - 1, s + 1))} className="w-10 h-10 bg-white/10 hover:bg-indigo-600 text-white rounded-full backdrop-blur-md transition-all active:scale-90"><ArrowLeft size={20} /></button>
            </div>
            <div className={`absolute inset-y-0 ${lang === 'ar' ? 'right-0' : 'left-0'} w-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity`}>
              <button onClick={() => setActiveSlide(s => Math.max(0, s - 1))} className="w-10 h-10 bg-white/10 hover:bg-indigo-600 text-white rounded-full backdrop-blur-md transition-all active:scale-90"><ArrowRight size={20} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
