import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';
import './App.css';

const SIDEBAR_WIDTH = 210;

function loadHistory() {
    const data = localStorage.getItem('chat_history');
    if (data) return JSON.parse(data);
    return [
        {
            id: Date.now().toString(),
            name: 'New Chat',
            autoNamed: true,
            conversation: [],
        },
    ];
}

function saveHistory(history) {
    localStorage.setItem('chat_history', JSON.stringify(history));
}

const LOGO_URL = "https://scontent.fmnl13-4.fna.fbcdn.net/v/t1.15752-9/480657310_630716836372638_4796893253857913445_n.jpg?_nc_cat=109&ccb=1-7&_nc_sid=0024fc&_nc_eui2=AeFG37DlUxpN4aT2B2SfEOO4m6iOys1_SaWbqI7KzX9JpVSD7w78mR8hNDV3yA4Bs1Nckq-bSan1Vr0sbEiS9Lok&_nc_ohc=ATNu6bZIE0oQ7kNvwFCsb5R&_nc_oc=Adne4AjNsC9cdimLCyZId01ZAlAx0MvuZ2KNtqzpLgLTM8r4E7Ys8sfmST5_BNkS27DwTQwPDobKIEZ6ktkVuKz8&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent.fmnl13-4.fna&oh=03_Q7cD2QEfN649jP88CusYX5kOZo4JVppno49qtAYdF8fhEL0Knw&oe=6844D35F";

const App = () => {
    const [message, setMessage] = useState('');
    const [chatHistory, setChatHistory] = useState(loadHistory());
    const [currentSession, setCurrentSession] = useState(chatHistory[0].id);
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const userId = 'user123';
    const chatWindowRef = useRef(null);
    const cancelTokenSource = useRef(null);
    const recognitionRef = useRef(null);

    // Get current conversation
    const currentConv = chatHistory.find((s) => s.id === currentSession);

    // Save history to localStorage on change
    useEffect(() => {
        saveHistory(chatHistory);
    }, [chatHistory]);

    // Speech-to-text handlers
    const startListening = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Speech recognition is not supported in this browser.');
            return;
        }
        if (!recognitionRef.current) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.lang = 'en-US';
            recognitionRef.current.interimResults = false;
            recognitionRef.current.maxAlternatives = 1;

            recognitionRef.current.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setMessage(prev => (prev ? prev + ' ' : '') + transcript);
            };
            recognitionRef.current.onend = () => setIsListening(false);
            recognitionRef.current.onerror = () => setIsListening(false);
        }
        setIsListening(true);
        recognitionRef.current.start();
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);
        }
    };

    // Text-to-speech
    const speak = (text) => {
    if (!window.speechSynthesis) {
        alert('Speech synthesis is not supported in this browser.');
        return;
    }
    // Always cancel any current speech
    window.speechSynthesis.cancel();

    // Delay slightly to allow cancel to register, then speak
    setTimeout(() => {
        const utterance = new window.SpeechSynthesisUtterance(text.replace(/[*_`#>-]/g, ''));
        utterance.lang = 'en-US';
        utterance.rate = 1;
        window.speechSynthesis.speak(utterance);
    }, 100);
};

    const sendMessage = useCallback(async () => {
        if (!message.trim()) return;
        const userMessage = { sender: 'user', text: message };

        setChatHistory((prev) => prev.map((s) => {
            if (s.id !== currentSession) return s;
            if (s.autoNamed && s.conversation.length === 0) {
                return {
                    ...s,
                    name: userMessage.text.replace(/\n/g, ' ').slice(0, 30) || "New Chat",
                    conversation: [...s.conversation, userMessage],
                };
            }
            return {
                ...s,
                conversation: [...s.conversation, userMessage],
            };
        }));
        setMessage('');
        setIsLoading(true);

        cancelTokenSource.current = axios.CancelToken.source();

        try {
            const response = await axios.post(
                'http://localhost:5000/api/chat',
                { message, userId, sessionId: currentSession },
                { cancelToken: cancelTokenSource.current.token }
            );
            const botMessage = { sender: 'bot', text: response.data.reply };
            setChatHistory((prev) =>
                prev.map((s) =>
                    s.id === currentSession
                        ? { ...s, conversation: [...s.conversation, botMessage] }
                        : s
                )
            );
        } catch (error) {
            if (!axios.isCancel(error)) {
                const errorMessage = { sender: 'bot', text: 'Oops! Something went wrong. Please try again.' };
                setChatHistory((prev) =>
                    prev.map((s) =>
                        s.id === currentSession
                            ? { ...s, conversation: [...s.conversation, errorMessage] }
                            : s
                    )
                );
            }
        } finally {
            setIsLoading(false);
        }
    }, [message, userId, currentSession]);

    const stopMessage = () => {
        if (cancelTokenSource.current) {
            cancelTokenSource.current.cancel('Operation canceled by the user.');
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (chatWindowRef.current) {
            chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
        }
    }, [currentConv && currentConv.conversation]);

    const handleKeyPress = useCallback(
        (e) => {
            if (e.key === 'Enter' && !isLoading) {
                sendMessage();
            }
        },
        [sendMessage, isLoading]
    );

    const handleButtonClick = () => {
        if (isLoading) {
            stopMessage();
        } else {
            sendMessage();
        }
    };

    // Sidebar handlers
    function startNewSession() {
        const newSession = {
            id: Date.now().toString(),
            name: 'New Chat',
            autoNamed: true,
            conversation: [],
        };
        setChatHistory((prev) => [newSession, ...prev]);
        setCurrentSession(newSession.id);
    }

    function selectSession(id) {
        setCurrentSession(id);
    }

    function deleteSession(id) {
        let idx = chatHistory.findIndex((s) => s.id === id);
        if (idx === -1) return;
        const newHistory = chatHistory.filter((s) => s.id !== id);
        setChatHistory(newHistory);
        if (currentSession === id) {
            if (newHistory.length > 0) setCurrentSession(newHistory[0].id);
            else startNewSession();
        }
    }

    function renameSession(id, newName) {
        setChatHistory((prev) =>
            prev.map((s) =>
                s.id === id ? { ...s, name: newName, autoNamed: false } : s
            )
        );
    }

    // On first load, ensure at least one session
    useEffect(() => {
        if (!chatHistory.length) startNewSession();
    }, []);

    // For renaming
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');

    return (
        <div className="app-root">
            <div className="sidebar" style={{ width: SIDEBAR_WIDTH }}>
                <div className="sidebar-top">
                    <img 
                        src={LOGO_URL}
                        alt="Logo"
                        className="sidebar-logo"
                    />
                    <span className="sidebar-title">Mir AI</span>
                </div>
                <div className="sidebar-header">
                    <button onClick={startNewSession} className="new-chat-btn">+ New Chat</button>
                </div>
                <div className="history-list">
                    {chatHistory.map((session) => (
                        <div
                            key={session.id}
                            className={`history-item ${session.id === currentSession ? 'active' : ''}`}
                            onClick={() => selectSession(session.id)}
                        >
                            {renamingId === session.id ? (
                                <input
                                    type="text"
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onBlur={() => {
                                        renameSession(session.id, renameValue.trim() || 'Untitled');
                                        setRenamingId(null);
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            renameSession(session.id, renameValue.trim() || 'Untitled');
                                            setRenamingId(null);
                                        }
                                    }}
                                    autoFocus
                                    className="rename-input"
                                />
                            ) : (
                                <>
                                    <span className="history-title" onDoubleClick={e => {
                                        e.stopPropagation();
                                        setRenamingId(session.id);
                                        setRenameValue(session.name);
                                    }}>
                                        {session.name}
                                    </span>
                                    <span
                                        className="delete-btn"
                                        onClick={e => {
                                            e.stopPropagation();
                                            deleteSession(session.id);
                                        }}
                                    >✕</span>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            <div className="phone-wrapper">
                <div className="chat-container">
                    <div className="chat-header">
                        <img 
                            src={LOGO_URL}
                            alt="Logo"
                            className="chat-logo"
                        />
                        Mir AI
                    </div>
                    <div className="chat-window" ref={chatWindowRef}>
                        {currentConv && currentConv.conversation.map((msg, index) => (
                            <div key={index} className={`message ${msg.sender}`}>
                                {msg.sender === "bot" ? (
                                    <div className="bot-content">
                                        <button
                                            className="voice-play-btn"
                                            title="Play Voice"
                                            onClick={() => speak(msg.text)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                marginRight: '6px',
                                                color: '#007bff',
                                                fontSize: '18px',
                                                padding: '0'
                                            }}
                                        >🔊</button>
                                        <div style={{flex: 1, minWidth: 0, wordBreak: "break-word", overflowWrap: "break-word"}}>
                                            <ReactMarkdown
                                                components={{
                                                    code({node, inline, className, children, ...props}) {
                                                        return !inline ? (
                                                            <pre className="chat-code-block">
                                                                <code {...props}>{children}</code>
                                                            </pre>
                                                        ) : (
                                                            <code className="chat-inline-code" {...props}>{children}</code>
                                                        );
                                                    },
                                                    img({node, ...props}) {
                                                        return (
                                                            <img
                                                                {...props}
                                                                alt={props.alt || "AI generated image"}
                                                                style={{
                                                                    maxWidth: '100%',
                                                                    maxHeight: '240px',
                                                                    display: 'block',
                                                                    margin: '12px auto',
                                                                    borderRadius: '14px',
                                                                    boxShadow: '0 2px 10px #0001'
                                                                }}
                                                                loading="lazy"
                                                            />
                                                        );
                                                    }
                                                }}
                                            >
                                                {msg.text}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                ) : (
                                    msg.text
                                )}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="message bot">
                                <div className="loading-dots">
                                    <span>.</span>
                                    <span>.</span>
                                    <span>.</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="input-container">
                        <input
                            type="text"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Type a message..."
                            disabled={isLoading}
                        />
                        <button
                            onMouseDown={startListening}
                            onMouseUp={stopListening}
                            onTouchStart={startListening}
                            onTouchEnd={stopListening}
                            className={`mic-btn${isListening ? " listening" : ""}`}
                            title="Hold to Speak"
                            style={{
                                marginRight: '6px',
                                background: isListening ? '#007bff' : '#f1f1f1',
                                color: isListening ? '#fff' : '#007bff',
                                border: 'none',
                                borderRadius: '50%',
                                width: '38px',
                                height: '38px',
                                fontSize: '20px',
                                cursor: 'pointer',
                                outline: 'none',
                            }}
                        >🎤</button>
                        <button onClick={handleButtonClick} disabled={!message.trim() && !isLoading}>
                            {isLoading ? 'Stop' : 'Send'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;
