import React, { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const App = () => {
    const [message, setMessage] = useState('');
    const [conversation, setConversation] = useState([]);
    const [isLoading, setIsLoading] = useState(false); // Loading state
    const userId = 'user123'; // Replace with a unique user ID (e.g., from authentication)
    const chatWindowRef = useRef(null); // Ref for auto-scrolling

    // Function to send a message
    const sendMessage = useCallback(async () => {
        if (!message.trim()) return;

        const userMessage = { sender: 'user', text: message };
        setConversation((prevConversation) => [...prevConversation, userMessage]);
        setMessage('');
        setIsLoading(true); // Start loading

        try {
            console.log('Sending message to backend:', message);
            const response = await axios.post('http://localhost:5000/api/chat', { message, userId });
            console.log('Received response from backend:', response.data);

            const botMessage = { sender: 'bot', text: response.data.reply };
            setConversation((prevConversation) => [...prevConversation, botMessage]);
        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessage = { sender: 'bot', text: 'Oops! Something went wrong. Please try again.' };
            setConversation((prevConversation) => [...prevConversation, errorMessage]);
        } finally {
            setIsLoading(false); // Stop loading
        }
    }, [message, userId]);

    // Auto-scroll to the bottom of the chat window
    useEffect(() => {
        if (chatWindowRef.current) {
            chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
        }
    }, [conversation]);

    // Handle Enter key press
    const handleKeyPress = useCallback(
        (e) => {
            if (e.key === 'Enter' && !isLoading) {
                sendMessage();
            }
        },
        [sendMessage, isLoading]
    );

    return (
        <div className="chat-container">
            <div className="chat-window" ref={chatWindowRef}>
                {conversation.map((msg, index) => (
                    <div key={index} className={`message ${msg.sender}`}>
                        {msg.text}
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
                    disabled={isLoading} // Disable input while loading
                />
                <button onClick={sendMessage} disabled={isLoading}>
                    {isLoading ? 'Sending...' : 'Send'}
                </button>
            </div>
        </div>
    );
};

export default App;