import React, { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const App = () => {
    const [message, setMessage] = useState('');
    const [conversation, setConversation] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isHealthMode, setIsHealthMode] = useState(false);
    const [language, setLanguage] = useState('en');
    const [connectionStatus, setConnectionStatus] = useState('connecting');
    const [typingIndicator, setTypingIndicator] = useState(false);
    const userId = useRef(`user_${Math.random().toString(36).substr(2, 9)}`).current;
    const chatWindowRef = useRef(null);
    const inputRef = useRef(null);

    const healthPlaceholders = {
        en: "Describe your symptoms (e.g., 'headache and fever for 3 days')",
        fil: "Ilarawan ang iyong mga sintomas (hal., 'lagnat at sakit ng ulo sa loob ng 3 araw')"
    };

    // Enhanced connection check
    useEffect(() => {
        const checkServer = async () => {
            try {
                const response = await axios.get('http://localhost:5000/health', {
                    timeout: 2000
                });
                
                setConnectionStatus(response.data?.status === 'OK' ? 'connected' : 'disconnected');
            } catch (error) {
                console.error('Connection error:', error);
                setConnectionStatus('disconnected');
            } finally {
                inputRef.current?.focus();
            }
        };
        
        checkServer();
        const interval = setInterval(checkServer, 10000);
        return () => clearInterval(interval);
    }, []);

    // Enhanced message handling with typing indicators
    const sendMessage = useCallback(async () => {
        if (!message.trim() || isLoading || connectionStatus !== 'connected') return;

        const userMessage = { 
            sender: 'user', 
            text: message,
            isHealth: isHealthMode,
            timestamp: new Date().toISOString()
        };
        
        setConversation(prev => [...prev, userMessage]);
        setMessage('');
        setIsLoading(true);
        setTypingIndicator(true);

        try {
            const endpoint = isHealthMode ? '/api/health-check' : '/api/chat';
            const body = isHealthMode ? {
                symptoms: message, 
                userId, 
                language,
                sessionId: conversation.find(m => m.isHealth)?.sessionId
            } : {
                message, 
                userId, 
                language 
            };

            const response = await axios.post(`http://localhost:5000${endpoint}`, body, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            });

            // Handle urgent medical alerts
            if (isHealthMode && response.data?.severity === 'urgent') {
                const alertMessage = language === 'fil' 
                    ? '⚠️ Kailangan ng agarang atensyon medikal! Maaaring kailanganin mong pumunta sa emergency room.' 
                    : '⚠️ This may require urgent medical attention! You should consider going to an emergency room.';
                alert(alertMessage);
            }

            // Process bot response
            const botMessage = {
                sender: 'bot',
                text: response.data.reply || response.data.diagnosis || (language === 'fil' 
                    ? "Hindi ko ma-proseso ang iyong kahilingan" 
                    : "I couldn't process that request"),
                isHealth: isHealthMode,
                timestamp: new Date().toISOString(),
                ...(isHealthMode && response.data && {
                    confidence: response.data.confidence,
                    severity: response.data.severity,
                    possibleConditions: response.data.possible_conditions || response.data.deepseek_analysis?.conditions?.map(c => c.condition),
                    recommendations: response.data.recommendations,
                    sessionId: response.data.session_id,
                    isUrgent: response.data.severity === 'urgent'
                })
            };
            
            setConversation(prev => [...prev, botMessage]);
        } catch (error) {
            console.error('API Error:', error);
            const errorMessage = {
                sender: 'bot',
                text: getErrorMessage(error, language),
                isHealth: isHealthMode,
                timestamp: new Date().toISOString()
            };
            setConversation(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
            setTypingIndicator(false);
            inputRef.current?.focus();
        }
    }, [message, userId, isHealthMode, language, conversation, connectionStatus, isLoading]);

    // Error message handler
    const getErrorMessage = (error, lang) => {
        const errors = {
            ECONNABORTED: {
                en: 'The server took too long to respond',
                fil: 'Ang server ay tumagal ng masyadong mahaba upang tumugon'
            },
            503: {
                en: 'The symptom checker is currently unavailable',
                fil: 'Ang symptom checker ay hindi available sa ngayon'
            },
            default: {
                en: "I couldn't process your request",
                fil: 'May naganap na error sa pagsusuri ng iyong mga sintomas'
            }
        };
        
        const key = error.code === 'ECONNABORTED' ? 'ECONNABORTED' : 
                  error.response?.status === 503 ? '503' : 'default';
        
        return errors[key][lang === 'fil' ? 'fil' : 'en'] + (lang === 'fil' ? '. Subukan muli.' : '. Please try again.');
    };

    // Auto-scroll with smooth behavior
    useEffect(() => {
        if (chatWindowRef.current) {
            chatWindowRef.current.scrollTo({
                top: chatWindowRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [conversation, typingIndicator]);

    // Keyboard handling
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !isLoading && connectionStatus === 'connected') {
            e.preventDefault();
            sendMessage();
        }
    };

    // Language toggle
    const toggleLanguage = () => {
        setLanguage(lang => lang === 'en' ? 'fil' : 'en');
        inputRef.current?.focus();
    };

    // Health mode toggle with confirmation
    const toggleHealthMode = () => {
        if (isLoading) return;
        
        const confirmMessage = language === 'fil' 
            ? 'Lumipat sa health mode? Ang kasalukuyang usapan ay mawi-wipe.'
            : 'Switch to health mode? Current conversation will be cleared.';
        
        if (!isHealthMode && !window.confirm(confirmMessage)) return;
        
        setIsHealthMode(!isHealthMode);
        setConversation([]);
        inputRef.current?.focus();
    };

    return (
        <div className="chat-container">
            <div className="app-header">
                <h2>{language === 'fil' ? 'Chatbot Pangkalusugan' : 'Health Chatbot'}</h2>
                <div className="header-controls">
                    <button 
                        onClick={toggleLanguage}
                        className="language-toggle"
                        disabled={isLoading}
                        aria-label={language === 'en' ? 'Switch to Filipino' : 'Switch to English'}
                    >
                        {language === 'en' ? '🇵🇭 Filipino' : '🇺🇸 English'}
                    </button>
                    <div className={`connection-status ${connectionStatus}`}>
                        {connectionStatus === 'connected' 
                            ? (language === 'fil' ? 'Konektado' : 'Connected') 
                            : connectionStatus === 'connecting'
                            ? (language === 'fil' ? 'Kumokonekta...' : 'Connecting...')
                            : (language === 'fil' ? 'Hindi Konektado' : 'Disconnected')}
                    </div>
                </div>
            </div>

            <div className="mode-toggle">
                <button 
                    onClick={toggleHealthMode}
                    className={isHealthMode ? 'health-active' : ''}
                    disabled={isLoading || connectionStatus !== 'connected'}
                    aria-label={isHealthMode ? 'Exit health mode' : 'Enter health mode'}
                >
                    {isHealthMode 
                        ? (language === 'fil' ? '🚑 Lumabas sa Health Mode' : '🚑 Exit Health Mode')
                        : (language === 'fil' ? '🔍 Suriin ang Kalusugan' : '🔍 Health Check')}
                </button>
                {isHealthMode && (
                    <p className="mode-hint">
                        {language === 'fil' ? healthPlaceholders.fil : healthPlaceholders.en}
                    </p>
                )}
            </div>

            <div className="chat-window" ref={chatWindowRef}>
                {conversation.length === 0 ? (
                    <div className="welcome-message">
                        {isHealthMode
                            ? language === 'fil' 
                                ? 'Ilarawan ang iyong mga sintomas upang makapagsimula.'
                                : 'Describe your symptoms to get started.'
                            : language === 'fil'
                                ? 'Kumusta! Paano kita matutulungan ngayon?'
                                : "Hello! How can I help you today?"}
                    </div>
                ) : (
                    conversation.map((msg, index) => (
                        <div 
                            key={`${msg.timestamp}-${index}`}
                            className={`message ${msg.sender} ${msg.isHealth ? 'medical' : ''} ${msg.isUrgent ? 'urgent' : ''}`}
                        >
                            <div className="message-content">
                                {msg.text}
                                
                                {msg.isHealth && (
                                    <div className="medical-details">
                                        {msg.confidence && (
                                            <div className="confidence-badge">
                                                {language === 'fil' 
                                                    ? `Kumpiyansa: ${(msg.confidence * 100).toFixed(1)}%`
                                                    : `Confidence: ${(msg.confidence * 100).toFixed(1)}%`}
                                            </div>
                                        )}
                                        
                                        {msg.possibleConditions?.length > 0 && (
                                            <div className="conditions">
                                                <strong>{language === 'fil' ? 'Posibleng Kondisyon:' : 'Possible Conditions:'}</strong>
                                                <ul>
                                                    {msg.possibleConditions.map((cond, i) => (
                                                        <li key={i}>{cond}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        
                                        {msg.recommendations && (
                                            <div className="recommendations">
                                                <strong>{language === 'fil' ? 'Mga Rekomendasyon:' : 'Recommendations:'}</strong>
                                                <p>{msg.recommendations}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="message-time">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    ))
                )}
                
                {(isLoading || typingIndicator) && (
                    <div className={`message bot ${isHealthMode ? 'medical' : ''}`}>
                        <div className="typing-indicator">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                )}
            </div>

            <div className="input-container">
                <input
                    ref={inputRef}
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                        isHealthMode 
                            ? (language === 'fil' 
                                ? "Ilarawan ang iyong mga sintomas..." 
                                : "Describe your symptoms...")
                            : (language === 'fil'
                                ? "Mag-type ng mensahe..."
                                : "Type a message...")
                    }
                    disabled={isLoading || connectionStatus !== 'connected'}
                    autoFocus
                    className="chat-input"
                    aria-label={isHealthMode 
                        ? (language === 'fil' ? "Input para sa mga sintomas" : "Symptom input") 
                        : (language === 'fil' ? "Input para sa mensahe" : "Message input")}
                />
                <button 
                    onClick={sendMessage} 
                    disabled={isLoading || connectionStatus !== 'connected' || !message.trim()}
                    className={`send-button ${isHealthMode ? 'health-send' : ''}`}
                    aria-label={language === 'fil' ? 'Ipadala' : 'Send'}
                >
                    {isLoading 
                        ? <div className="button-loading"></div>
                        : (language === 'fil' ? 'Ipadala' : 'Send')}
                </button>
            </div>

            {(conversation.some(msg => msg.isHealth) || isHealthMode) && (
                <div className="medical-disclaimer">
                    <small>
                        {language === 'fil' 
                            ? "PAALALA: Ang impormasyong ito ay para lamang sa pagpapayo at hindi dapat gamitin bilang kapalit ng propesyonal na pagsusuri medikal. Kung may emergency, mangyaring tumawag sa lokal na emergency number." 
                            : "DISCLAIMER: This information is for advice only and should not be used as a substitute for professional medical evaluation. In case of emergency, please call your local emergency number."}
                    </small>
                </div>
            )}
        </div>
    );
};

export default App;