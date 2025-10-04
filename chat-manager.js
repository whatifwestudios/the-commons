/**
 * Chat Manager - Handles chat UI and messaging
 */
class ChatManager {
    constructor(containerElement, connectionManager) {
        this.container = containerElement;
        this.connectionManager = connectionManager;
        this.chatMessages = containerElement?.querySelector('.chat-messages');
        this.chatInput = containerElement?.querySelector('#chat-input');
        this.isVisible = false;
    }

    show() {
        if (this.container) {
            this.container.style.display = 'flex';
            this.container.classList.remove('hidden-element');
            this.isVisible = true;
        }
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
            this.container.classList.add('hidden-element');
            this.isVisible = false;
        }
    }

    sendMessage(message, playerName, color) {
        if (!this.connectionManager || !message) return;

        this.connectionManager.send({
            type: 'CHAT_MESSAGE',
            playerName: playerName,
            message: message,
            color: color,
            timestamp: Date.now()
        });

        // Clear input
        if (this.chatInput) {
            this.chatInput.value = '';
        }
    }

    addMessage(playerName, message, color = null, isSystem = false) {
        if (!this.chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = isSystem ? 'chat-message system' : 'chat-message';

        if (isSystem) {
            messageElement.innerHTML = `<span class="system-message">${message}</span>`;
        } else {
            const colorHex = color || '#ffffff';
            messageElement.innerHTML = `
                <span class="player-name" style="color: ${colorHex}">${playerName}:</span>
                <span class="message-text">${this.escapeHtml(message)}</span>
            `;
        }

        this.chatMessages.appendChild(messageElement);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    addSystemMessage(message) {
        this.addMessage(null, message, null, true);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    clear() {
        if (this.chatMessages) {
            this.chatMessages.innerHTML = '';
        }
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.ChatManager = ChatManager;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatManager;
}