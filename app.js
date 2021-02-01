const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = 3000;
const DATA_FILE = 'data.txt';

// Git kurulumunu ve ilk commiti geçmişe dönük yapan fonksiyon
const ensureGitInit = () => {
    try {
        execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    } catch (e) {
        console.log("🚀 Git deposu bulunamadı. Geçmişe dönük ilklendirme yapılıyor...");
        execSync('git init');
        const initDate = "2021-02-01T10:00:00Z";

        try {
            // Mevcut dosyaları ekle
            execSync('git add .gitignore app.js package.json package-lock.json');
            execSync(`git commit -m "chore: initial project setup"`, {
                env: {
                    ...process.env,
                    GIT_AUTHOR_DATE: initDate,
                    GIT_COMMITTER_DATE: initDate
                }
            });
        } catch (addError) {
            execSync('git add .');
            execSync(`git commit -m "chore: initial project setup (fallback)"`, {
                env: { ...process.env, GIT_AUTHOR_DATE: initDate, GIT_COMMITTER_DATE: initDate }
            });
        }
    }
};

// Helper function to format date to ISO string
const formatDate = (date) => {
    return new Date(date).toISOString();
};

// Helper function to start of day
const startOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

// Helper function to add days
const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};

// Helper function to check if date is weekend
const isWeekend = (date) => {
    const day = new Date(date).getDay();
    return day === 0 || day === 6;
};

// Helper function to clone date
const cloneDate = (date) => {
    return new Date(date);
};

// Helper function to validate date
const isValidDate = (dateString) => {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
};

// Helper function to validate intensity
const isValidIntensity = (intensity) => {
    const num = parseFloat(intensity);
    return !isNaN(num) && num >= 0 && num <= 1;
};

// Commit atma fonksiyonu: Artık tarih bilgisini de dönüyor
const createCommit = (date) => {
    const formattedDate = formatDate(date);
    const secretMessage = `Activity log: ${formattedDate}\n`;

    try {
        // Check if data.txt exists, if not create it
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, '');
        }
        
        // Add the new activity log
        fs.appendFileSync(DATA_FILE, secretMessage);
        
        // Force add the data file even though it's in .gitignore
        execSync('git add -f ' + DATA_FILE);
        
        // Try to commit - if it fails due to no changes, that's still a success for our purposes
        try {
            execSync(`git commit -m "feat: sync historical activity data"`, {
                env: {
                    ...process.env,
                    GIT_AUTHOR_DATE: formattedDate,
                    GIT_COMMITTER_DATE: formattedDate
                }
            });
        } catch (commitErr) {
            // If commit fails because nothing changed, that's okay - we still logged the activity
            if (commitErr.message.includes('nothing to commit')) {
                return { success: true, timestamp: formattedDate, note: 'no_changes_needed' };
            }
            // If it's a different error, re-throw it
            throw commitErr;
        }
        
        return { success: true, timestamp: formattedDate };
    } catch (err) {
        console.error('Commit failed:', err.message);
        return { success: false, error: err.message };
    }
};

app.post('/generate-history', (req, res) => {
    try {
        // req.body'den gelen verileri al
        const { startDate, endDate, intensity } = req.body;
        
        // Input validation
        if (!startDate || !endDate) {
            return res.status(400).json({ error: "startDate and endDate are required." });
        }
        
        if (!isValidDate(startDate) || !isValidDate(endDate)) {
            return res.status(400).json({ error: "Invalid date format. Please use valid ISO date strings." });
        }
        
        const commitIntensity = intensity !== undefined ? parseFloat(intensity) : 0.5;
        
        if (!isValidIntensity(commitIntensity)) {
            return res.status(400).json({ error: "Intensity must be a number between 0 and 1." });
        }
        
        if (new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({ error: "startDate must be before or equal to endDate." });
        }

        ensureGitInit();

        // Tarihleri Date nesnesine çevir ve günün başına sabitle
        let current = startOfDay(startDate);
        const end = startOfDay(endDate);
        const commitLogs = [];

        // Döngü: Başlangıç tarihi, bitiş tarihine eşit veya küçük olduğu sürece
        while (current <= end) {
            const weekend = isWeekend(current);
            const probability = weekend ? Math.max(0.05, commitIntensity * 0.3) : commitIntensity;

            // Rastgelelik kontrolü
            if (Math.random() < probability) {
                // Bir güne 1 ile 3 arası commit
                const commitsToday = Math.floor(Math.random() * 3) + 1;

                for (let i = 0; i < commitsToday; i++) {
                    // Rastgele saat ve dakika ekle (Mesai saatleri: 09-20 arası)
                    const hour = Math.floor(Math.random() * (20 - 9 + 1)) + 9;
                    const minute = Math.floor(Math.random() * 60);

                    // .clone() kullanarak ana 'current' nesnesini bozmadan commit saati oluştur
                    const commitTime = cloneDate(current);
                    commitTime.setHours(hour, minute, 0, 0);

                    const result = createCommit(commitTime);
                    if (result.success) {
                        commitLogs.push(result.timestamp);
                    }
                }
            }
            // Bir sonraki güne geç
            current = addDays(current, 1);
        }

        res.json({
            success: true,
            message: "Time travel successful!",
            stats: {
                totalCommits: commitLogs.length,
                period: { start: startDate, end: endDate },
                appliedIntensity: commitIntensity
            },
            commits: commitLogs
        });
    } catch (error) {
        console.error('Error in /generate-history:', error);
        res.status(500).json({ error: "Internal server error occurred while generating history." });
    }
});

app.delete('/reset-history', (req, res) => {
    try {
        // Check if we're in a git repository
        try {
            execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
        } catch (e) {
            return res.json({ message: "No git repository found. Nothing to reset." });
        }

        // Get the initial commit hash (should be the "chore: initial project setup" commit)
        const initialCommit = execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8' }).trim();
        
        // Reset to initial commit but keep the data.txt file
        execSync(`git reset --hard ${initialCommit}`);
        
        // Remove data.txt if it exists
        if (fs.existsSync(DATA_FILE)) {
            fs.unlinkSync(DATA_FILE);
        }
        
        res.json({ 
            message: "History reset to initial commit. Ready for a new timeline.",
            resetTo: initialCommit
        });
    } catch (err) {
        console.error('Error in /reset-history:', err);
        res.status(500).json({ error: "Reset failed: " + err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 TimeMachine.js active at http://localhost:${PORT}`);
});