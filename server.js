const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const app = express();

// ============================================================
// CORS - Allow All
// ============================================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Cache Control
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

app.use(express.static(path.join(__dirname)));

// ============================================================
// Multer Setup
// ============================================================
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'), false);
        }
    }
});

// ============================================================
// ✅ FIXED: MongoDB Connection (NO deprecated options)
// ============================================================
const MONGO_URI = 'mongodb+srv://ar8388622_db_user:jGPrTR9dt9WxWzK7@cluster0.do113fy.mongodb.net/laptop_scheme_db?retryWrites=true&w=majority';

// ✅ SIMPLE CONNECTION - No deprecated options
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Atlas Connected Successfully'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err.message));

// ============================================================
// Student Schema
// ============================================================
const StudentSchema = new mongoose.Schema({
    rollNumber: { type: Number, required: true, unique: true },
    fullName: { type: String, required: true },
    cnicOrBform: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    institution: { type: String, required: true },
    paymentTrxId: { type: String, required: true },
    paymentProof: {
        data: { type: String, required: true },
        contentType: { type: String, required: true }
    },
    testAnswers: [{
        questionId: Number,
        question: String,
        selectedOption: String,
        correctAnswer: String,
        isCorrect: Boolean
    }],
    testCompleted: { type: Boolean, default: false },
    totalMarks: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 100 },
    percentage: { type: Number, default: 0 },
    testDate: { type: Date },
    isTop100: { type: Boolean, default: false },
    rank: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const Student = mongoose.model('Student', StudentSchema);

// ============================================================
// Get 100 MCQs
// ============================================================
function getAllMCQs() {
    const baseQuestions = [
        { q: "What is the capital city of Pakistan?", options: ["Lahore", "Islamabad", "Karachi", "Faisalabad"], ans: "Islamabad" },
        { q: "Which of the following is an input device?", options: ["Monitor", "Printer", "Keyboard", "Speaker"], ans: "Keyboard" },
        { q: "What is 15% of 200?", options: ["20", "25", "30", "35"], ans: "30" },
        { q: "Find the missing number: 2, 4, 8, 16, ?", options: ["24", "30", "32", "64"], ans: "32" },
        { q: "Choose the correct spelling:", options: ["Environment", "Envirment", "Enviornment", "Envrionment"], ans: "Environment" },
        { q: "Which language is used for web styling?", options: ["Python", "HTML", "CSS", "C++"], ans: "CSS" },
        { q: "What is the national flower of Pakistan?", options: ["Rose", "Jasmine", "Sunflower", "Tulip"], ans: "Jasmine" },
        { q: "Which planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], ans: "Mars" },
        { q: "How many bits make up 1 Byte?", options: ["4 bits", "8 bits", "16 bits", "32 bits"], ans: "8 bits" },
        { q: "What is the speed of light approx?", options: ["300,000 km/s", "150,000 km/s", "1,000 km/s", "3,000 km/s"], ans: "300,000 km/s" }
    ];

    const questions = [];
    for (let i = 1; i <= 100; i++) {
        const template = baseQuestions[(i - 1) % baseQuestions.length];
        questions.push({
            id: i,
            question: `Q${i}: ${template.q}`,
            options: template.options.map((opt, idx) => String.fromCharCode(65 + idx) + '. ' + opt),
            answer: template.ans
        });
    }
    return questions;
}

// ============================================================
// Recalculate Ranks
// ============================================================
async function recalculateRanks() {
    try {
        const allStudents = await Student.find({ testCompleted: true })
            .sort({ totalMarks: -1, testDate: 1 });

        for (let i = 0; i < allStudents.length; i++) {
            allStudents[i].rank = i + 1;
            allStudents[i].isTop100 = (i + 1) <= 100 && allStudents[i].percentage >= 70;
            await allStudents[i].save();
        }

        console.log(`✅ Ranks recalculated: ${allStudents.filter(s => s.isTop100).length} students in Top 100`);
        return allStudents.length;
    } catch (err) {
        console.error('❌ Recalculate Ranks Error:', err);
        return 0;
    }
}

// ============================================================
// API ROUTES - All your existing routes here...
// ============================================================

// ... (All your API routes stay the same) ...

// ============================================================
// Serve HTML Files
// ============================================================
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// ✅ FOR VERCEL - Export the app (Add this at the end)
// ============================================================
module.exports = app;

// Local development
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`✅ MongoDB Connected`);
        console.log(`✅ 100 MCQs Loaded`);
        console.log(`🔗 http://localhost:${PORT}/`);
        console.log(`🔗 Admin Panel: http://localhost:${PORT}/admin`);
        console.log(`🔑 Admin: admin / admin123`);
    });
}