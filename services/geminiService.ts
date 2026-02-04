
import { GoogleGenAI } from "@google/genai";

export const getAIResponse = async (prompt: string, context: string = "عام"): Promise<string> => {
  // المفتاح يتم سحبه من البيئة لضمان الأمان وعدم تسريبه على GitHub
  const apiKey = import.meta.env.VITE_API_KEY;

  if (!apiKey) {
    console.error("APi_kEY is missing from environment variables.");
    return "نظام الذكاء الاصطناعي بانتظار إعداد مفتاح التشغيل (APi_kEY) في إعدادات المنصة.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: `أنت "المعلم الذكي" في منصة الطالب الذكي. 
        مهمتك: تبسيط المعلومات لطلاب الثانوية والجامعة، شرح الدروس بأسلوب مشوق، وحل المسائل. 
        السياق الحالي: ${context}. 
        القواعد:
        - أجب باللغة العربية بأسلوب تعليمي رصين ومشجع.
        - استخدم تنسيق Markdown (عناوين، نقاط، جداول) لجعل الإجابة منظمة.
        - إذا كان المحتوى المرفوع أو السؤال باللغة الإنجليزية، أجب بالإنجليزية.`,
        temperature: 0.7,
      },
    });

    return response.text || "عذراً، لم أتمكن من الحصول على رد مفيد في الوقت الحالي.";
  } catch (error: any) {
    console.error("Gemini Error:", error);
    if (error.message?.includes("API key not valid")) {
      return "خطأ: مفتاح API غير صالح. يرجى التأكد من المفتاح المستخدم في إعدادات Vercel.";
    }
    return "المعلم الذكي مشغول حالياً. يرجى المحاولة مرة أخرى بعد قليل.";
  }
};
