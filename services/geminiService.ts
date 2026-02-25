
import { GoogleGenAI } from "@google/genai";

export interface AIResponse {
  text: string;
  links?: any[];
}

export const getAIResponse = async (
  prompt: string, 
  context: string = "عام", 
  useSearch: boolean = false
): Promise<AIResponse> => {
  // الحصول على المفتاح من البيئة (المحدث في vite.config)
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    return { text: "⚠️ مفتاح API غير متوفر. يرجى إعداد المفتاح في إعدادات المنصة." };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const modelName = 'gemini-3-flash-preview';
    
    const config: any = {
      systemInstruction: `أنت "المعلم الخصوصي الذكي". مهمتك: شرح المحاضرات، تبسيط العلوم، وحل التدريبات. 
      السياق التعليمي المتاح: ${context}. 
      هام جداً: اكتشف لغة الطالب تلقائياً (عربي أو إنجليزي) من خلال سياق الملف المرفوع وأجب بنفس لغته تماماً وبأسلوب ممتع.`,
      temperature: 0.7,
    };

    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: config,
    });

    return { 
      text: response.text || "عذراً، لم أتمكن من معالجة الطلب حالياً.", 
      links: response.candidates?.[0]?.groundingMetadata?.groundingChunks 
    };
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const errorStr = error?.message || JSON.stringify(error);
    
    // إذا انتهت الحصة أو هناك مشكلة في المفتاح، نطلب من المستخدم اختيار مفتاح جديد عبر واجهة المنصة
    if (errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED") || errorStr.includes("not found")) {
      if (typeof window !== 'undefined' && (window as any).aistudio) {
        (window as any).aistudio.openSelectKey();
      }
      return { text: "⚠️ تم استهلاك حصة المفتاح الحالي. جاري محاولة فتح نافذة اختيار مفتاح جديد لمتابعة الدراسة..." };
    }
    
    return { text: "عذراً، واجه المعلم مشكلة تقنية بسيطة. يرجى المحاولة مرة أخرى بعد لحظات." };
  }
};
