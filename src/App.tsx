/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, Timer, RotateCcw, Play, CheckCircle2, XCircle, 
  ChevronRight, BarChart3, FileJson, FileText, Sparkles, 
  Settings, ArrowLeft, Upload, Copy, Check, FileUp,
  X, Pause, Camera, Image as ImageIcon, Languages,
  Eye, EyeOff, Trash2, Undo2, Download, UploadCloud, DownloadCloud,
  History, Globe, Search, Filter, ArrowUpDown, User, Edit3
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

import { 
  auth, db, signInWithGoogle, logout as firebaseLogout, 
  OperationType, handleFirestoreError 
} from './firebase';
import { 
  doc, setDoc, getDoc, collection, onSnapshot, query, orderBy, limit, serverTimestamp, deleteDoc, getDocs, updateDoc
} from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

// Set worker source for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// --- Constants & Types ---
const AI_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite-preview"
];

interface Question {
  q_en: string;
  q_hi: string;
  options_en: string[];
  options_hi: string[];
  answer: string;
  topic?: string;
  explanation?: string;
}

interface QuizData {
  title: string;
  questions: Question[];
  subject?: string;
}

interface UserAnswer {
  questionIdx: number;
  selected: string | null;
  isCorrect: boolean;
  timeTaken: number;
}

interface QuizHistoryEntry {
  id: string;
  date: string;
  title: string;
  score: number;
  total: number;
  percent: string;
  questions: Question[];
  user?: string;
  progress?: number;
  userAnswers?: UserAnswer[];
  subject?: string;
}

interface TimerSettings {
  enabled: boolean;
  secondsPerQuestion: number;
}

// --- Default Data ---
const DEFAULT_QUIZ: QuizData = {
  title: "Vocabulary Master",
  questions: [
    { q_en: "Ample", q_hi: "Ample का अर्थ क्या है?", options_en: ["Enough", "Similar", "Scarce", "Careless"], options_hi: ["पर्याप्त", "समान", "कमी", "लापरवाह"], answer: "Enough", topic: "Vocab" },
    { q_en: "Acme", q_hi: "Acme का अर्थ क्या है?", options_en: ["Peak", "Error", "Crowd", "Habit"], options_hi: ["शिखर", "त्रुटि", "भीड़", "आदत"], answer: "Peak", topic: "Vocab" },
    { q_en: "Alimony", q_hi: "Alimony का अर्थ क्या है?", options_en: ["Maintenance", "Punishment", "Property", "Advice"], options_hi: ["भरण-पोषण", "सज़ा", "संपत्ति", "सलाह"], answer: "Maintenance", topic: "Vocab" },
    { q_en: "Atone", q_hi: "Atone का अर्थ क्या है?", options_en: ["Compensate", "Destroy", "Refuse", "Forget"], options_hi: ["प्रायश्चित करना", "नष्ट करना", "मना करना", "भूल जाना"], answer: "Compensate", topic: "Vocab" },
    { q_en: "Amalgamate", q_hi: "Amalgamate का अर्थ क्या है?", options_en: ["Combine", "Separate", "Reject", "Delay"], options_hi: ["मिलाना", "अलग करना", "अस्वीकार करना", "देरी करना"], answer: "Combine", topic: "Vocab" },
    { q_en: "Animosity", q_hi: "Animosity का अर्थ क्या है?", options_en: ["Hatred", "Friendship", "Calmness", "Agreement"], options_hi: ["घृणा", "मित्रता", "शांति", "सहमति"], answer: "Hatred", topic: "Vocab" },
    { q_en: "Amplify", q_hi: "Amplify का अर्थ क्या है?", options_en: ["Increase", "Hide", "Reduce", "Stop"], options_hi: ["बढ़ाना", "छिपाना", "कम करना", "रुकना"], answer: "Increase", topic: "Vocab" },
    { q_en: "Accord", q_hi: "Accord का अर्थ क्या है?", options_en: ["Agreement", "Argument", "Fight", "Refusal"], options_hi: ["समझौता", "तर्क", "लड़ाई", "इनकार"], answer: "Agreement", topic: "Vocab" },
    { q_en: "Adverse", q_hi: "Adverse का अर्थ क्या है?", options_en: ["Unfavorable", "Helpful", "Pleasant", "Mild"], options_hi: ["प्रतिकूल", "सहायक", "सुखद", "हल्का"], answer: "Unfavorable", topic: "Vocab" },
    { q_en: "Ad-Hoc", q_hi: "Ad-Hoc का अर्थ क्या है?", options_en: ["Temporary", "Permanent", "Usual", "Fixed"], options_hi: ["अस्थायी", "स्थायी", "सामान्य", "निश्चित"], answer: "Temporary", topic: "Vocab" },
    { q_en: "Averse", q_hi: "Averse का अर्थ क्या है?", options_en: ["Unwilling", "Ready", "Happy", "Interested"], options_hi: ["अनिच्छुक", "तैयार", "खुश", "इच्छुक"], answer: "Unwilling", topic: "Vocab" },
    { q_en: "Aptitude", q_hi: "Aptitude का अर्थ क्या है?", options_en: ["Ability", "Weakness", "Laziness", "Fear"], options_hi: ["योग्यता", "कमजोरी", "आलस्य", "डर"], answer: "Ability", topic: "Vocab" },
    { q_en: "Amulet", q_hi: "Amulet का अर्थ क्या है?", options_en: ["Talisman", "Weapon", "Tool", "Machine"], options_hi: ["ताबीज", "हथियार", "उपकरण", "मशीन"], answer: "Talisman", topic: "Vocab" },
    { q_en: "Adhere", q_hi: "Adhere का अर्थ क्या है?", options_en: ["Follow", "Break", "Ignore", "Refuse"], options_hi: ["पालन करना", "तोड़ना", "अनदेखा करना", "मना करना"], answer: "Follow", topic: "Vocab" },
    { q_en: "Audacity", q_hi: "Audacity का अर्थ क्या है?", options_en: ["Boldness", "Fear", "Silence", "Politeness"], options_hi: ["साहस", "डर", "मौन", "विनम्रता"], answer: "Boldness", topic: "Vocab" },
    { q_en: "Assassination", q_hi: "Assassination का अर्थ क्या है?", options_en: ["Murder", "Rescue", "Protection", "Praise"], options_hi: ["हत्या", "बचाव", "सुरक्षा", "प्रशंसा"], answer: "Murder", topic: "Vocab" },
    { q_en: "Ameliorate", q_hi: "Ameliorate का अर्थ क्या है?", options_en: ["Improve", "Damage", "Ignore", "Delay"], options_hi: ["सुधारना", "नुकसान", "अनदेखा करना", "देरी करना"], answer: "Improve", topic: "Vocab" },
    { q_en: "Appease", q_hi: "Appease का अर्थ क्या है?", options_en: ["Pacify", "Annoy", "Hurt", "Insult"], options_hi: ["शांत करना", "परेशान करना", "चोट पहुँचाना", "अपमान करना"], answer: "Pacify", topic: "Vocab" },
    { q_en: "Apparent", q_hi: "Apparent का अर्थ क्या है?", options_en: ["Obvious", "Hidden", "Confused", "False"], options_hi: ["स्पष्ट", "छिपा हुआ", "भ्रमित", "असत्य"], answer: "Obvious", topic: "Vocab" },
    { q_en: "Adulation", q_hi: "Adulation का अर्थ क्या है?", options_en: ["Praise", "Criticism", "Blame", "Insult"], options_hi: ["चापलूसी", "आलोचना", "दोष", "अपमान"], answer: "Praise", topic: "Vocab" },
    { q_en: "Amnesty", q_hi: "Amnesty का अर्थ क्या है?", options_en: ["Pardon", "Punishment", "Arrest", "Trial"], options_hi: ["क्षमादान", "सज़ा", "गिरफ्तारी", "परीक्षण"], answer: "Pardon", topic: "Vocab" },
    { q_en: "Adamant", q_hi: "Adamant का अर्थ क्या है?", options_en: ["Firm", "Weak", "Flexible", "Careless"], options_hi: ["अटल", "कमजोर", "लचीला", "लापरवाह"], answer: "Firm", topic: "Vocab" },
    { q_en: "Affable", q_hi: "Affable का अर्थ क्या है?", options_en: ["Friendly", "Rude", "Angry", "Harsh"], options_hi: ["मिलनसार", "असभ्य", "क्रोधित", "कठोर"], answer: "Friendly", topic: "Vocab" },
    { q_en: "Analogy", q_hi: "Analogy का अर्थ क्या है?", options_en: ["Comparison", "Decision", "Order", "Story"], options_hi: ["समानता", "निर्णय", "आदेश", "कहानी"], answer: "Comparison", topic: "Vocab" },
    { q_en: "Adage", q_hi: "Adage का अर्थ क्या है?", options_en: ["Proverb", "Rule", "Law", "Command"], options_hi: ["कहावत", "नियम", "कानून", "आदेश"], answer: "Proverb", topic: "Vocab" }
  ]
};

// --- API Key Management ---
const API_KEYS = [
  "AIzaSyBoo_lZfyhJMBj8Ti4hgGpk1g6Q0ja1Qjg",
  "AIzaSyAEUGp2u03qBINVMamkT-T7_WOVuRYKrpQ",
  "AIzaSyCsuO9G282jTwdHbXUxnDYmSSRvOh6hLE0",
  "AIzaSyBQQsdP8ZaQF7ppMsIzAuHd028wMIoZ4G0",
  "AIzaSyDnQ4cimy5a_0cJ6N038Sir2C-dPQmM-zY",
  "AIzaSyAm20_UASS5MnWv3_UqRgAnEz3CwdbfKMw",
  "AIzaSyBrSAVjQlR1oROfRZJd-phpVzF90kYqx3k"
];

let currentKeyIndex = 0;

const getActiveApiKey = () => {
  // Priority: Environment Variable > Rotation List
  const envKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.GEMINI_API_KEY;
  if (envKey && !API_KEYS.includes(envKey)) {
    return envKey;
  }
  return API_KEYS[currentKeyIndex];
};

const rotateApiKey = () => {
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  console.log(`Rotating API Key... 🔑 Now using key index: ${currentKeyIndex}`);
};

const safeJsonParse = (text: string) => {
  let cleaned = text.replace(/```json\n?|```/g, "").trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (e: any) {
    console.warn("Initial JSON parse failed, attempting to heal truncated JSON...", e.message);
    
    try {
      // Find the last valid question object closing brace '}'
      // We want the one that is likely the end of a complete object in the array
      const lastBraceIndex = cleaned.lastIndexOf('}');
      if (lastBraceIndex !== -1) {
        let healed = cleaned.substring(0, lastBraceIndex + 1);
        
        // Remove any trailing commas before closing brackets
        healed = healed.trim();
        if (healed.endsWith(',')) {
          healed = healed.slice(0, -1);
        }

        // Count open brackets/braces to close them properly
        // A typical quiz JSON: { "title": "...", "questions": [ { ... }, { ... } ] }
        if (healed.includes('"questions"')) {
           // Ensure we close the array and the main object
           // We check if the last character is '}' (which it should be from lastIndexOf)
           healed += ' ] }';
        } else {
           healed += ' }';
        }
        
        try {
          const parsed = JSON.parse(healed);
          console.log("Successfully healed JSON! Recovered questions:", parsed.questions?.length);
          return parsed;
        } catch (innerError) {
          // Final fallback: try to find the last '},' and close it there
          const lastCommaBrace = cleaned.lastIndexOf('},');
          if (lastCommaBrace !== -1) {
            const veryHealed = cleaned.substring(0, lastCommaBrace + 1) + ' ] }';
            return JSON.parse(veryHealed);
          }
          throw innerError;
        }
      }
    } catch (healError) {
      console.error("JSON Healing failed:", healError);
    }

    console.error("JSON Parse Error Details:", e, "Raw Text:", text);
    throw new Error(`JSON Parsing failed: ${e.message}`);
  }
};

// --- Helper Functions ---
const cleanOCR = (text: string) => {
  return text.replace(/\n/g, " ")
             .replace(/\s+/g, " ")
             // .replace(/O/g, "0") // OCR fix (Skipped to prevent ruining English words like 'Vocab')
             // .replace(/l/g, "1") // OCR fix (Skipped to prevent ruining English words like 'ample')
             .trim();
};

const forceAddQuestions = (text: string): Question[] => {
  let qList: Question[] = [];
  // Split by numbers followed by dot
  let parts = text.split(/\d+\./); 
  
  parts.forEach(p => {
    // If it's a decent length and doesn't look like it was caught by the main parser (which looks for options)
    if (p.length > 20 && !p.includes("(A)")) {
      qList.push({
        q_en: p.trim(),
        q_hi: "",
        options_en: ["A", "B", "C", "D"],
        options_hi: ["", "", "", ""],
        answer: "A",
        topic: "Extracted (Force Add)",
        explanation: "Caught by force-add fallback. Options were missing or broken."
      });
    }
  });

  return qList;
};

const manualParseText = (text: string): Question[] => {
  const cleaned = text.replace(/\n/g, " ")
                     .replace(/\s+/g, " ")
                     .replace(/Q\s*(\d+)/g, "Q$1")
                     .trim();
  
  let questions: Question[] = [];
  
  // Split by numbers like 1. 2. 3. OR Q1 Q2 OR just newlines if they look like questions
  const blocks = cleaned.split(/(?:\b\d{1,3}\.\s|\bQ\d+\.?\s|\b\d{1,3}\)\s)/);
  
  blocks.forEach(block => {
    // ⚡ ULTRA FLEXIBLE OPTION DETECTION
    let options = block.match(/(\(?[A-D]\)?[\.\)]?\s*[^A-D]+)/g);
    
    // ⚡ HANDLE BROKEN OPTIONS
    if (options && options.length < 4) {
      let alt = block.match(/[A-D][\.\)]\s*[^A-D]+/g);
      if (alt && alt.length >= 4) {
        options = alt;
      }
    }
    
    if (options && options.length >= 4) {
      const q = block.split(options[0])[0].trim();
      
      // Clean options
      const cleanOptions = options.map(opt => 
        opt.replace(/(?:\(?[A-D]\)?[\.\)]?)\s*/, "").trim()
      );
      
      if (q.length > 8) {
        questions.push({
          q_en: q,
          q_hi: "", // Manual parser doesn't translate
          options_en: cleanOptions.slice(0, 4),
          options_hi: ["", "", "", ""], 
          answer: cleanOptions[0], // Default to first option as answer if unknown
          topic: "Extracted",
          explanation: "Auto-extracted from OCR text."
        });
      }
    }
  });

  // 💣 Phase 2: Force Add Missed Questions
  const extra = forceAddQuestions(cleaned);
  const all = [...questions, ...extra];

  // remove duplicates
  const seen = new Set();
  const unique = all.filter(q => {
    if (seen.has(q.q_en)) return false;
    seen.add(q.q_en);
    return true;
  });

  const MAX_Q = 200;
  const limited = unique.slice(0, MAX_Q);

  console.log("FINAL COUNT:", limited.length);
  return limited;
};

const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// --- Main App ---
export default function App() {
  const [view, setView] = useState<'start' | 'quiz' | 'result' | 'creator' | 'history'>('start');
  const [quizData, setQuizData] = useState<QuizData>(DEFAULT_QUIZ);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(10);
  const [selected, setSelected] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [totalTimeTaken, setTotalTimeTaken] = useState(0);
  const [history, setHistory] = useState<QuizHistoryEntry[]>([]);
  const [timerSettings, setTimerSettings] = useState<TimerSettings>({
    enabled: true,
    secondsPerQuestion: 15
  });
  const [showTimerSettings, setShowTimerSettings] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [langMode, setLangMode] = useState<'en' | 'hi' | 'both'>('both');
  const [showExplanations, setShowExplanations] = useState(true);
  const [solutionFilter, setSolutionFilter] = useState<'all' | 'correct' | 'incorrect'>('all');
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historySort, setHistorySort] = useState<'date' | 'score'>('date');
  const [historySubjectFilter, setHistorySubjectFilter] = useState<string>('All');
  const [selectedSubject, setSelectedSubject] = useState<string>('General');
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editingHistoryTitle, setEditingHistoryTitle] = useState('');
  const [user, setUser] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [loginInput, setLoginInput] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  // Pro Scanner States
  const [scanSource, setScanSource] = useState<'upload' | 'scanner' | null>(null);
  
  // Creator State
  const [rawInput, setRawInput] = useState('');
  const [lastText, setLastText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPdfProcessing, setIsPdfProcessing] = useState(false);
  const [isImgProcessing, setIsImgProcessing] = useState(false);
  const [currentModelIndex, setCurrentModelIndex] = useState(0);
  const [pdfProgress, setPdfProgress] = useState<number>(0);
  const [imgProgress, setImgProgress] = useState<number>(0);
  const [scannerProgress, setScannerProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const correctSound = useRef<HTMLAudioElement | null>(null);
  const wrongSound = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      setCurrentUser(fbUser);
      setIsAuthReady(true);
      if (fbUser) {
        setUser(fbUser.displayName || 'User');
        setIsLoggedIn(true);
        localStorage.removeItem('quiz_guest_user'); // Clear guest if logged in via Google
        // Sync user profile to Firestore
        setDoc(doc(db, 'users', fbUser.uid), {
          uid: fbUser.uid,
          displayName: fbUser.displayName,
          email: fbUser.email,
          photoURL: fbUser.photoURL,
          lastActive: serverTimestamp()
        }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${fbUser.uid}`));
      } else {
        // Check for guest user if not logged in via Firebase
        const savedGuest = localStorage.getItem('quiz_guest_user');
        if (savedGuest) {
          setUser(savedGuest);
          setIsLoggedIn(true);
        } else {
          setUser('');
          setIsLoggedIn(false);
        }
      }
    });

    const savedBest = localStorage.getItem('quiz_best_score');
    if (savedBest) setBestScore(parseInt(savedBest, 10));
    
    const savedLang = localStorage.getItem('quiz_lang_mode');
    if (savedLang === 'en' || savedLang === 'hi' || savedLang === 'both') {
      setLangMode(savedLang as 'en' | 'hi' | 'both');
    }

    const savedHistory = localStorage.getItem('quizHistory');
    const backupHistory = localStorage.getItem('quizHistory_backup');
    
    if (savedHistory) {
      console.log("Loading history from local storage... 📊");
      setHistory(JSON.parse(savedHistory));
    } else if (backupHistory) {
      console.log("Primary history missing, restoring from backup... 🔄");
      setHistory(JSON.parse(backupHistory));
    }

    correctSound.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3');
    wrongSound.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3');

    return () => unsubscribe();
  }, []);

  // Real-time Firestore History Sync
  useEffect(() => {
    if (!currentUser) return;

    const historyRef = collection(db, 'users', currentUser.uid, 'history');
    const q = query(historyRef, orderBy('timestamp', 'desc'), limit(50));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cloudHistory = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as QuizHistoryEntry[];
      
      setHistory(cloudHistory);
      localStorage.setItem('quizHistory', JSON.stringify(cloudHistory));
      localStorage.setItem('quizHistory_backup', JSON.stringify(cloudHistory));
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}/history`));

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('quiz_lang_mode', langMode);
  }, [langMode]);

  const handleLogin = async () => {
    try {
      console.log("Starting Google Login... 🚀");
      const result = await signInWithGoogle();
      console.log("Login Success:", result.user.displayName);
    } catch (err: any) {
      console.error("Firebase Login Error Code:", err.code);
      console.error("Firebase Login Error Message:", err.message);
      
      if (err.code === 'auth/unauthorized-domain') {
        const currentDomain = window.location.hostname;
        const settingsUrl = "https://console.firebase.google.com/project/united-kiln-470409-v8/authentication/settings";
        alert(`Domain Not Authorized! ❌\n\n1. Copy this domain: ${currentDomain}\n2. Go to Firebase Console Settings:\n${settingsUrl}\n3. Add the domain to "Authorized domains" section.`);
      } else if (err.code === 'auth/popup-blocked') {
        alert("Popup Blocked! 🚫\nPlease allow popups for this site to login with Google.");
      } else {
        alert(`Login failed: ${err.message}\n\nYou can still continue as a Guest! 👤`);
      }
    }
  };

  const handleGuestLogin = () => {
    if (!loginInput.trim()) {
      alert("Please enter your name to continue! ❗");
      return;
    }
    const guestName = loginInput.trim();
    setUser(guestName);
    setIsLoggedIn(true);
    localStorage.setItem('quiz_guest_user', guestName);
  };

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to logout?")) {
      try {
        if (currentUser) {
          await firebaseLogout();
        }
        setUser('');
        setIsLoggedIn(false);
        localStorage.removeItem('quiz_guest_user');
        // History is NOT cleared on logout for permanent storage on device
      } catch (err) {
        console.error("Logout failed:", err);
      }
    }
  };

  const startQuiz = (data: QuizData = quizData) => {
    if (!data.questions || data.questions.length === 0) {
      setError("No questions found in this quiz. Please provide some content first.");
      return;
    }

    console.log("Starting Quiz with Questions:", data.questions.length);
    console.log("Sample Question Data:", data.questions[0]);

    const shuffled = shuffleArray(data.questions).map(q => {
      // Robustly handle different question text keys
      const q_en = q.q_en || (q as any).question || (q as any).text || (q as any).q || "";
      const q_hi = q.q_hi || (q as any).question_hi || (q as any).text_hi || "";

      // Robustly handle different option keys and missing translations
      const opts_en = q.options_en || (q as any).options || (q as any).choices || [];
      const opts_hi = q.options_hi || (q as any).choices_hi || [];
      
      // Ensure we have at least some options to show
      const final_opts_en = opts_en.length > 0 ? opts_en : ["Option A", "Option B", "Option C", "Option D"];
      
      const combined = final_opts_en.map((en, i) => ({ 
        en, 
        hi: opts_hi[i] || en // Fallback to English if Hindi translation is missing
      }));
      
      const shuffledOptions = shuffleArray(combined) as { en: string, hi: string }[];
      return {
        ...q,
        q_en: q_en || "Question text missing",
        q_hi: q_hi || q_en || "Question text missing",
        options_en: shuffledOptions.map(o => o.en),
        options_hi: shuffledOptions.map(o => o.hi)
      };
    });
    setQuestions(shuffled);
    setCurrentIdx(0);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setUserAnswers([]);
    setStartTime(Date.now());
    setView('quiz');
    setIsPaused(false);
    setShowExitConfirm(false);
    resetQuestion();
  };

  const exitQuiz = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setView('start');
    setCurrentIdx(0);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setUserAnswers([]);
    setIsPaused(false);
    setShowExitConfirm(false);
    if (rawInput) {
      setLastText(rawInput);
      setRawInput('');
    }
  };

  const retryIncorrect = () => {
    const incorrectQs = questions.filter((_, idx) => {
      const ans = userAnswers.find(a => a.questionIdx === idx);
      return !ans || !ans.isCorrect;
    });
    if (incorrectQs.length === 0) return;
    
    setQuestions(incorrectQs);
    setCurrentIdx(0);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setUserAnswers([]);
    setStartTime(Date.now());
    setView('quiz');
    setIsPaused(false);
    setShowExitConfirm(false);
    resetQuestion();
  };

  const resetQuestion = useCallback(() => {
    setSelected(null);
    setIsAnswered(false);
    setTimeLeft(timerSettings.enabled ? timerSettings.secondsPerQuestion : 999);
    setStartTime(Date.now());
  }, [timerSettings]);

  const saveHistory = useCallback(async (finalScore: number, total: number, manual = false) => {
    const entryId = Date.now().toString();
    
    // 💣 Duplicate Prevention: Check if the last entry is identical
    if (history.length > 0) {
      const lastEntry = history[0];
      if (lastEntry.title === (quizData.title || "Untitled Quiz") && 
          lastEntry.total === total && 
          lastEntry.score === finalScore &&
          JSON.stringify(lastEntry.questions) === JSON.stringify(questions)) {
        console.log("Duplicate attempt detected, skipping save... ⚠️");
        if (manual) alert("Already saved to history! ⚠️");
        return;
      }
    }

    const newEntry: QuizHistoryEntry = {
      id: entryId,
      date: new Date().toLocaleString(),
      title: quizData.title || "Untitled Quiz",
      score: finalScore,
      total: total,
      percent: ((finalScore / total) * 100).toFixed(2),
      questions: questions,
      user: user || "Guest",
      subject: selectedSubject
    };

    // Update Local State (Increased limit to 200 for 'permanent' feel)
    const updatedHistory = [newEntry, ...history].slice(0, 200);
    setHistory(updatedHistory);
    localStorage.setItem('quizHistory', JSON.stringify(updatedHistory));
    localStorage.setItem('quizHistory_backup', JSON.stringify(updatedHistory));

    if (manual) alert("Quiz Saved Successfully ✅");

    // Sync to Cloud if logged in
    if (currentUser) {
      try {
        const historyRef = doc(db, 'users', currentUser.uid, 'history', entryId);
        await setDoc(historyRef, {
          ...newEntry,
          uid: currentUser.uid,
          timestamp: serverTimestamp()
        });

        // Update Leaderboard if it's a high score
        if (finalScore > bestScore) {
          await setDoc(doc(db, 'leaderboard', currentUser.uid), {
            uid: currentUser.uid,
            displayName: user,
            score: finalScore,
            timestamp: serverTimestamp()
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/history/${entryId}`);
      }
    }
    
    console.log("✅ Quiz history saved successfully (Cloud synced)");
  }, [history, quizData.title, questions, currentUser, user, bestScore, selectedSubject]);

  const saveCurrentProgress = useCallback(async () => {
    if (!questions || questions.length === 0) {
      alert("No quiz loaded ❌");
      return;
    }

    const entryId = Date.now().toString();
    
    const newEntry: QuizHistoryEntry = {
      id: entryId,
      date: new Date().toLocaleString(),
      title: quizData.title || "Untitled Quiz",
      score: score,
      total: questions.length,
      percent: ((score / questions.length) * 100).toFixed(2),
      questions: questions,
      user: user || "Guest",
      progress: currentIdx,
      userAnswers: userAnswers,
      subject: selectedSubject
    };

    const updatedHistory = [newEntry, ...history].slice(0, 200);
    setHistory(updatedHistory);
    localStorage.setItem('quizHistory', JSON.stringify(updatedHistory));
    localStorage.setItem('quizHistory_backup', JSON.stringify(updatedHistory));

    alert(`Quiz Progress Saved at Question ${currentIdx + 1} 💾`);

    if (currentUser) {
      try {
        const historyRef = doc(db, 'users', currentUser.uid, 'history', entryId);
        await setDoc(historyRef, {
          ...newEntry,
          uid: currentUser.uid,
          timestamp: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/history/${entryId}`);
      }
    }
  }, [history, quizData, questions, score, currentIdx, userAnswers, user, currentUser, selectedSubject]);

  const reattemptQuiz = (entry: QuizHistoryEntry) => {
    const reattemptData: QuizData = {
      title: entry.title,
      questions: entry.questions
    };
    
    if (entry.progress !== undefined && entry.progress > 0 && entry.progress < entry.total - 1) {
      if (window.confirm(`You have saved progress at question ${entry.progress + 1}. Do you want to resume?`)) {
        resumeQuiz(entry);
        return;
      }
    }

    setQuizData(reattemptData);
    startQuiz(reattemptData);
    alert("Reattempt Started 🔁");
  };

  const resumeQuiz = (entry: QuizHistoryEntry) => {
    const reattemptData: QuizData = {
      title: entry.title,
      questions: entry.questions
    };
    setQuizData(reattemptData);
    setQuestions(entry.questions);
    setCurrentIdx(entry.progress || 0);
    setScore(entry.score || 0);
    setUserAnswers(entry.userAnswers || []);
    setView('quiz');
    setStartTime(Date.now());
    setIsPaused(false);
    setShowExitConfirm(false);
    resetQuestion();
    alert("Quiz Resumed 🔄");
  };

  const deleteSelectedHistory = async () => {
    if (selectedHistoryIds.length === 0) {
      alert("Please select at least one quiz attempt to delete.");
      return;
    }

    if (window.confirm(`Are you sure you want to delete ${selectedHistoryIds.length} selected attempt(s)?`)) {
      try {
        // 1. Delete from Firestore if logged in
        if (currentUser) {
          for (const id of selectedHistoryIds) {
            await deleteDoc(doc(db, 'users', currentUser.uid, 'history', id));
          }
        }

        // 2. Update local state (this will be overwritten by onSnapshot if logged in, but good for offline/guest)
        const newHistory = history.filter(entry => !selectedHistoryIds.includes(entry.id));
        setHistory(newHistory);
        localStorage.setItem('quizHistory', JSON.stringify(newHistory));
        setSelectedHistoryIds([]);
        alert("Selected attempts deleted 🗑️");
      } catch (err) {
        console.error("Delete failed:", err);
        alert("Failed to delete some items. Please try again.");
      }
    }
  };

  const clearAllHistory = async () => {
    if (window.confirm("Are you sure you want to clear your entire history? 🗑️ This cannot be undone.")) {
      try {
        // 1. Delete from Firestore if logged in
        if (currentUser) {
          const historyRef = collection(db, 'users', currentUser.uid, 'history');
          const snapshot = await getDocs(historyRef);
          for (const docSnap of snapshot.docs) {
            await deleteDoc(doc(db, 'users', currentUser.uid, 'history', docSnap.id));
          }
        }

        // 2. Update local state
        setHistory([]);
        localStorage.removeItem('quizHistory');
        localStorage.removeItem('quizHistory_backup');
        setSelectedHistoryIds([]);
        alert("History Cleared ✅");
      } catch (err) {
        console.error("Clear history failed:", err);
        alert("Failed to clear history. Please try again.");
      }
    }
  };

  const renameHistoryEntry = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    
    try {
      // 1. Update Local State
      const updatedHistory = history.map(entry => 
        entry.id === id ? { ...entry, title: newTitle } : entry
      );
      setHistory(updatedHistory);
      localStorage.setItem('quizHistory', JSON.stringify(updatedHistory));
      localStorage.setItem('quizHistory_backup', JSON.stringify(updatedHistory));
      
      // 2. Update Firestore if logged in
      if (currentUser) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'history', id), {
          title: newTitle
        });
      }
      
      setEditingHistoryId(null);
      alert("Quiz Renamed Successfully! ✏️");
    } catch (err) {
      console.error("Rename failed:", err);
      alert("Failed to rename quiz. Please try again.");
    }
  };

  const toggleSelectHistory = (id: string) => {
    setSelectedHistoryIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllHistory = () => {
    const filteredIds = history
      .filter(entry => {
        const matchesSearch = entry.title.toLowerCase().includes(historySearch.toLowerCase());
        const matchesSubject = historySubjectFilter === 'All' || entry.subject === historySubjectFilter;
        return matchesSearch && matchesSubject;
      })
      .map(entry => entry.id);
      
    if (filteredIds.length > 0 && filteredIds.every(id => selectedHistoryIds.includes(id))) {
      setSelectedHistoryIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedHistoryIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };


  const handleNext = useCallback(() => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(prev => prev + 1);
      resetQuestion();
    } else {
      const finalTime = Math.round((Date.now() - startTime) / 1000);
      setTotalTimeTaken(finalTime);
      setView('result');
      saveHistory(score, questions.length);
      if (score > bestScore) {
        setBestScore(score);
        localStorage.setItem('quiz_best_score', score.toString());
      }
      if (rawInput) {
        setLastText(rawInput);
        setRawInput('');
      }
    }
  }, [currentIdx, questions.length, score, bestScore, resetQuestion, startTime, rawInput]);

  const handleAnswer = (option: string | null) => {
    if (isAnswered || isPaused || showExitConfirm) return;
    
    const currentQ = questions[currentIdx];
    const isCorrect = option === currentQ.answer;
    const timeTaken = Math.round((Date.now() - startTime) / 1000);

    setSelected(option);
    setIsAnswered(true);
    
    setUserAnswers(prev => [...prev, {
      questionIdx: currentIdx,
      selected: option,
      isCorrect,
      timeTaken
    }]);

    if (isCorrect) {
      setScore(prev => prev + 1);
      setStreak(prev => {
        const newStreak = prev + 1;
        if (newStreak > maxStreak) setMaxStreak(newStreak);
        return newStreak;
      });
      correctSound.current?.play().catch(() => {});
    } else {
      setStreak(0);
      wrongSound.current?.play().catch(() => {});
    }

    setTimeout(handleNext, 1500);
  };

  useEffect(() => {
    if (view === 'quiz' && !isAnswered && timerSettings.enabled && !isPaused && !showExitConfirm) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleAnswer(null); // Time's up
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [view, isAnswered, handleNext, timerSettings.enabled, isPaused, showExitConfirm]);

  // --- AI Processing ---
  const processAI = async (textOverride?: string, retryCount = 0, modelIdx = currentModelIndex) => {
    let textToProcess = textOverride || rawInput;
    if (!textToProcess.trim()) return;

    if (retryCount === 0) {
      setQuizData(DEFAULT_QUIZ);
    }
    setIsProcessing(true);
    setError(null);

    // 🛡️ Smart Chunking for Large Inputs (No Loss System)
    // If text is very large, we split it to avoid context window or output truncation issues
    const CHUNK_SIZE = 15000; // ~4000-5000 words
    if (textToProcess.length > CHUNK_SIZE && retryCount === 0) {
      console.log(`Large input detected (${textToProcess.length} chars). Splitting into chunks... ✂️`);
      const chunks = [];
      for (let i = 0; i < textToProcess.length; i += CHUNK_SIZE) {
        chunks.push(textToProcess.substring(i, i + CHUNK_SIZE));
      }

      let allQuestions: Question[] = [];
      let combinedTitle = "Combined Quiz";

      for (let i = 0; i < chunks.length; i++) {
        console.log(`Processing Chunk ${i + 1}/${chunks.length}... 🔄`);
        try {
          const result = await callGemini(chunks[i], modelIdx);
          if (result && result.questions) {
            allQuestions = [...allQuestions, ...result.questions];
            if (i === 0) combinedTitle = result.title || "Combined Quiz";
          }
          // Add delay between chunks to avoid rate limits
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          console.error(`Chunk ${i + 1} failed:`, e);
        }
      }

      if (allQuestions.length > 0) {
        const finalData = { title: combinedTitle, questions: allQuestions.slice(0, 300) };
        setQuizData(finalData);
        startQuiz(finalData);
        alert(`✅ Success! Extracted ${allQuestions.length} questions from all parts.`);
        setIsProcessing(false);
        return;
      }
    }

    try {
      const data = await callGemini(textToProcess, modelIdx);
      
      if (data.questions && data.questions.length > 0) {
        if (data.subject) {
          setSelectedSubject(data.subject);
        }
        const MAX_Q = 200;
        data.questions = data.questions.slice(0, MAX_Q);
        console.log(`AI Extracted Questions: ${data.questions.length} using ${AI_MODELS[modelIdx]}`);
        console.log("Final Count:", data.questions.length);
        setQuizData(data);
        startQuiz(data);
        alert(`✅ Generated: ${data.questions.length} questions using ${AI_MODELS[modelIdx]}`);
      } else {
        throw new Error("AI could not find any valid questions in the text.");
      }
    } catch (err: any) {
      console.error("AI Error:", err);
      const errMsg = err.message || "";
      
      // 🔄 Model Rotation & Retry System
      if (retryCount < 5) {
        const nextModelIdx = (modelIdx + 1) % AI_MODELS.length;
        setCurrentModelIndex(nextModelIdx);
        
        console.log(`Model ${AI_MODELS[modelIdx]} failed (${errMsg.substring(0, 50)}...). Swapping to ${AI_MODELS[nextModelIdx]}... 🔄 Attempt ${retryCount + 1}`);
        
        // Switch API key if available
        if (typeof rotateApiKey === 'function') rotateApiKey();
        
        await new Promise(r => setTimeout(r, 1500)); // 1.5s delay as requested
        return processAI(textToProcess, retryCount + 1, nextModelIdx);
      }

      // 💣 Emergency Fallback (If ALL models fail)
      console.log("All AI models failed → using fallback parser ⚡");
      const manualQuestions = manualParseText(textToProcess);
      if (manualQuestions.length > 0) {
        const fallbackData: QuizData = {
          title: "Extracted Quiz (Fallback Mode)",
          questions: manualQuestions
        };
        setQuizData(fallbackData);
        startQuiz(fallbackData);
        alert(`AI failed after multiple attempts, but we extracted ${manualQuestions.length} questions using the fallback parser! ⚡`);
        setIsProcessing(false);
        return;
      }

      setError(`AI Processing Failed after multiple attempts: ${errMsg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const callGemini = async (text: string, modelIdx: number): Promise<QuizData> => {
    const apiKey = getActiveApiKey();
    if (!apiKey) throw new Error("API Key missing.");
    
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: AI_MODELS[modelIdx],
      contents: `Act as a senior exam system designer and educational content creator.

CRITICAL INSTRUCTION: PRIORITIZE EXTRACTION. If the input contains text that looks like existing questions, test material, or study notes, you MUST extract questions present in the text.
IMPORTANT: Aim for a maximum of 50 high-quality questions per chunk to avoid output truncation.

Rules:
1. EXTRACT THOROUGHLY: Be extremely thorough. Extract as many questions as possible within the output limit.
2. HANDLE MESSY OCR: OCR often breaks lines randomly. Reconstruct the full question and its options by looking at the context.
3. STRICT 4-OPTION FORMAT: You MUST provide exactly 4 options for both English and Hindi. If the source text has fewer than 4 options, intelligently generate plausible distractors to reach exactly 4.
4. AUTO-ANSWER DETECTION: If the correct answer is not marked, use your internal knowledge to determine the correct answer automatically.
5. FULL BILINGUAL MODE: Provide both the question AND each option in English and Hindi. Ensure a 1-to-1 translation match between options_en and options_hi.
6. SUBJECT DETECTION: Identify the primary subject of the quiz from the content. Choose from: "General", "Polity", "History", "Geography", "Reasoning", "Math", "English".
7. Each question must include:
   - "q_en": question text in English
   - "q_hi": question text in Hindi
   - "options_en": array of exactly 4 options in English
   - "options_hi": array of exactly 4 options in Hindi (corresponding to options_en)
   - "answer": the correct option. This MUST be an EXACT string match to one of the items in the "options_en" array.
   - "topic": topic tag (e.g., "Vocab", "One Word Substitution", "Grammar").
   - "explanation": A detailed step-by-step explanation or reasoning for why that answer is correct.

7. Important:
- No duplicate questions.
- Clean text (remove extra symbols, numbers, OCR errors).
- OUTPUT RAW JSON ONLY. DO NOT WRAP IN MARKDOWN CODE BLOCKS. THE RESPONSE MUST START WITH { AND END WITH }.
- If you are reaching your output limit, ensure you close the JSON structure properly.

INPUT:
${text}`,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subject: { type: Type.STRING, description: "One of: General, Polity, History, Geography, Reasoning, Math, English" },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  q_en: { type: Type.STRING },
                  q_hi: { type: Type.STRING },
                  options_en: { type: Type.ARRAY, items: { type: Type.STRING } },
                  options_hi: { type: Type.ARRAY, items: { type: Type.STRING } },
                  answer: { type: Type.STRING },
                  topic: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                },
                required: ["q_en", "q_hi", "options_en", "options_hi", "answer", "explanation"]
              }
            }
          },
          required: ["title", "questions"]
        }
      }
    });

    return safeJsonParse(response.text);
  };

  const handleGenerateQuiz = async () => {
    if (isProcessing) return;

    // 1. If we already have questions loaded, prioritize starting the quiz
    if (quizData && quizData !== DEFAULT_QUIZ && quizData.questions.length > 0) {
      if (quizData.questions.length < 10) {
        alert("⚠️ Low questions detected, try better input for a better experience.");
      }
      startQuiz();
      return;
    }

    // 2. If no questions but we have text, process it
    if (rawInput.trim().length > 20) {
      await processAI();
      return;
    }

    setError("⚠️ Please upload a PDF, image, or paste text (min 20 chars) first.");
  };

  const handleJSONImport = () => {
    try {
      const data = safeJsonParse(rawInput);
      if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error("Invalid structure: JSON must contain a 'questions' array with at least one question.");
      }
      
      console.log("Manual JSON Import Success:", data.questions.length, "questions");

      setQuizData(data);
      startQuiz(data);
    } catch (err) {
      setError(`Import Error: ${err instanceof Error ? err.message : "Invalid JSON format. Please check the syntax."}`);
    }
  };

  const clearText = () => {
    if (rawInput) {
      setLastText(rawInput);
      setRawInput('');
      setQuizData(DEFAULT_QUIZ);
    }
  };

  const undoText = () => {
    if (lastText) {
      setRawInput(lastText);
      setQuizData(DEFAULT_QUIZ);
    } else {
      alert("Nothing to undo 😅");
    }
  };

  const downloadText = () => {
    if (!rawInput) {
      alert("No text to download ❌");
      return;
    }
    const blob = new Blob([rawInput], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "quiz_text.txt";
    link.click();
  };

  const exportJSON = () => {
    if (!quizData.questions || quizData.questions.length === 0) {
      alert("No quiz data to export ❌");
      return;
    }
    const dataStr = JSON.stringify(quizData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "quiz_data.json";
    link.click();
  };

  const importJSONFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.questions && data.questions.length > 0) {
          setRawInput(JSON.stringify(data, null, 2));
          setQuizData(data);
          alert("Quiz Loaded Successfully ✅");
        } else {
          alert("Import Error: Invalid JSON format. The file must contain a 'questions' array.");
        }
      } catch (err) {
        alert("Import Error: Failed to parse the JSON file. Please ensure it is valid JSON.");
        console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const clearCache = () => {
    // Only clear non-essential cache, NOT the whole localStorage
    localStorage.removeItem('quiz_lang_mode');
    localStorage.removeItem('quiz_best_score');
    alert("Cache Cleared (History is SAFE) 🗑️✅");
    window.location.reload();
  };

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setIsPdfProcessing(true);
    setError(null);
    setPdfProgress(0);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        
        // Try to extract text first
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ");
        
        if (pageText.trim().length > 50) {
          // If there's enough selectable text, use it
          fullText += pageText + "\n";
        } else {
          // Otherwise, use OCR
          const viewport = page.getViewport({ scale: 1.8 });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: ctx, viewport: viewport, canvas: canvas }).promise;

          const { data: { text } } = await Tesseract.recognize(canvas, 'eng', {
            logger: m => {
              if (m.status === 'recognizing text') {
                const progress = (i - 1) / pdf.numPages + (m.progress / pdf.numPages);
                setPdfProgress(Math.round(progress * 100));
              }
            }
          });
          fullText += text + "\n";
        }
        setPdfProgress(Math.round((i / pdf.numPages) * 100));
      }

      if (!fullText.trim()) throw new Error("No text found in PDF.");
      
      const manualQuestions = manualParseText(fullText);
      if (manualQuestions.length > 0) {
        console.log("Final Count:", manualQuestions.length);
        alert("✅ Generated: " + manualQuestions.length + " questions");
      }

      setRawInput(fullText);
      await processAI(fullText);
    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || "";
      if (errMsg.includes("password")) {
        setError("File Error: The uploaded PDF is password-protected. Please remove the password and try again.");
      } else if (errMsg.includes("Invalid PDF")) {
        setError("File Error: The uploaded file is not a valid PDF or is corrupted. Please check the file and try again.");
      } else {
        setError(`PDF Extraction Failed: ${errMsg || "Ensure the PDF is valid and not password protected."}`);
      }
    } finally {
      setIsProcessing(false);
      setIsPdfProcessing(false);
      setPdfProgress(0);
    }
  };











  const processScannerImage = async (base64Image: string, retryCount = 0) => {
    if (retryCount === 0) {
      setQuizData(DEFAULT_QUIZ);
    }
    setIsProcessing(true);
    setIsImgProcessing(true);
    setError(null);
    if (scanSource === 'upload') {
      setImgProgress(50);
    } else {
      setScannerProgress(50);
    }

    try {
      const apiKey = getActiveApiKey();
      if (!apiKey) {
        throw new Error("API Key missing. Please set GEMINI_API_KEY in your environment variables via the Secrets panel.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            inlineData: {
              data: base64Image.split(',')[1],
              mimeType: 'image/jpeg'
            }
          },
          `Act as a senior exam system designer and data extraction expert.

CRITICAL INSTRUCTION: PRIORITIZE EXTRACTION. Extract all the questions, options, and correct answers from this image. Do not generate new questions unless the image is just a short topic keyword.
Fix any blurry or misspelled text using your AI vision capabilities. 

Rules:
1. STRICT 4-OPTION FORMAT: You MUST provide exactly 4 options for both English and Hindi. If the image has fewer than 4 options, intelligently generate plausible distractors to reach exactly 4.
2. FULL BILINGUAL MODE: Provide both the question AND each option in English and Hindi. Ensure a 1-to-1 translation match between options_en and options_hi.
3. SUBJECT DETECTION: Identify the primary subject of the quiz from the content. Choose from: "General", "Polity", "History", "Geography", "Reasoning", "Math", "English".
4. OUTPUT RAW JSON ONLY. DO NOT WRAP IN MARKDOWN CODE BLOCKS (like \`\`\`json). DO NOT INCLUDE ANY INTRODUCTORY OR CONCLUDING TEXT. THE RESPONSE MUST START WITH { AND END WITH }.

Each question must include:
- "q_en": question text in English
- "q_hi": question text in Hindi
- "options_en": array of exactly 4 options in English
- "options_hi": array of exactly 4 options in Hindi
- "answer": the correct option. This MUST be an EXACT string match to one of the items in the "options_en" array.
- "topic": topic tag
- "explanation": A detailed step-by-step explanation or reasoning.`
        ],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              subject: { type: Type.STRING, description: "One of: General, Polity, History, Geography, Reasoning, Math, English" },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    q_en: { type: Type.STRING },
                    q_hi: { type: Type.STRING },
                    options_en: { type: Type.ARRAY, items: { type: Type.STRING } },
                    options_hi: { type: Type.ARRAY, items: { type: Type.STRING } },
                    answer: { type: Type.STRING },
                    topic: { type: Type.STRING },
                    explanation: { type: Type.STRING }
                  },
                  required: ["q_en", "q_hi", "options_en", "options_hi", "answer", "explanation"]
                }
              }
            },
            required: ["title", "questions"]
          }
        }
      });

      if (scanSource === 'upload') {
        setImgProgress(100);
      } else {
        setScannerProgress(100);
      }
      const jsonStr = response.text?.trim() || "{}";
      const data = safeJsonParse(jsonStr);
      if (!data.questions || data.questions.length === 0) {
        throw new Error("No questions found in the image.");
      }
      
      if (data.subject) {
        setSelectedSubject(data.subject);
      }
      
      console.log(`AI Image Extracted Questions: ${data.questions.length}`);
      setQuizData(data);
      startQuiz(data);
    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || "";

      // 🔄 Auto Retry System for 503, Network, or Parsing Errors
      if ((errMsg.includes("503") || errMsg.includes("Service Unavailable") || errMsg.includes("Rpc failed") || errMsg.includes("fetch") || errMsg.includes("quota") || errMsg.includes("429") || errMsg.includes("JSON") || errMsg.includes("Parsing")) && retryCount < 5) {
        console.log(`Gemini Error (${errMsg.includes("JSON") ? "Parsing" : "Busy/Quota"}) -> Retrying Image... 🔄 Attempt ${retryCount + 1}`);
        rotateApiKey(); // Switch key on failure
        await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds
        return processScannerImage(base64Image, retryCount + 1);
      }

      if (errMsg.includes("API Key missing") || errMsg.includes("not found")) {
        setError("Configuration Error: Gemini API Key is missing. Please add your GEMINI_API_KEY in the environment variables/settings.");
      } else if (errMsg.includes("API key") || errMsg.includes("key not valid") || errMsg.includes("unauthorized")) {
        setError("Authentication Error: The provided Gemini API Key is invalid or expired. Please verify your API key in the settings.");
      } else if (errMsg.includes("quota") || errMsg.includes("429")) {
        setError("Quota Exceeded: You have reached the rate limit for the Gemini API. Please try again later or check your billing details.");
      } else if (errMsg.includes("No questions found")) {
        setError("Extraction Error: No questions could be identified in the image. Please ensure the text is legible and contains clear questions.");
      } else {
        setError(`Image Processing Failed: ${errMsg || "Ensure the text in the image is somewhat legible."}`);
      }
    } finally {
      setIsProcessing(false);
      setIsImgProcessing(false);
      setScannerProgress(0);
      setImgProgress(0);
      setScanSource(null);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, source: 'upload' | 'scanner' = 'upload') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setIsImgProcessing(true);
    setError(null);
    setScanSource(source);
    if (source === 'upload') {
      setImgProgress(0);
    } else {
      setScannerProgress(0);
    }

    try {
      const optimizedImage = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(img.src);
            return;
          }
          
          const scale = Math.max(0.8, Math.min(1, 1500 / Math.max(img.width, img.height)));
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
          URL.revokeObjectURL(img.src);
        };
        img.onerror = () => {
          URL.revokeObjectURL(img.src);
          reject(new Error("Failed to load image"));
        };
        img.src = URL.createObjectURL(file);
      });

      processScannerImage(optimizedImage);
    } catch (err: any) {
      console.error(err);
      setError(`Image Upload Failed: ${err.message || "Failed to read or process the image file. Please try a different image."}`);
      setIsProcessing(false);
      setIsImgProcessing(false);
    } finally {
      e.target.value = ''; // Reset input
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans selection:bg-indigo-500/30">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full" />
      </div>

      {/* Login Overlay */}
      {(!isLoggedIn || !isAuthReady) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md p-8 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-indigo-500/30">
              <Trophy className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Welcome to QuizGenius</h2>
            <p className="text-slate-400 mb-8">Sign in with Google to sync your progress, or continue as a Guest.</p>
            
            {!isAuthReady ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Initializing...</p>
              </div>
            ) : (
              <div className="space-y-6">
                <button 
                  onClick={handleLogin}
                  className="w-full py-4 bg-white text-slate-900 hover:bg-slate-100 rounded-2xl font-bold text-lg transition-all active:scale-95 shadow-lg flex items-center justify-center gap-3"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
                  Sign in with Google
                </button>

                <div className="relative flex items-center gap-4 py-2">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">OR</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <div className="space-y-3">
                  <input 
                    type="text" 
                    value={loginInput}
                    onChange={(e) => setLoginInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGuestLogin()}
                    placeholder="Enter your name..."
                    className="w-full py-4 px-6 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-indigo-500 transition-all text-center text-lg font-medium"
                  />
                  <button 
                    onClick={handleGuestLogin}
                    className="w-full py-4 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 rounded-2xl font-bold text-lg transition-all active:scale-95"
                  >
                    Continue as Guest
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {view === 'start' && (
          <motion.div
            key="start"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl text-center z-10"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-indigo-500/30">
              <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-400" />
            </div>
            
            {isLoggedIn && (
              <div className="mb-6 flex items-center justify-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10 w-fit mx-auto">
                <User className="w-3 h-3 text-indigo-400" />
                <span className="text-xs font-medium text-slate-300">Welcome, <span className="text-indigo-400 font-bold">{user}</span></span>
                <button 
                  onClick={handleLogout}
                  className="ml-2 text-[10px] text-slate-500 hover:text-red-400 transition-colors uppercase tracking-wider font-bold"
                >
                  Logout
                </button>
              </div>
            )}

            <h1 className="text-3xl sm:text-4xl font-bold mb-2 tracking-tight">QuizGenius</h1>
            <p className="text-sm sm:text-base text-slate-400 mb-8">Play the default vocab quiz or create your own from raw text or JSON.</p>
            
            <div className="space-y-3">
              <button
                onClick={() => startQuiz()}
                className="w-full py-3 sm:py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-base sm:text-lg transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <Play className="w-5 h-5 fill-current" />
                Play Default Quiz
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setView('creator')}
                  className="py-3 sm:py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 rounded-2xl font-bold text-base sm:text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Upload className="w-5 h-5" />
                  Create
                </button>
                <button
                  onClick={() => setShowTimerSettings(true)}
                  className="py-3 sm:py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 rounded-2xl font-bold text-base sm:text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Timer className="w-5 h-5" />
                  Timer
                </button>
              </div>
            </div>

            {bestScore > 0 && (
              <div className="mt-8 p-4 rounded-2xl bg-white/5 border border-white/5 inline-block">
                <p className="text-[10px] sm:text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">Best Score</p>
                <p className="text-xl sm:text-2xl font-mono text-indigo-400">{bestScore}</p>
              </div>
            )}
          </motion.div>
        )}

        {view === 'creator' && (
          <motion.div
            key="creator"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-2xl p-6 sm:p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl z-10"
          >
            <button onClick={() => setView('start')} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors text-sm sm:text-base">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
              <h2 className="text-2xl sm:text-3xl font-bold">Quiz Creator</h2>
              <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full w-fit">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Smart AI Extraction</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
              <p className="text-xs sm:text-sm text-slate-400">Paste messy PDF text to use AI extraction, or paste valid JSON directly.</p>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={clearText} className="text-xs flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors">
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
                <button onClick={undoText} className="text-xs flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors">
                  <Undo2 className="w-3 h-3" /> Undo
                </button>
                <button onClick={downloadText} className="text-xs flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors">
                  <Download className="w-3 h-3" /> Save Text
                </button>
                <button 
                  onClick={() => {
                    const template = JSON.stringify({
                      title: "SSC Quiz",
                      questions: [{
                        q_en: "Question in English",
                        q_hi: "हिंदी में प्रश्न",
                        options_en: ["Option A", "Option B", "Option C", "Option D"],
                        options_hi: ["विकल्प ए", "विकल्प बी", "विकल्प सी", "विकल्प डी"],
                        answer: "Option A",
                        topic: "Vocab",
                        explanation: "Detailed explanation here."
                      }]
                    }, null, 2);
                    navigator.clipboard.writeText(template);
                    setRawInput(template);
                  }}
                  className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Copy className="w-3 h-3" /> Copy Template
                </button>
                <button 
                  onClick={() => setShowJsonPreview(true)}
                  className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <FileJson className="w-3 h-3" /> Preview JSON
                </button>
                <button 
                  onClick={clearCache}
                  className="text-xs flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Clear Cache
                </button>
              </div>
            </div>

            <textarea
              value={rawInput}
              onChange={(e) => {
                setRawInput(e.target.value);
                if (quizData !== DEFAULT_QUIZ) {
                  setQuizData(DEFAULT_QUIZ);
                }
              }}
              placeholder='Paste your text or JSON here...'
              className="w-full h-48 sm:h-64 bg-slate-900/50 border border-white/10 rounded-2xl p-4 font-mono text-xs sm:text-sm focus:outline-none focus:border-indigo-500/50 transition-colors resize-none mb-4"
            />

            {error && <p className="text-red-400 text-xs sm:text-sm mb-4 flex items-center gap-2"><XCircle className="w-4 h-4" /> {error}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="relative">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handlePDFUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  disabled={isProcessing}
                />
                <button
                  disabled={isProcessing}
                  className="w-full py-3 sm:py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-2xl font-bold flex flex-col items-center justify-center gap-1 transition-all text-sm sm:text-base"
                >
                  <div className="flex items-center gap-2">
                    {isPdfProcessing ? <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FileUp className="w-4 h-4 sm:w-5 sm:h-5" />}
                    Upload PDF
                  </div>
                  {pdfProgress > 0 && pdfProgress < 100 && (
                    <span className="text-[10px] uppercase tracking-widest opacity-70">PDF Scan: {pdfProgress}%</span>
                  )}
                </button>
              </div>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'upload')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  disabled={isProcessing}
                />
                <button
                  disabled={isProcessing}
                  className="w-full py-3 sm:py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-2xl font-bold flex flex-col items-center justify-center gap-1 transition-all text-sm sm:text-base"
                >
                  <div className="flex items-center gap-2">
                    {isImgProcessing && scanSource === 'upload' ? <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
                    Upload Image {imgProgress > 0 && imgProgress < 100 ? `(${imgProgress}%)` : ''}
                  </div>
                </button>
              </div>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleImageUpload(e, 'scanner')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  disabled={isProcessing}
                />
                <button
                  disabled={isProcessing}
                  className="w-full py-3 sm:py-4 bg-gradient-to-br from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 disabled:opacity-50 text-white rounded-2xl font-bold flex flex-col items-center justify-center gap-1 transition-all text-sm sm:text-base shadow-[0_0_15px_rgba(249,115,22,0.4)] hover:shadow-[0_0_20px_rgba(249,115,22,0.6)]"
                >
                  <div className="flex items-center gap-2">
                    {isImgProcessing && scanSource === 'scanner' ? <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Camera className="w-4 h-4 sm:w-5 sm:h-5" />}
                    Use Camera {scannerProgress > 0 && scannerProgress < 100 ? `(${scannerProgress}%)` : ''}
                  </div>
                </button>
              </div>
              <button
                onClick={handleGenerateQuiz}
                  disabled={isProcessing}
                  className="col-span-1 sm:col-span-3 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 disabled:opacity-50 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:scale-[1.02] active:scale-95 text-base sm:text-lg mb-2"
                >
                  {isProcessing ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  ⚡ Generate Quiz
                </button>
                <div className="col-span-1 sm:col-span-3 text-center -mt-1 mb-2">
                <button 
                  onClick={() => { setQuizData(DEFAULT_QUIZ); startQuiz(DEFAULT_QUIZ); }}
                  className="text-xs text-slate-500 hover:text-indigo-400 transition-colors underline underline-offset-4"
                >
                  Or try our sample Vocabulary Quiz
                </button>
              </div>
              <button
                onClick={handleJSONImport}
                className="col-span-1 sm:col-span-3 py-3 sm:py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all border border-white/10 text-sm sm:text-base"
              >
                <FileJson className="w-4 h-4 sm:w-5 sm:h-5" />
                Parse JSON from Textbox
              </button>
              <div className="col-span-1 sm:col-span-3 grid grid-cols-2 gap-3 sm:gap-4 mt-2">
                <button
                  onClick={exportJSON}
                  className="w-full py-3 sm:py-4 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300 shadow-[0_0_10px_rgba(16,185,129,0.4)] hover:scale-[1.03] hover:shadow-[0_0_18px_rgba(16,185,129,0.7)] active:scale-95 text-sm sm:text-base border-none"
                >
                  <DownloadCloud className="w-4 h-4 sm:w-5 sm:h-5" />
                  Export JSON
                </button>
                <div className="relative">
                  <input
                    type="file"
                    accept=".json"
                    onChange={importJSONFile}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />
                  <button
                    className="w-full py-3 sm:py-4 bg-gradient-to-br from-[#38bdf8] to-[#6366f1] text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300 shadow-[0_0_10px_rgba(99,102,241,0.4)] hover:scale-[1.03] hover:shadow-[0_0_18px_rgba(99,102,241,0.7)] active:scale-95 text-sm sm:text-base border-none"
                  >
                    <UploadCloud className="w-4 h-4 sm:w-5 sm:h-5" />
                    Import JSON File
                  </button>
                </div>
              </div>
              <div className="col-span-1 sm:col-span-3 mt-2">
                <button
                  onClick={() => setView('history')}
                  className="w-full py-3 sm:py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all border border-white/10 text-sm sm:text-base"
                >
                  <History className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
                  Previous Quizzes
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {view === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="w-full max-w-2xl z-10"
          >
            <div className="p-6 sm:p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30">
                    <History className="w-6 h-6 text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight">Quiz History</h2>
                </div>
                <div className="flex items-center gap-2">
                  {history.length > 0 && (
                    <button 
                      onClick={selectAllHistory}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                    >
                      {historySearch || historySubjectFilter !== 'All'
                        ? (history.filter(e => {
                            const matchesSearch = e.title.toLowerCase().includes(historySearch.toLowerCase());
                            const matchesSubject = historySubjectFilter === 'All' || e.subject === historySubjectFilter;
                            return matchesSearch && matchesSubject;
                          }).every(e => selectedHistoryIds.includes(e.id)) ? 'Deselect Filtered' : 'Select Filtered')
                        : (selectedHistoryIds.length === history.length ? 'Deselect All' : 'Select All')}
                    </button>
                  )}
                  <button 
                    onClick={() => setView('start')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-90"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {history.length > 0 && (
                <>
                  <div className="relative mb-4">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="text"
                      placeholder="Search quizzes..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm text-white"
                    />
                  </div>

                    <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
                      <Filter className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <span className="text-xs text-slate-500 font-medium flex-shrink-0">Filter:</span>
                      <button 
                        onClick={() => setHistorySubjectFilter('All')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${historySubjectFilter === 'All' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        All
                      </button>
                      {['General', 'Polity', 'History', 'Geography', 'Reasoning', 'Math', 'English'].map(sub => (
                        <button 
                          key={sub}
                          onClick={() => setHistorySubjectFilter(sub)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${historySubjectFilter === sub ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 mb-6">
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-xs text-slate-500 font-medium">Sort:</span>
                      <button 
                        onClick={() => setHistorySort('date')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${historySort === 'date' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        <History className="w-3 h-3" /> Date
                      </button>
                      <button 
                        onClick={() => setHistorySort('score')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${historySort === 'score' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        <Trophy className="w-3 h-3" /> Score
                      </button>
                    </div>
                </>
              )}

              {history.length === 0 ? (
                <div className="text-center py-12">
                  <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4 opacity-20" />
                  <p className="text-slate-400">No quiz attempts recorded yet.</p>
                  <button 
                    onClick={() => setView('start')}
                    className="mt-6 text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    Start your first quiz
                  </button>
                </div>
              ) : (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  {history
                    .filter(entry => {
                      const matchesSearch = entry.title.toLowerCase().includes(historySearch.toLowerCase());
                      const matchesSubject = historySubjectFilter === 'All' || entry.subject === historySubjectFilter;
                      return matchesSearch && matchesSubject;
                    })
                    .sort((a, b) => {
                      if (historySort === 'date') {
                        return parseInt(b.id) - parseInt(a.id);
                      } else {
                        return b.score - a.score;
                      }
                    })
                    .map((entry) => {
                      const isBest = history.length > 0 && entry.score === Math.max(...history.map(e => e.score));
                      const subjectIcon = {
                        'General': '📚',
                        'Polity': '📘',
                        'History': '📗',
                        'Geography': '📙',
                        'Reasoning': '🧠',
                        'Math': '🔢',
                        'English': '📝'
                      }[entry.subject || 'General'] || '📚';

                      return (
                        <div 
                          key={entry.id}
                          onClick={() => toggleSelectHistory(entry.id)}
                          className={`p-4 rounded-2xl border transition-all group relative flex gap-4 cursor-pointer ${
                            selectedHistoryIds.includes(entry.id) 
                            ? 'bg-indigo-500/10 border-indigo-500/50' 
                            : 'bg-white/5 border-white/10 hover:border-indigo-500/30'
                          }`}
                        >
                          <div className="pt-1">
                            <input 
                              type="checkbox" 
                              checked={selectedHistoryIds.includes(entry.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleSelectHistory(entry.id);
                              }}
                              className="w-5 h-5 rounded-lg border-white/20 bg-white/5 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 transition-all cursor-pointer"
                            />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs">{subjectIcon}</span>
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{entry.subject || 'General'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {editingHistoryId === entry.id ? (
                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                      <input 
                                        type="text"
                                        value={editingHistoryTitle}
                                        onChange={(e) => setEditingHistoryTitle(e.target.value)}
                                        className="bg-slate-900 border border-indigo-500/50 rounded-lg px-2 py-1 text-sm font-bold text-white focus:outline-none"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') renameHistoryEntry(entry.id, editingHistoryTitle);
                                          if (e.key === 'Escape') setEditingHistoryId(null);
                                        }}
                                      />
                                      <button 
                                        onClick={() => renameHistoryEntry(entry.id, editingHistoryTitle)}
                                        className="p-1 text-emerald-400 hover:text-emerald-300"
                                      >
                                        <CheckCircle2 className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={() => setEditingHistoryId(null)}
                                        className="p-1 text-red-400 hover:text-red-300"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <h4 className="font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">{entry.title}</h4>
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingHistoryId(entry.id);
                                          setEditingHistoryTitle(entry.title);
                                        }}
                                        className="p-1 text-slate-500 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                  {isBest && (
                                    <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-[8px] font-black uppercase tracking-tighter rounded-full border border-yellow-500/30 flex items-center gap-1">
                                      <Trophy className="w-2 h-2" /> Best
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                  <span className="text-indigo-400 font-medium">{entry.user || "Guest"}</span> • {entry.date}
                                </p>
                              </div>
                              <div className="text-right">
                                <div className="text-lg font-bold text-indigo-400">{entry.percent}%</div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{entry.score}/{entry.total} Correct</p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      reattemptQuiz(entry);
                                    }}
                                    className="px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-[10px] font-bold border border-indigo-500/20 transition-all flex items-center gap-1 whitespace-nowrap"
                                  >
                                    <RotateCcw className="w-3 h-3" /> Reattempt
                                  </button>
                                  {entry.progress !== undefined && entry.progress > 0 && entry.progress < entry.total - 1 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        resumeQuiz(entry);
                                      }}
                                      className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-bold border border-emerald-500/20 transition-all flex items-center gap-1 whitespace-nowrap"
                                    >
                                      <Play className="w-3 h-3 fill-current" /> Resume ({entry.progress + 1}/{entry.total})
                                    </button>
                                  )}
                                </div>
                                <div className="flex-1 flex flex-col gap-1">
                                  <div className="flex items-center justify-between text-[8px] uppercase tracking-widest font-bold text-slate-500">
                                    <span>Score Accuracy</span>
                                    <span>{entry.percent}%</span>
                                  </div>
                                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${entry.percent}%` }}
                                      className={`h-full ${parseFloat(entry.percent) >= 70 ? 'bg-green-500' : parseFloat(entry.percent) >= 40 ? 'bg-orange-500' : 'bg-red-500'}`}
                                    />
                                  </div>
                                </div>
                              </div>
                              
                              {entry.progress !== undefined && entry.progress > 0 && (
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center justify-between text-[8px] uppercase tracking-widest font-bold text-slate-500">
                                    <span>Completion Progress</span>
                                    <span>{Math.round(((entry.progress + 1) / entry.total) * 100)}%</span>
                                  </div>
                                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${((entry.progress + 1) / entry.total) * 100}%` }}
                                      className="h-full bg-indigo-500"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
              
              {history.length > 0 && (
                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={deleteSelectedHistory}
                    disabled={selectedHistoryIds.length === 0}
                    className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                      selectedHistoryIds.length > 0 
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30' 
                      : 'bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed'
                    }`}
                  >
                    <XCircle className="w-4 h-4" /> Delete Selected ({selectedHistoryIds.length})
                  </button>
                  <button 
                    onClick={clearAllHistory}
                    className="flex-1 py-3 bg-white/5 hover:bg-red-500/10 text-slate-500 hover:text-red-400 border border-white/10 hover:border-red-500/20 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Clear All History
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {view === 'quiz' && (
          <motion.div
            key="quiz"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-2xl z-10"
          >
            {questions.length === 0 || !questions[currentIdx] ? (
              <div className="p-6 sm:p-12 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl text-center">
                <h3 className="text-xl sm:text-2xl font-bold mb-4">Quiz Error</h3>
                <p className="text-sm sm:text-base text-slate-400 mb-8">We couldn't load the questions for this quiz. This might happen if the extraction failed or the data was corrupted.</p>
                <button 
                  onClick={() => setView('start')}
                  className="w-full sm:w-auto px-8 py-3 sm:py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all active:scale-95"
                >
                  Return to Home
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 px-2 gap-4">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <button 
                  onClick={() => setShowExitConfirm(true)}
                  className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all active:scale-90"
                  title="Exit Quiz"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <div className="px-2 sm:px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] sm:text-xs font-mono text-slate-400">
                  Q{currentIdx + 1}/{questions.length}
                </div>
                <div className="flex items-center gap-1 sm:gap-2 text-indigo-400">
                  <Timer className={`w-4 h-4 sm:w-5 sm:h-5 ${timeLeft <= 3 ? 'animate-pulse text-red-400' : ''}`} />
                  <span className={`font-mono text-base sm:text-lg font-bold ${timeLeft <= 3 ? 'text-red-400' : ''}`}>
                    {timeLeft}s
                  </span>
                </div>
                <button 
                  onClick={() => setIsPaused(!isPaused)}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 transition-all active:scale-90"
                  title={isPaused ? "Resume" : "Pause"}
                >
                  {isPaused ? <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> : <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />}
                </button>
                <button 
                  onClick={saveCurrentProgress}
                  className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all active:scale-90"
                  title="Save Progress"
                >
                  <DownloadCloud className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/5 border border-white/10">
                  <button 
                    onClick={() => setLangMode('en')}
                    className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 ${langMode === 'en' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:bg-white/5'}`}
                  >
                    🇬🇧 EN
                  </button>
                  <button 
                    onClick={() => setLangMode('hi')}
                    className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 ${langMode === 'hi' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-400 hover:bg-white/5'}`}
                  >
                    🇮🇳 HI
                  </button>
                  <button 
                    onClick={() => setLangMode('both')}
                    className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 ${langMode === 'both' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'text-slate-400 hover:bg-white/5'}`}
                  >
                    🌐 BOTH
                  </button>
                </div>
                {streak >= 2 && (
                  <motion.div 
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center gap-1 px-2 py-1 bg-orange-500/20 border border-orange-500/30 rounded-lg text-orange-400 text-[10px] font-bold uppercase"
                  >
                    <Sparkles className="w-3 h-3" /> {streak} Streak
                  </motion.div>
                )}
              </div>
              <div className="text-left sm:text-right flex sm:block items-center justify-between">
                <p className="text-[10px] sm:text-xs uppercase tracking-widest text-slate-500 font-semibold">{quizData.title}</p>
                <p className="text-lg sm:text-xl font-mono font-bold text-indigo-400">Score: {score}</p>
              </div>
            </div>

            <div className="w-full h-1.5 bg-white/5 rounded-full mb-6 sm:mb-8 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
                className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
              />
            </div>

            <div className="p-5 sm:p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl mb-6 relative overflow-hidden">
              <AnimatePresence>
                {isPaused && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 sm:p-8 text-center"
                  >
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mb-6 border border-indigo-500/30">
                      <Pause className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-400 fill-current" />
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-bold mb-2">Quiz Paused</h3>
                    <p className="text-sm sm:text-base text-slate-400 mb-8">Take a breath. Your progress is safe.</p>
                    <button 
                      onClick={() => setIsPaused(false)}
                      className="px-6 sm:px-8 py-3 sm:py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-base sm:text-lg transition-all active:scale-95 flex items-center gap-2"
                    >
                      <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> Resume Quiz
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {questions[currentIdx].topic && (
                <p className="text-[10px] sm:text-xs uppercase tracking-widest text-indigo-400 font-bold mb-2">{questions[currentIdx].topic}</p>
              )}
              <h2 className="text-[clamp(1.25rem,4vw,1.875rem)] font-bold leading-tight mb-4 text-white">
                {(langMode === 'en' || langMode === 'both') && questions[currentIdx].q_en}
                {langMode === 'hi' && questions[currentIdx].q_hi}
              </h2>
              {langMode === 'both' && (
                <p className="text-[clamp(1.125rem,3vw,1.5rem)] text-slate-300 mb-6 sm:mb-8 leading-tight font-medium border-l-4 border-indigo-500/50 pl-4 sm:pl-6 py-1 sm:py-2">
                  {questions[currentIdx].q_hi}
                </p>
              )}
              {langMode !== 'both' && <div className="mb-6 sm:mb-8" />}

              <div className="grid gap-3 sm:gap-4">
                {questions[currentIdx].options_en.map((option, idx) => {
                  const isCorrect = option === questions[currentIdx].answer;
                  const isSelected = option === selected;
                  const hindiOption = questions[currentIdx].options_hi[idx];
                  
                  let buttonClass = "w-full p-4 sm:p-5 rounded-2xl border text-left transition-all flex items-center justify-between group ";
                  if (!isAnswered) {
                    buttonClass += "bg-white/5 border-white/10 hover:bg-white/10 hover:border-indigo-500/50 active:scale-[0.98]";
                  } else {
                    if (isCorrect) buttonClass += "bg-emerald-500/20 border-emerald-500/50 text-emerald-400";
                    else if (isSelected) buttonClass += "bg-red-500/20 border-red-500/50 text-red-400";
                    else buttonClass += "bg-white/5 border-white/5 opacity-40";
                  }

                  return (
                    <button
                      key={idx}
                      disabled={isAnswered}
                      onClick={() => handleAnswer(option)}
                      className={buttonClass}
                    >
                      <span className="flex items-center gap-3 sm:gap-4">
                        <span className={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-xs sm:text-sm font-bold border shrink-0 ${
                          isAnswered ? 'border-transparent' : 'border-white/10 group-hover:border-indigo-500/50'
                        }`}>
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <div className="flex flex-col gap-1">
                          <span className="text-base sm:text-lg font-semibold">
                            {(langMode === 'en' || langMode === 'both') && option}
                            {langMode === 'hi' && hindiOption}
                          </span>
                          {langMode === 'both' && hindiOption && (
                            <span className="text-sm sm:text-lg text-slate-400 font-medium border-t border-white/5 pt-1">{hindiOption}</span>
                          )}
                        </div>
                      </span>
                      {isAnswered && isCorrect && <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400 shrink-0" />}
                      {isAnswered && isSelected && !isCorrect && <XCircle className="w-5 h-5 sm:w-6 sm:h-6 text-red-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
          )}
          </motion.div>
        )}

        {view === 'result' && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl p-6 sm:p-10 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl text-center z-10"
          >
            <div className="mb-6 sm:mb-8">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 border border-indigo-500/30 relative">
                <Trophy className="w-10 h-10 sm:w-12 sm:h-12 text-indigo-400" />
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="absolute inset-0 bg-indigo-500/10 rounded-full blur-xl" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">Performance Analysis</h2>
              <p className="text-sm sm:text-base text-slate-400">{quizData.title} • SSC CGL Style Report</p>
            </div>

            <div className="h-48 sm:h-64 w-full mb-6 sm:mb-8">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Correct', value: score, color: '#10b981' },
                      { name: 'Incorrect', value: questions.length - score, color: '#ef4444' }
                    ].filter(d => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {
                      [
                        { name: 'Correct', value: score, color: '#10b981' },
                        { name: 'Incorrect', value: questions.length - score, color: '#ef4444' }
                      ].filter(d => d.value > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))
                    }
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
              <div className="p-3 sm:p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Score</p>
                <p className="text-xl sm:text-2xl font-mono text-indigo-400">{score}/{questions.length}</p>
              </div>
              <div className="p-3 sm:p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Accuracy</p>
                <p className="text-xl sm:text-2xl font-mono text-emerald-400">{Math.round((score / questions.length) * 100)}%</p>
              </div>
              <div className="p-3 sm:p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Max Streak</p>
                <p className="text-xl sm:text-2xl font-mono text-orange-400">{maxStreak}</p>
              </div>
              <div className="p-3 sm:p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Correct</p>
                <p className="text-xl sm:text-2xl font-mono text-emerald-400">{score}</p>
              </div>
              <div className="p-3 sm:p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Wrong</p>
                <p className="text-xl sm:text-2xl font-mono text-red-400">{questions.length - score}</p>
              </div>
              <div className="p-3 sm:p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Total Time</p>
                <p className="text-xl sm:text-2xl font-mono text-purple-400">{totalTimeTaken}s</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => saveHistory(score, questions.length, true)}
                className="w-full py-3 sm:py-4 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 rounded-2xl font-bold text-base sm:text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <DownloadCloud className="w-5 h-5" />
                Save Quiz to History
              </button>
              {questions.length - score > 0 && (
                <button
                  onClick={retryIncorrect}
                  className="w-full py-3 sm:py-4 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-2xl font-bold text-base sm:text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-5 h-5" />
                  Retry Incorrect Questions
                </button>
              )}
              <button
                onClick={() => startQuiz()}
                className="w-full py-3 sm:py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-base sm:text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-5 h-5" />
                Restart Quiz
              </button>
              <button
                onClick={() => setView('solutions')}
                className="w-full py-3 sm:py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 rounded-2xl font-bold text-base sm:text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                View Solutions
              </button>
              <button
                onClick={() => setView('start')}
                className="w-full py-3 sm:py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 rounded-2xl font-bold text-base sm:text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Main Menu
              </button>
            </div>
          </motion.div>
        )}

        {view === 'solutions' && (
          <motion.div
            key="solutions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-3xl z-10"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-2">
              <button onClick={() => setView('result')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm sm:text-base w-fit">
                <ArrowLeft className="w-4 h-4" /> Back to Results
              </button>
              <h2 className="text-xl sm:text-2xl font-bold">Detailed Solutions</h2>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3 mb-4 sm:mb-6">
              <div className="flex flex-wrap sm:flex-nowrap gap-2 sm:gap-3 flex-1">
                <button 
                  onClick={() => setSolutionFilter('all')}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex-1 ${solutionFilter === 'all' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'}`}
                >
                  📋 All
                </button>
                <button 
                  onClick={() => setSolutionFilter('correct')}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex-1 ${solutionFilter === 'correct' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/25' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'}`}
                >
                  ✅ Correct
                </button>
                <button 
                  onClick={() => setSolutionFilter('incorrect')}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex-1 ${solutionFilter === 'incorrect' ? 'bg-red-600 text-white shadow-lg shadow-red-500/25' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'}`}
                >
                  ❌ Incorrect
                </button>
              </div>
              <button
                onClick={() => setShowExplanations(!showExplanations)}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${showExplanations ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'}`}
              >
                {showExplanations ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {showExplanations ? 'Hide Explanations' : 'Show Explanations'}
              </button>
            </div>

            <div className="space-y-4 sm:space-y-6 max-h-[70vh] overflow-y-auto pr-2 sm:pr-4 custom-scrollbar">
              {questions.map((q, idx) => {
                const answer = userAnswers.find(a => a.questionIdx === idx);
                
                if (solutionFilter === 'correct' && !answer?.isCorrect) return null;
                if (solutionFilter === 'incorrect' && answer?.isCorrect) return null;

                return (
                  <div key={idx} className={`p-4 sm:p-6 rounded-3xl border ${answer?.isCorrect ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className="text-[10px] sm:text-xs font-mono text-slate-500 uppercase tracking-widest">Question {idx + 1}</span>
                        {answer?.timeTaken !== undefined && (
                          <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                            <Timer className="w-3 h-3" /> {answer.timeTaken}s
                          </span>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded-lg text-[8px] sm:text-[10px] font-bold uppercase tracking-wider ${
                        answer?.isCorrect ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {answer?.isCorrect ? 'Correct' : 'Incorrect'}
                      </span>
                    </div>
                    <div className="mb-4 sm:mb-6">
                      <p className="text-lg sm:text-xl font-bold text-white mb-2">
                        {(langMode === 'en' || langMode === 'both') && q.q_en}
                        {langMode === 'hi' && q.q_hi}
                      </p>
                      {langMode === 'both' && (
                        <p className="text-base sm:text-xl text-slate-300 font-medium border-l-4 border-indigo-500/50 pl-3 sm:pl-4 py-1">{q.q_hi}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-4">
                      {q.options_en.map((opt, oIdx) => (
                        <div 
                          key={oIdx}
                          className={`p-2 sm:p-3 rounded-xl border text-xs sm:text-sm flex flex-col ${
                            opt === q.answer 
                              ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                              : opt === answer?.selected && !answer?.isCorrect
                                ? 'bg-red-500/10 border-red-500/50 text-red-400'
                                : 'bg-white/5 border-white/5 text-slate-400'
                          }`}
                        >
                          <span className="font-semibold text-sm sm:text-base">
                            {(langMode === 'en' || langMode === 'both') && opt}
                            {langMode === 'hi' && q.options_hi[oIdx]}
                          </span>
                          {langMode === 'both' && (
                            <span className="text-xs sm:text-base opacity-80 border-t border-white/5 mt-1 pt-1">{q.options_hi[oIdx]}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {showExplanations && (
                      <div className="p-3 sm:p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20">
                        <p className="text-[10px] sm:text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1 sm:mb-2 flex items-center gap-2">
                          <Sparkles className="w-3 h-3" /> AI Explanation
                        </p>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                          {q.explanation || "No explanation available for this question."}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {/* Exit Confirmation Modal */}
        {showExitConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl text-center"
            >
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6 border border-red-500/30">
                <XCircle className="w-6 h-6 sm:w-8 sm:h-8 text-red-400" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-2">Exit Quiz?</h3>
              <p className="text-sm sm:text-base text-slate-400 mb-6 sm:mb-8">Are you sure you want to exit? Your current progress will be lost.</p>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="py-3 sm:py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold transition-all text-sm sm:text-base"
                >
                  Cancel
                </button>
                <button
                  onClick={exitQuiz}
                  className="py-3 sm:py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-bold transition-all text-sm sm:text-base"
                >
                  Yes, Exit
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Timer Settings Modal */}
        {showTimerSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl"
            >
              <h3 className="text-xl sm:text-2xl font-bold mb-6 flex items-center gap-2">
                <Timer className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" /> Timer Settings
              </h3>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm sm:text-base text-slate-300 font-medium">Enable Timer</span>
                  <button
                    onClick={() => setTimerSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`w-12 h-6 rounded-full transition-colors relative ${timerSettings.enabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${timerSettings.enabled ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                {timerSettings.enabled && (
                  <div className="space-y-3">
                    <p className="text-[10px] sm:text-xs uppercase tracking-widest text-slate-500 font-bold">Seconds per Question</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[5, 15, 30].map(sec => (
                        <button
                          key={sec}
                          onClick={() => setTimerSettings(prev => ({ ...prev, secondsPerQuestion: sec }))}
                          className={`py-2 rounded-xl border font-mono text-xs sm:text-sm transition-all ${
                            timerSettings.secondsPerQuestion === sec 
                              ? 'bg-indigo-600 border-indigo-500 text-white' 
                              : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowTimerSettings(false)}
                  className="w-full py-3 sm:py-4 bg-white text-slate-950 rounded-2xl font-bold mt-4 hover:bg-slate-200 transition-colors text-sm sm:text-base"
                >
                  Save Settings
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* JSON Preview Modal */}
      <AnimatePresence>
        {showJsonPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h3 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <FileJson className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" /> JSON Preview
                </h3>
                <button onClick={() => setShowJsonPreview(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <XCircle className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto bg-black/50 rounded-2xl p-3 sm:p-4 font-mono text-[10px] sm:text-xs text-indigo-300 custom-scrollbar">
                <pre>{JSON.stringify(quizData, null, 2)}</pre>
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(quizData, null, 2));
                  setShowJsonPreview(false);
                }}
                className="w-full py-3 sm:py-4 bg-indigo-600 text-white rounded-2xl font-bold mt-4 sm:mt-6 hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                <Copy className="w-4 h-4 sm:w-5 sm:h-5" /> Copy JSON & Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  );
}
