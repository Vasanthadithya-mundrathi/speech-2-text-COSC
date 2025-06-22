const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { createClient } = require('@deepgram/sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Deepgram API key
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

if (!DEEPGRAM_API_KEY) {
  console.error('Error: DEEPGRAM_API_KEY not found in environment variables');
  console.error('Please create a .env file with your Deepgram API key');
  process.exit(1);
}

// Initialize Deepgram client
const deepgram = createClient(DEEPGRAM_API_KEY);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'audio-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files - check both mimetype and file extension
    const allowedMimes = ['audio/', 'video/webm'];
    const allowedExtensions = ['.wav', '.mp3', '.m4a', '.ogg', '.webm', '.flac'];
    
    const hasValidMime = allowedMimes.some(mime => file.mimetype.startsWith(mime));
    const hasValidExtension = allowedExtensions.some(ext => 
      file.originalname.toLowerCase().endsWith(ext)
    );
    
    if (hasValidMime || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'), false);
    }
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Speech to Text API is running',
    timestamp: new Date().toISOString()
  });
});

// Speech to text endpoint
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No audio file provided',
        message: 'Please upload an audio file'
      });
    }

    console.log(`Processing audio file: ${req.file.filename}`);
    console.log(`File size: ${req.file.size} bytes`);
    console.log(`File type: ${req.file.mimetype}`);

    // Read the uploaded audio file
    const audioBuffer = fs.readFileSync(req.file.path);

    // Configure Deepgram options
    const options = {
      model: 'nova-2',
      language: 'en-US',
      smart_format: true,
      punctuate: true,
      diarize: false,
      utterances: true,
      paragraphs: true
    };

    console.log('Sending request to Deepgram...');

    // Send audio to Deepgram for transcription
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      options
    );

    if (error) {
      console.error('Deepgram error:', error);
      return res.status(500).json({ 
        error: 'Transcription failed',
        message: error.message || 'Unknown error occurred'
      });
    }

    // Extract transcription text
    const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const confidence = result.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;
    const words = result.results?.channels?.[0]?.alternatives?.[0]?.words || [];

    console.log('Transcription completed successfully');
    console.log(`Transcript: ${transcript}`);
    console.log(`Confidence: ${confidence}`);

    // Clean up uploaded file
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting file:', err);
    });

    // Return transcription result
    res.json({
      success: true,
      transcript: transcript,
      confidence: confidence,
      word_count: words.length,
      duration: result.metadata?.duration || 0,
      words: words.slice(0, 10), // Return first 10 words with timing
      metadata: {
        model: options.model,
        language: options.language,
        processed_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Server error:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }

    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Real-time transcription endpoint (for future enhancement)
app.post('/api/transcribe-realtime', (req, res) => {
  res.json({
    message: 'Real-time transcription not implemented yet',
    suggestion: 'Use the file upload endpoint for now'
  });
});

// Get transcription history (placeholder)
app.get('/api/history', (req, res) => {
  res.json({
    message: 'Transcription history feature coming soon',
    total_transcriptions: 0,
    recent_transcriptions: []
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'Audio file must be smaller than 10MB'
      });
    }
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message || 'An unexpected error occurred'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Speech to Text server running on port ${PORT}`);
  console.log(`Access the application at: http://localhost:${PORT}`);
  console.log('Deepgram API initialized successfully');
});
