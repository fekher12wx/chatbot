# 🌍 Travel Booking Assistant API

AI-powered conversational assistant for booking flights, hotels, and cars through Amadeus or Farelogix systems.

## ✨ Features

- ✈️ Flight bookings (one-way & round-trip)
- 🏨 Hotel reservations
- 🚗 Car rentals
- 🤖 Natural language AI conversations
- 📅 Smart date validation (multiple formats)
- 🔄 Session management

## 🚀 Quick Start

```bash
# Clone & install
git clone https://github.com/yourusername/travel-booking-assistant.git
cd travel-booking-assistant
npm install

# Configure
echo "GROQ_API_KEY=your_key_here" > .env

# Run
npm start
```

## 📡 API Endpoints

**POST** `/chat` - Main conversation endpoint
```json
{
  "message": "I want to book a flight",
  "sessionId": "user123"
}
```

**POST** `/reset` - Reset session

**GET** `/health` - Health check

## 💡 Example Flow

```
User: I want to book a flight
Bot:  Which system? Amadeus or Farelogix

User: Amadeus
Bot:  One way or Round trip?

User: Round trip
Bot:  Departure date? (e.g., 16/01/2026)

User: 20/01/2026
Bot:  Return date?

User: 25/01/2026
Bot:  Step 1: Add 1 ADT traveler...
```

## 📅 Supported Date Formats

- `16/01/2026`
- `2026-01-16`
- `16 JAN 2026`

## 🛠️ Tech Stack

Node.js • Express • Groq AI • LLaMA 3.1

## 📝 License

MIT

---

Made with ❤️ for travelers
