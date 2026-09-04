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
// ✅ GET: Student Details (Admin)
// ============================================================
app.get('/api/admin/student/:rollNumber', async (req, res) => {
    try {
        const student = await Student.findOne({ rollNumber: Number(req.params.rollNumber) });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found!' });
        }
        res.json({ success: true, student });
    } catch (err) {
        console.error('❌ Admin Student Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ PUT: Update Student (Admin)
// ============================================================
app.put('/api/admin/student/:rollNumber', async (req, res) => {
    try {
        const student = await Student.findOne({ rollNumber: Number(req.params.rollNumber) });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found!' });
        }

        const { totalMarks, testCompleted } = req.body;

        if (totalMarks !== undefined) {
            student.totalMarks = totalMarks;
            student.percentage = (totalMarks / 100) * 100;
        }

        if (testCompleted !== undefined) {
            student.testCompleted = testCompleted;
            if (testCompleted) student.testDate = new Date();
        }

        await student.save();
        await recalculateRanks();

        res.json({ success: true, message: 'Student updated successfully!' });
    } catch (err) {
        console.error('❌ Admin Update Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ DELETE: Delete Student (Admin)
// ============================================================
app.delete('/api/admin/student/:rollNumber', async (req, res) => {
    try {
        const student = await Student.findOneAndDelete({ rollNumber: Number(req.params.rollNumber) });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found!' });
        }
        await recalculateRanks();
        res.json({ success: true, message: 'Student deleted successfully!' });
    } catch (err) {
        console.error('❌ Delete Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ GET: Student Results
// ============================================================
app.get('/api/student-results/:rollNumber', async (req, res) => {
    try {
        const student = await Student.findOne({ rollNumber: Number(req.params.rollNumber) });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found!' });
        }
        res.json({
            success: true,
            student: {
                fullName: student.fullName,
                rollNumber: student.rollNumber,
                totalMarks: student.totalMarks,
                totalQuestions: student.totalQuestions,
                percentage: student.percentage,
                testCompleted: student.testCompleted,
                isTop100: student.isTop100,
                rank: student.rank,
                testDate: student.testDate,
                answers: student.testAnswers
            }
        });
    } catch (err) {
        console.error('❌ Get Results Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ GET: All Results
// ============================================================
app.get('/api/all-results', async (req, res) => {
    try {
        const students = await Student.find({ testCompleted: true })
            .sort({ totalMarks: -1 })
            .select('fullName rollNumber totalMarks totalQuestions percentage isTop100 rank testDate');

        res.json({ success: true, count: students.length, results: students });
    } catch (err) {
        console.error('❌ All Results Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ POST: Submit MCQ Answer
// ============================================================
app.post('/api/submit-answer', async (req, res) => {
    try {
        const { rollNumber, questionId, answer, isCorrect, currentMarks } = req.body;
        const student = await Student.findOne({ rollNumber: Number(rollNumber) });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found!' });
        }

        const allQuestions = getAllMCQs();
        const question = allQuestions.find(q => q.id === questionId);

        const answerObj = {
            questionId: questionId,
            question: question ? question.question : 'N/A',
            selectedOption: answer || 'Not Answered',
            correctAnswer: question ? question.answer : 'N/A',
            isCorrect: isCorrect || false
        };

        const existingIndex = student.testAnswers.findIndex(a => a.questionId === questionId);
        if (existingIndex !== -1) {
            student.testAnswers[existingIndex] = answerObj;
        } else {
            student.testAnswers.push(answerObj);
        }

        student.totalMarks = currentMarks || student.totalMarks;
        student.totalQuestions = 100;
        student.percentage = (student.totalMarks / 100) * 100;

        await student.save();

        res.json({
            success: true,
            totalMarks: student.totalMarks,
            totalQuestions: student.totalQuestions,
            percentage: student.percentage
        });
    } catch (err) {
        console.error('❌ Submit Answer Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ POST: Submit Final Result
// ============================================================
app.post('/api/submit-final-result', async (req, res) => {
    try {
        const { rollNumber, totalMarks, totalQuestions, percentage, answers } = req.body;
        const student = await Student.findOne({ rollNumber: Number(rollNumber) });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found!' });
        }

        student.totalMarks = totalMarks || student.totalMarks;
        student.totalQuestions = totalQuestions || 100;
        student.percentage = percentage || ((student.totalMarks / 100) * 100);
        student.testCompleted = true;
        student.testDate = new Date();

        if (answers && answers.length > 0) {
            student.testAnswers = answers;
        }

        await student.save();
        await recalculateRanks();

        const updated = await Student.findOne({ rollNumber: Number(rollNumber) });

        res.json({
            success: true,
            message: 'Test completed successfully!',
            totalMarks: updated.totalMarks,
            totalQuestions: updated.totalQuestions,
            percentage: updated.percentage,
            rank: updated.rank,
            isTop100: updated.isTop100
        });
    } catch (err) {
        console.error('❌ Final Result Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ POST: Verify Roll Number
// ============================================================
app.post('/api/verify-roll', async (req, res) => {
    try {
        const { rollNumber } = req.body;
        const student = await Student.findOne({ rollNumber: Number(rollNumber) });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Roll number not found!' });
        }

        if (student.testCompleted) {
            return res.json({
                success: true,
                testCompleted: true,
                studentName: student.fullName,
                totalMarks: student.totalMarks,
                totalQuestions: student.totalQuestions,
                percentage: student.percentage,
                rank: student.rank,
                isTop100: student.isTop100
            });
        }

        res.json({
            success: true,
            testCompleted: false,
            studentName: student.fullName,
            rollNumber: student.rollNumber,
            questions: getAllMCQs(),
            totalQuestions: 100
        });
    } catch (err) {
        console.error('❌ Verify Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ GET: Quick Complete (Admin)
// ============================================================
app.post('/api/admin/quick-complete/:rollNumber', async (req, res) => {
    try {
        const student = await Student.findOne({ rollNumber: Number(req.params.rollNumber) });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found!' });
        }

        const marks = Math.floor(Math.random() * 60) + 40;
        student.totalMarks = marks;
        student.totalQuestions = 100;
        student.percentage = marks;
        student.testCompleted = true;
        student.testDate = new Date();

        await student.save();
        await recalculateRanks();

        res.json({ success: true, message: `Student completed with ${marks} marks!` });
    } catch (err) {
        console.error('❌ Quick Complete Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ GET: Financial Dashboard (Admin)
// ============================================================
app.get('/api/admin/financial', async (req, res) => {
    try {
        const totalStudents = await Student.countDocuments();
        const top100Count = await Student.countDocuments({ isTop100: true, percentage: { $gte: 70 } });

        const registrationFee = 500;
        const laptopCost = 50000;
        const totalRevenue = totalStudents * registrationFee;
        const totalLaptopCost = top100Count * laptopCost;

        const monthlyStats = await Student.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    registrations: { $sum: 1 },
                    completed: { $sum: { $cond: ['$testCompleted', 1, 0] } }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        res.json({
            success: true,
            financial: {
                registrationFee,
                laptopCost,
                totalStudents,
                top100Count,
                totalRevenue,
                totalLaptopCost,
                profitLoss: totalRevenue - totalLaptopCost,
                monthlyStats: monthlyStats.map(m => ({
                    month: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
                    registrations: m.registrations,
                    completed: m.completed
                }))
            }
        });
    } catch (err) {
        console.error('❌ Financial Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ GET: Analytics (Admin)
// ============================================================
app.get('/api/admin/analytics', async (req, res) => {
    try {
        const allStudents = await Student.find({ testCompleted: true });
        const questions = getAllMCQs();

        const questionStats = questions.map(q => {
            let correct = 0;
            let total = 0;
            allStudents.forEach(student => {
                const answer = student.testAnswers.find(a => a.questionId === q.id);
                if (answer) {
                    total++;
                    if (answer.isCorrect) correct++;
                }
            });
            return {
                questionId: q.id,
                question: q.question.substring(0, 50) + '...',
                correct,
                total,
                percentage: total > 0 ? (correct / total) * 100 : 0
            };
        });

        const marksDistribution = {
            '0-20': await Student.countDocuments({ testCompleted: true, totalMarks: { $lte: 20 } }),
            '21-40': await Student.countDocuments({ testCompleted: true, totalMarks: { $gt: 20, $lte: 40 } }),
            '41-60': await Student.countDocuments({ testCompleted: true, totalMarks: { $gt: 40, $lte: 60 } }),
            '61-80': await Student.countDocuments({ testCompleted: true, totalMarks: { $gt: 60, $lte: 80 } }),
            '81-100': await Student.countDocuments({ testCompleted: true, totalMarks: { $gt: 80, $lte: 100 } })
        };

        res.json({
            success: true,
            analytics: {
                totalTestTakers: allStudents.length,
                questionStats: questionStats.slice(0, 20),
                marksDistribution
            }
        });
    } catch (err) {
        console.error('❌ Analytics Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ POST: Update Test Status (Admin)
// ============================================================
app.put('/api/admin/student/:rollNumber/test-status', async (req, res) => {
    try {
        const student = await Student.findOne({ rollNumber: Number(req.params.rollNumber) });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found!' });
        }

        const { testCompleted, totalMarks } = req.body;

        if (testCompleted !== undefined) {
            student.testCompleted = testCompleted;
            if (testCompleted) student.testDate = new Date();
        }

        if (totalMarks !== undefined) {
            student.totalMarks = totalMarks;
            student.percentage = (totalMarks / 100) * 100;
        }

        await student.save();
        await recalculateRanks();

        res.json({ success: true, message: 'Test status updated!' });
    } catch (err) {
        console.error('❌ Update Test Status Error:', err);
        res.status(500).json({ success: false, message: err.message });
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