export const environment = {
  production: false,
  apiUrl: 'http://localhost:8787',
  // apiUrl: 'https://ai-summarise-be.aisummarise.workers.dev',
  // Stripe configuration is now fetched from backend
  firebase: {
    apiKey: 'AIzaSyBNJN8l0xiiCxYGrcPVyPEf6y-XZl_MThY',
    authDomain: 'ai-summarise-be.firebaseapp.com',
    projectId: 'ai-summarise-be',
    storageBucket: 'ai-summarise-be.firebasestorage.app',
    messagingSenderId: '437396741747',
    appId: '1:437396741747:web:2cb8f140def4dd68851406',
    measurementId: 'G-BZG6J92R1L',
  },
  features: {
    useSSETicketAuth: true, // Enable ticket-based SSE authentication
  },
  sse: {
    maxReconnectAttempts: 5,
    baseReconnectDelay: 1000, // 1 second
    maxReconnectDelay: 30000, // 30 seconds
    ticketLifetime: 30, // 30 seconds
    ticketRefreshBuffer: 5, // refresh ticket 5 seconds before expiry
    maxTicketRetryAttempts: 3,
    ticketRetryDelay: 500, // 500ms between ticket request attempts
    connectionTimeout: 10000, // 10 seconds
    heartbeatInterval: 30000, // 30 seconds
  },
};