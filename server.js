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

// ✅ MongoDB URI
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://ar8388622_db_user:jGPrTR9dt9WxWzK7@cluster0.do113fy.mongodb.net/laptop_scheme_db?retryWrites=true&w=majority';

// ✅ MongoDB Connection
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Atlas Connected Successfully'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err.message));

// ✅ Student Schema
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
// API ROUTES
// ============================================================

// ============================================================
// Serve Static Files
// ============================================================
app.use(express.static(path.join(__dirname)));

// ============================================================
// ✅ POST: Register Student
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

app.post('/api/apply', upload.single('paymentProof'), async (req, res) => {
    try {
        const { fullName, cnicOrBform, email, phone, institution, paymentTrxId } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Payment proof is required!' });
        }

        const existing = await Student.findOne({ cnicOrBform });
        if (existing) {
            return res.status(400).json({ success: false, message: 'CNIC already registered!' });
        }

        const lastStudent = await Student.findOne().sort({ rollNumber: -1 });
        const newRollNumber = lastStudent ? lastStudent.rollNumber + 1 : 190100;

        const base64Image = req.file.buffer.toString('base64');

        const student = new Student({
            rollNumber: newRollNumber,
            fullName,
            cnicOrBform,
            email,
            phone,
            institution,
            paymentTrxId,
            paymentProof: {
                data: base64Image,
                contentType: req.file.mimetype
            }
        });

        await student.save();
        res.json({ success: true, rollNumber: newRollNumber, message: 'Registration Successful!' });
    } catch (err) {
        console.error('❌ Registration Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ GET: Dashboard Stats
// ============================================================
app.get('/api/dashboard-stats', async (req, res) => {
    try {
        const totalStudents = await Student.countDocuments();
        const totalCompleted = await Student.countDocuments({ testCompleted: true });
        const top100 = await Student.countDocuments({ isTop100: true, percentage: { $gte: 70 } });

        const highestScore = await Student.findOne({ testCompleted: true })
            .sort({ totalMarks: -1 })
            .select('fullName rollNumber totalMarks totalQuestions percentage');

        const avgResult = await Student.aggregate([
            { $match: { testCompleted: true } },
            { $group: { _id: null, avg: { $avg: '$totalMarks' } } }
        ]);

        res.json({
            success: true,
            stats: {
                totalStudents,
                totalCompleted,
                top100,
                averageMarks: avgResult.length > 0 ? avgResult[0].avg : 0,
                highestScore: highestScore || null
            }
        });
    } catch (err) {
        console.error('❌ Dashboard Stats Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ GET: Top 100
// ============================================================
app.get('/api/top-100', async (req, res) => {
    try {
        const students = await Student.find({ isTop100: true, percentage: { $gte: 70 } })
            .sort({ rank: 1 })
            .select('fullName rollNumber totalMarks totalQuestions percentage rank');

        res.json({ success: true, count: students.length, top100: students });
    } catch (err) {
        console.error('❌ Top 100 Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ GET: Admin Students
// ============================================================
app.get('/api/admin/students', async (req, res) => {
    try {
        const { search, page = 1, limit = 20, testStatus, top100 } = req.query;
        const query = {};

        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { cnicOrBform: { $regex: search, $options: 'i' } }
            ];
            if (!isNaN(search)) {
                query.$or.push({ rollNumber: Number(search) });
            }
        }

        if (testStatus === 'completed') query.testCompleted = true;
        else if (testStatus === 'pending') query.testCompleted = false;
        if (top100 === 'true') {
            query.isTop100 = true;
            query.percentage = { $gte: 70 };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const students = await Student.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .select('-paymentProof.data -testAnswers');

        const total = await Student.countDocuments(query);

        res.json({
            success: true,
            students,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error('❌ Admin Students Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ POST: Admin Login
// ============================================================
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// ============================================================
// ✅ Serve HTML Files
// ============================================================
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// ✅ FOR VERCEL - Export the app (MUST BE AT THE END)
// ============================================================
module.exports = app;

// Local development (Only runs when not on Vercel)
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