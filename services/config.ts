
export const CONFIG = {
  // قراءة مفتاح Gemini من البيئة
  GEMINI_APi_kEY: import.meta.env.VITE_API_KEY || '',
  // بيانات Supabase للتزامن
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  IS_PROD: true
};
