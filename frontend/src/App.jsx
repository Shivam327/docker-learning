import { useState, useEffect } from 'react';
import { UploadCloud, Database, Download, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';

function App() {
  const [fileRecords, setFileRecords] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  
  // UX States
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const fetchFileRecords = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      setFileRecords(data);
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to connect to database.' });
    }
    setIsLoadingFiles(false);
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setFeedback({ type: '', message: '' });
    
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        setFeedback({ type: 'success', message: 'File uploaded successfully!' });
        setSelectedFile(null);
        document.getElementById('file-input').value = '';
        fetchFileRecords();
      } else {
        throw new Error('Upload failed');
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Upload failed. Is the backend running?' });
    }
    setIsUploading(false);
  };

  const handleDownload = async (filename) => {
    setFeedback({ type: '', message: '' });
    
    try {
      const res = await fetch(`/api/download/${filename}`);
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
      } else {
        const errorData = await res.json();
        setFeedback({ type: 'error', message: `Missing: ${errorData.error}` });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Network error during download.' });
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Are you sure? This will wipe the database and delete all physical files.")) return;
    
    setIsResetting(true);
    setFeedback({ type: '', message: '' });

    try {
      const res = await fetch('/api/reset', { method: 'DELETE' });
      if (res.ok) {
        setFeedback({ type: 'success', message: 'System completely reset.' });
        fetchFileRecords(); // Will fetch the now-empty list
      } else {
        throw new Error('Reset failed');
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to reset data.' });
    }
    setIsResetting(false);
  };

  useEffect(() => {
    fetchFileRecords();
  }, []);

  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto font-sans">
      
      {/* Header */}
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
          Data Persistence Hub
        </h1>
        <p className="text-slate-500 text-lg">
          Testing Docker Volumes via Postgres & Container Storage
        </p>
      </header>

      {/* Global Feedback Toast */}
      {feedback.message && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
          feedback.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {feedback.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          <span className="font-medium">{feedback.message}</span>
        </div>
      )}

      {/* Changed to flex-col for a vertical layout */}
      <div className="flex flex-col gap-8">
        
        {/* Upload Card */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <UploadCloud className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Upload File</h2>
          </div>
          
          <p className="text-slate-500 mb-6 text-sm">
            This saves the physical file to the container's volume and writes a record of it to the Postgres database.
          </p>

          <div className="space-y-4">
            <input
              id="file-input"
              type="file"
              onChange={(e) => setSelectedFile(e.target.files[0])}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors cursor-pointer"
            />
            <button 
              onClick={handleFileUpload} 
              disabled={!selectedFile || isUploading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              {isUploading ? (
                <span className="animate-pulse">Uploading...</span>
              ) : (
                <>Upload to Server</>
              )}
            </button>
          </div>
        </div>

        {/* Database Records Card */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
                <Database className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Database Records</h2>
            </div>
            
            {/* New Reset Button */}
            <button 
              onClick={handleReset}
              disabled={isResetting || fileRecords.length === 0}
              className="flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-red-50 px-3 py-1.5 rounded-md hover:bg-red-100"
            >
              <Trash2 className="w-4 h-4" />
              {isResetting ? 'Resetting...' : 'Reset All'}
            </button>
          </div>

          <p className="text-slate-500 mb-6 text-sm">
            These records are pulled from Postgres. If the file volume was lost, downloading will trigger an error.
          </p>

          <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
            {isLoadingFiles ? (
              <div className="p-8 text-center text-slate-400 animate-pulse font-medium">
                Loading database records...
              </div>
            ) : fileRecords.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-medium">
                No files in the database yet.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                {fileRecords.map(record => (
                  <li key={record.id} className="p-4 hover:bg-slate-100 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                    
                    {/* Updated File Info (ID + Name + Date) */}
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-slate-700 truncate">
                        <span className="text-slate-400 mr-2">#{record.id}</span> 
                        {record.filename}
                      </span>
                      <span className="text-xs text-slate-400 mt-1">
                        Uploaded: {new Date(record.created_at).toLocaleString()}
                      </span>
                    </div>

                    <button 
                      onClick={() => handleDownload(record.filename)}
                      className="text-sm px-4 py-2 bg-white border border-slate-200 shadow-sm text-slate-600 rounded-md hover:bg-slate-50 hover:text-blue-600 transition-colors flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;