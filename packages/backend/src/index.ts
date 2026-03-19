import app from './app.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`\n🚀 Backend server is running on http://localhost:${PORT}\n`);
});
