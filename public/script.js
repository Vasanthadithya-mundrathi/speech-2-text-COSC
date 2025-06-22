class SpeechToTextApp {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.checkMicrophonePermission();
    }
    
    initializeElements() {
        // Recording controls
        this.recordBtn = document.getElementById('recordBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.recordingIndicator = document.getElementById('recordingIndicator');
        this.audioPreview = document.getElementById('audioPreview');
        
        // File upload
        this.fileInput = document.getElementById('fileInput');
        this.uploadArea = document.getElementById('uploadArea');
        
        // Transcription
        this.transcriptionResult = document.getElementById('transcriptionResult');
        this.transcriptionMeta = document.getElementById('transcriptionMeta');
        this.confidenceScore = document.getElementById('confidenceScore');
        this.wordCount = document.getElementById('wordCount');
        this.audioDuration = document.getElementById('audioDuration');
        this.modelUsed = document.getElementById('modelUsed');
        
        // Action buttons
        this.copyBtn = document.getElementById('copyBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.clearBtn = document.getElementById('clearBtn');
        
        // Processing indicator
        this.processingIndicator = document.getElementById('processingIndicator');
        this.statusMessages = document.getElementById('statusMessages');
    }
    
    setupEventListeners() {
        // Recording controls
        this.recordBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        
        // File upload
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.uploadArea.addEventListener('drop', (e) => this.handleFileDrop(e));
        
        // Action buttons
        this.copyBtn.addEventListener('click', () => this.copyTranscription());
        this.downloadBtn.addEventListener('click', () => this.downloadTranscription());
        this.clearBtn.addEventListener('click', () => this.clearTranscription());
    }
    
    async checkMicrophonePermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            this.showStatus('Microphone access granted', 'success');
        } catch (error) {
            console.error('Microphone access denied:', error);
            this.showStatus('Microphone access denied. File upload is still available.', 'error');
            this.recordBtn.disabled = true;
        }
    }
    
    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.audioChunks = [];
            this.isRecording = true;
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.processAudioBlob(audioBlob);
                this.updateRecordingUI(false);
                stream.getTracks().forEach(track => track.stop());
            };
            
            this.mediaRecorder.start(1000); // Collect data every second
            this.updateRecordingUI(true);
            this.startAudioVisualization(stream);
            
            this.showStatus('Recording started', 'success');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showStatus('Failed to start recording: ' + error.message, 'error');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.stopAudioVisualization();
            this.showStatus('Recording stopped', 'success');
        }
    }
    
    updateRecordingUI(recording) {
        const statusText = this.recordingIndicator.querySelector('.status-text');
        const bars = this.recordingIndicator.querySelectorAll('.bar');
        
        if (recording) {
            this.recordBtn.disabled = true;
            this.stopBtn.disabled = false;
            statusText.textContent = 'Recording...';
            statusText.classList.add('recording');
            bars.forEach(bar => bar.classList.add('active'));
        } else {
            this.recordBtn.disabled = false;
            this.stopBtn.disabled = true;
            statusText.textContent = 'Ready to record';
            statusText.classList.remove('recording');
            bars.forEach(bar => bar.classList.remove('active'));
        }
    }
    
    startAudioVisualization(stream) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.microphone = this.audioContext.createMediaStreamSource(stream);
        
        this.microphone.connect(this.analyser);
        this.analyser.fftSize = 256;
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const visualize = () => {
            if (!this.isRecording) return;
            
            this.analyser.getByteFrequencyData(dataArray);
            
            const bars = this.recordingIndicator.querySelectorAll('.bar');
            bars.forEach((bar, index) => {
                const value = dataArray[index * 10] || 0;
                const height = Math.max(10, (value / 255) * 30);
                bar.style.height = height + 'px';
            });
            
            requestAnimationFrame(visualize);
        };
        
        visualize();
    }
    
    stopAudioVisualization() {
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
    
    processAudioBlob(blob) {
        const url = URL.createObjectURL(blob);
        this.audioPreview.src = url;
        this.audioPreview.style.display = 'block';
        
        // Automatically transcribe the recorded audio
        this.transcribeAudio(blob);
    }
    
    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.transcribeAudio(file);
        }
    }
    
    handleDragOver(event) {
        event.preventDefault();
        this.uploadArea.classList.add('dragover');
    }
    
    handleDragLeave(event) {
        event.preventDefault();
        this.uploadArea.classList.remove('dragover');
    }
    
    handleFileDrop(event) {
        event.preventDefault();
        this.uploadArea.classList.remove('dragover');
        
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('audio/')) {
                this.transcribeAudio(file);
            } else {
                this.showStatus('Please upload an audio file', 'error');
            }
        }
    }
    
    async transcribeAudio(audioData) {
        try {
            this.showProcessing(true);
            
            const formData = new FormData();
            formData.append('audio', audioData);
            
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.displayTranscription(result);
                this.showStatus('Transcription completed successfully!', 'success');
            } else {
                throw new Error(result.message || 'Transcription failed');
            }
            
        } catch (error) {
            console.error('Transcription error:', error);
            this.showStatus('Transcription failed: ' + error.message, 'error');
        } finally {
            this.showProcessing(false);
        }
    }
    
    displayTranscription(result) {
        // Update transcription text
        this.transcriptionResult.innerHTML = `
            <div class="transcription-content">
                <p>${result.transcript || 'No speech detected in the audio.'}</p>
            </div>
        `;
        
        // Update metadata
        this.confidenceScore.textContent = `${Math.round(result.confidence * 100)}%`;
        this.wordCount.textContent = result.word_count;
        this.audioDuration.textContent = `${result.duration.toFixed(1)}s`;
        this.modelUsed.textContent = result.metadata.model;
        
        // Show metadata section
        this.transcriptionMeta.style.display = 'block';
        
        // Enable action buttons
        this.copyBtn.disabled = false;
        this.downloadBtn.disabled = false;
        this.clearBtn.disabled = false;
        
        // Store result for actions
        this.currentTranscription = result;
    }
    
    copyTranscription() {
        if (this.currentTranscription && this.currentTranscription.transcript) {
            navigator.clipboard.writeText(this.currentTranscription.transcript).then(() => {
                this.showStatus('Transcription copied to clipboard!', 'success');
            }).catch(() => {
                this.showStatus('Failed to copy transcription', 'error');
            });
        }
    }
    
    downloadTranscription() {
        if (this.currentTranscription) {
            const content = `Speech to Text Transcription
Generated: ${new Date().toLocaleString()}
Model: ${this.currentTranscription.metadata.model}
Confidence: ${Math.round(this.currentTranscription.confidence * 100)}%
Duration: ${this.currentTranscription.duration.toFixed(1)}s
Word Count: ${this.currentTranscription.word_count}

Transcript:
${this.currentTranscription.transcript}`;
            
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `transcription-${Date.now()}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showStatus('Transcription downloaded!', 'success');
        }
    }
    
    clearTranscription() {
        this.transcriptionResult.innerHTML = `
            <div class="placeholder">
                <div class="placeholder-icon">🎯</div>
                <p>Your transcription will appear here...</p>
                <small>Record audio or upload a file to get started</small>
            </div>
        `;
        
        this.transcriptionMeta.style.display = 'none';
        this.copyBtn.disabled = true;
        this.downloadBtn.disabled = true;
        this.clearBtn.disabled = true;
        this.currentTranscription = null;
        
        // Hide audio preview
        this.audioPreview.style.display = 'none';
        
        this.showStatus('Transcription cleared', 'success');
    }
    
    showProcessing(show) {
        this.processingIndicator.style.display = show ? 'block' : 'none';
    }
    
    showStatus(message, type = 'info') {
        const statusDiv = document.createElement('div');
        statusDiv.className = `status-message ${type}`;
        statusDiv.textContent = message;
        
        this.statusMessages.appendChild(statusDiv);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (statusDiv.parentNode) {
                statusDiv.parentNode.removeChild(statusDiv);
            }
        }, 5000);
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new SpeechToTextApp();
});

