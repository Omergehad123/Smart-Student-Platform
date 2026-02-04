const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// إعداد Supabase باستخدام بياناتك
const supabaseUrl = "https://pxmhwwovxrnefiryywva.supabase.co";
const supabaseKey =
  process.env.SUPABASE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4bWh3d292eHJuZWZpcnl5d3ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MzgzNjQsImV4cCI6MjA3MjAxNDM2NH0.FqzkWel93icaJ781ZCPhvzfVJu4iwqCa3hxV3AKuRlA";
const supabase = createClient(supabaseUrl, supabaseKey);

// إعداد Gemini
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });

// --- AI Chat Endpoint ---
app.post("/api/chat", async (req, res) => {
  try {
    const { message, context } = req.body;
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: message,
      config: {
        systemInstruction:
          "أنت مساعد ذكي لمنصة الطالب الذكي. السياق المتاح: " +
          (context || "عام"),
      },
    });
    res.json({ text: response.text });
  } catch (error) {
    res.status(500).json({ error: "فشل AI" });
  }
});

// --- Data Endpoints (Supabase Bridge) ---

// جلب بيانات المستخدم كاملة
app.get("/api/data", async (req, res) => {
  try {
    // ملاحظة: في نظام حقيقي نستخدم ID المستخدم من الـ Auth
    // هنا سنفترض مستخدم تجريبي ثابت للتبسيط أو جلب أول مستخدم
    const { data: user } = await supabase.from("profiles").select("*").single();
    const { data: subjects } = await supabase.from("subjects").select("*");
    const { data: tasks } = await supabase.from("tasks").select("*");
    const { data: notes } = await supabase.from("notes").select("*");

    res.json({
      user,
      subjects: subjects || [],
      tasks: tasks || [],
      notes: notes || [],
      stats: null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// حفظ مستخدم جديد
app.post("/api/user", async (req, res) => {
  const { id, email, full_name, xp } = req.body;
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id, email, full_name, xp })
    .select();
  if (error) return res.status(400).json(error);
  res.json(data[0]);
});

// إدارة المواد
app.post("/api/subjects", async (req, res) => {
  // يتم مسح وحفظ المواد للتزامن البسيط (أو يمكن تطويرها لتحديث شريحة واحدة)
  const subjects = req.body;
  const { error } = await supabase.from("subjects").delete().neq("id", 0); // مسح الكل للمستخدم الحالي
  const { data, error: insError } = await supabase.from("subjects").insert(
    subjects.map((s) => ({
      name: s.name,
      color: s.color,
      progress: s.progress,
      lectures: s.lectures,
    }))
  );
  if (insError) return res.status(400).json(insError);
  res.json({ success: true });
});

// إدارة المهام
app.post("/api/tasks", async (req, res) => {
  const tasks = req.body;
  await supabase.from("tasks").delete().neq("id", 0);
  const { error } = await supabase.from("tasks").insert(tasks);
  if (error) return res.status(400).json(error);
  res.json({ success: true });
});

// إدارة الملاحظات
app.post("/api/notes", async (req, res) => {
  const notes = req.body;
  await supabase.from("notes").delete().neq("id", 0);
  const { error } = await supabase.from("notes").insert(notes);
  if (error) return res.status(400).json(error);
  res.json({ success: true });
});

// خدمة الملفات
app.use(express.static("."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  🚀 خادم المنصة يعمل ومتصل بـ Supabase!
  🔗 الرابط المحلي: http://localhost:${PORT}
  🤖 Gemini AI: نشط
  `);
});
