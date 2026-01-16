import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ===============================
// BOOKING WORKFLOWS
// ===============================
const WORKFLOWS = {
  FLIGHT: {
    AMADEUS: (dates) => [
      "Step 1: Add 1 ADT traveler (e.g., Amadeus profile).",
      "Step 2: Open the 'Flight search' dialog.",
      "Step 3: Select the 'Round Trip' tab.",
      `Step 4: Search for flights LON → FRA for ${dates}.`,
      "Step 5: Select a fare for each segment.",
      "Step 6: Pick the fare to cart.",
      "Step 7: Add necessary data and select INVOICE as FOP.",
      "Step 8: Book the cart."
    ],
    FARELOGIX: (dates) => [
      "Step 1: Add 1 ADT traveler (e.g., Farelogix profile).",
      "Step 2: Open the 'Flight search' dialog.",
      "Step 3: Select the 'Round Trip' tab.",
      `Step 4: Search for FLX fares LON → FRA for ${dates} using FareByTime or FareByPrice.`,
      "Step 5: Select a fare for each segment.",
      "Step 6: Select one fare.",
      "Step 7: Pick to cart.",
      "Step 8: Add necessary data and select INVOICE as FOP.",
      "Step 9: Book the cart."
    ]
  },
  HOTEL: {
    AMADEUS: [
      "Step 1: Add traveler (e.g., Nelke).",
      "Step 2: Search for hotel using LHR +100. Source: Amadeus.",
      "Step 3: Pick a hotel room and add it to the cart.",
      "Step 4: Add deposit credit card.",
      "Step 5: Book the hotel."
    ],
    FARELOGIX: [
      "Step 1: Add traveler profile.",
      "Step 2: Search for hotel using your preferred location.",
      "Step 3: Pick a hotel room and add it to the cart.",
      "Step 4: Add deposit credit card.",
      "Step 5: Book the hotel."
    ]
  },
  CAR: {
    AMADEUS: [
      "Step 1: Add a passenger profile (Amadeus).",
      "Step 2: Open the car search dialog.",
      "Step 3: Search for cars with the following details:\n   • Location: FRA\n   • Vendor: 1A\n   • Pickup: +30 days at 08:00 AM\n   • Dropoff: 09:00 AM",
      "Step 4: Pick a car and add it to the cart.",
      "Step 5: Add all necessary booking data.",
      "Step 6: Click on 'Book cart' button."
    ],
    FARELOGIX: [
      "Step 1: Add a passenger profile.",
      "Step 2: Open the car search dialog.",
      "Step 3: Search for cars with your preferred details.",
      "Step 4: Pick a car and add it to the cart.",
      "Step 5: Add all necessary booking data.",
      "Step 6: Click on 'Book cart' button."
    ]
  }
};

// ===============================
// SESSION MANAGEMENT
// ===============================
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      phase: "GREETING",
      flow: null,
      source: null,
      flightType: null,
      departureDate: null,
      returnDate: null,
      step: 0,
      conversationHistory: []
    });
  }
  return sessions.get(sessionId);
}

function resetSession(sessionId) {
  sessions.delete(sessionId);
  return getSession(sessionId);
}

// ===============================
// HELPER FUNCTIONS
// ===============================
function normalizeInput(text) {
  return text.toLowerCase().trim();
}

function detectBookingType(msg) {
  if (msg.includes("flight")) return "FLIGHT";
  if (msg.includes("hotel")) return "HOTEL";
  if (msg.includes("car") || msg.includes("rental")) return "CAR";
  return null;
}

function detectSource(msg) {
  if (msg.includes("amadeus")) return "AMADEUS";
  if (msg.includes("farelogix") || msg.includes("flx")) return "FARELOGIX";
  return null;
}

function detectFlightType(msg) {
  if (msg.includes("one")) return "ONE_WAY";
  if (msg.includes("round") || msg.includes("return")) return "ROUND_TRIP";
  return null;
}

/**
 * Enhanced date parser - supports multiple formats:
 * - DD/MM/YYYY (16/01/2026)
 * - YYYY-MM-DD (2026-01-16)
 * - DD MON YYYY (16 JAN 2026)
 * - DD MON (16 JAN)
 */
function parseDate(input) {
  const normalized = input.trim().toUpperCase();
  
  // DD/MM/YYYY
  let match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return normalized;
  
  // YYYY-MM-DD
  match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  
  // DD MON YYYY or DD MON
  match = normalized.match(/^(\d{1,2})[\s\/-](JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:[\s\/-](\d{4}))?$/);
  if (match) {
    const year = match[3] || new Date().getFullYear();
    return `${match[1]} ${match[2]} ${year}`;
  }
  
  return null;
}

function convertToDate(dateStr) {
  const months = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04",
    MAY: "05", JUN: "06", JUL: "07", AUG: "08",
    SEP: "09", OCT: "10", NOV: "11", DEC: "12"
  };
  
  let year, month, day;
  
  // DD/MM/YYYY
  let match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    day = parseInt(match[1]);
    month = parseInt(match[2]);
    year = parseInt(match[3]);
  }
  
  // YYYY-MM-DD
  if (!match) {
    match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      year = parseInt(match[1]);
      month = parseInt(match[2]);
      day = parseInt(match[3]);
    }
  }
  
  // DD MON YYYY
  if (!match) {
    match = dateStr.match(/^(\d{1,2})\s(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s(\d{4})$/);
    if (match) {
      day = parseInt(match[1]);
      month = parseInt(months[match[2]]);
      year = parseInt(match[3]);
    }
  }
  
  if (!match) {
    throw new Error("Invalid date format");
  }
  
  // Create date and validate it
  const date = new Date(year, month - 1, day);
  
  // Check if the date is valid (JavaScript Date will adjust invalid dates)
  // For example, Feb 29 in non-leap year becomes Mar 1
  if (date.getFullYear() !== year || 
      date.getMonth() !== month - 1 || 
      date.getDate() !== day) {
    throw new Error("Invalid date - date does not exist in calendar");
  }
  
  return date;
}

function isReturnDateValid(departureDate, returnDate) {
  try {
    if (!departureDate || !returnDate) return false;
    const dep = convertToDate(departureDate);
    const ret = convertToDate(returnDate);
    return ret > dep;
  } catch {
    return false;
  }
}

async function getFreeChat(message, history) {
  try {
    const messages = [
      {
        role: "system",
        content: `You are a helpful multilingual travel booking assistant. You help users book flights, hotels, and cars through either Amadeus or Farelogix systems. Be friendly, concise, and professional. If users ask about booking, guide them to start the booking process.`
      },
      ...history.slice(-6),
      { role: "user", content: message }
    ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 200,
      messages
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error("Groq API error:", error);
    return "I'm here to help you book travel. Would you like to book a flight, hotel, or car?";
  }
}

// ===============================
// CHAT ENDPOINT
// ===============================
app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId = "default" } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const state = getSession(sessionId);
    const msg = normalizeInput(message);
    
    state.conversationHistory.push({ role: "user", content: message });

    let reply = "";

    // ===============================
    // PHASE: GREETING
    // ===============================
    if (state.phase === "GREETING") {
      reply = "Hello! 👋 Welcome to the Travel Booking Assistant.\n\nI can help you book:\n• ✈️ Flights\n• 🏨 Hotels\n• 🚗 Cars\n\nWould you like to start a booking?";
      state.phase = "AWAITING_BOOKING_INTENT";
    }

    // ===============================
    // PHASE: AWAITING BOOKING INTENT
    // ===============================
    else if (state.phase === "AWAITING_BOOKING_INTENT") {
      const detectedType = detectBookingType(msg);
      
      if (msg.includes("yes") || msg.includes("book") || msg.includes("start") || detectedType) {
        if (detectedType) {
          state.flow = detectedType;
          state.phase = "AWAITING_SOURCE";
          reply = `Great! Let's book a ${detectedType.toLowerCase()}.\n\nWhich source system would you like to use?\n• Amadeus\n• Farelogix`;
        } else {
          state.phase = "AWAITING_BOOKING_TYPE";
          reply = "Perfect! What would you like to book?\n• Flight ✈️\n• Hotel 🏨\n• Car 🚗";
        }
      } else if (msg.includes("no") || msg.includes("not")) {
        reply = await getFreeChat(message, state.conversationHistory);
      } else {
        reply = await getFreeChat(message, state.conversationHistory);
      }
    }

    // ===============================
    // PHASE: AWAITING BOOKING TYPE
    // ===============================
    else if (state.phase === "AWAITING_BOOKING_TYPE") {
      const bookingType = detectBookingType(msg);
      
      if (bookingType) {
        state.flow = bookingType;
        state.phase = "AWAITING_SOURCE";
        reply = `Great! Let's book a ${bookingType.toLowerCase()}.\n\nWhich source system would you like to use?\n• Amadeus\n• Farelogix`;
      } else {
        reply = "I didn't catch that. Please choose one of the following:\n• Flight ✈️\n• Hotel 🏨\n• Car 🚗";
      }
    }

    // ===============================
    // PHASE: AWAITING SOURCE
    // ===============================
    else if (state.phase === "AWAITING_SOURCE") {
      const source = detectSource(msg);
      
      if (source) {
        state.source = source;
        
        if (state.flow === "FLIGHT") {
          state.phase = "AWAITING_FLIGHT_TYPE";
          reply = "What type of flight would you like to book?\n• One way\n• Round trip";
        } else {
          state.phase = "GUIDED_FLOW";
          state.step = 0;
          const steps = WORKFLOWS[state.flow][state.source];
          reply = `Perfect! I'll guide you through the ${state.flow.toLowerCase()} booking process using ${state.source}.\n\n${steps[0]}\n\n(Reply 'done' or 'next' when completed)`;
        }
      } else {
        reply = "Please select a valid source system:\n• Amadeus\n• Farelogix";
      }
    }

    // ===============================
    // PHASE: AWAITING FLIGHT TYPE
    // ===============================
    else if (state.phase === "AWAITING_FLIGHT_TYPE") {
      const flightType = detectFlightType(msg);
      
      if (flightType) {
        state.flightType = flightType;
        state.phase = "AWAITING_DEPARTURE_DATE";
        
        if (flightType === "ROUND_TRIP") {
          reply = "When would you like to depart?\n\nPlease provide the departure date (e.g., 16/01/2026 or 16 JAN 2026)";
        } else {
          reply = "When would you like to travel?\n\nPlease provide the travel date (e.g., 16/01/2026 or 16 JAN 2026)";
        }
      } else {
        reply = "Please choose a flight type:\n• One way\n• Round trip";
      }
    }

    // ===============================
    // PHASE: AWAITING DEPARTURE DATE
    // ===============================
    else if (state.phase === "AWAITING_DEPARTURE_DATE") {
      const date = parseDate(message);
      
      if (!date) {
        reply = "❌ Invalid date format. Please use one of these formats:\n• DD/MM/YYYY (e.g., 16/01/2026)\n• DD MON YYYY (e.g., 16 JAN 2026)\n• YYYY-MM-DD (e.g., 2026-01-16)";
      } else {
        // Validate that the date exists in the calendar
        try {
          convertToDate(date);
          state.departureDate = date;
          
          if (state.flightType === "ROUND_TRIP") {
            state.phase = "AWAITING_RETURN_DATE";
            reply = "Great! When would you like to return?\n\nPlease provide the return date (e.g., 20/01/2026 or 20 JAN 2026)";
          } else {
            state.phase = "GUIDED_FLOW";
            state.step = 0;
            const steps = WORKFLOWS.FLIGHT[state.source](state.departureDate);
            reply = `Perfect! Let's book a one-way flight using ${state.source} for ${state.departureDate}.\n\n${steps[0]}\n\n(Reply 'done' or 'next' when completed)`;
          }
        } catch (error) {
          reply = "❌ Invalid date! This date does not exist in the calendar. Please provide a valid date.\n\n(e.g., 16/01/2026 or 16 JAN 2026)";
        }
      }
    }

    // ===============================
    // PHASE: AWAITING RETURN DATE
    // ===============================
    else if (state.phase === "AWAITING_RETURN_DATE") {
      const date = parseDate(message);
      
      if (!date) {
        reply = "❌ Invalid date format. Please use one of these formats:\n• DD/MM/YYYY (e.g., 20/01/2026)\n• DD MON YYYY (e.g., 20 JAN 2026)\n• YYYY-MM-DD (e.g., 2026-01-20)";
      } else {
        // First validate that the date exists in the calendar
        try {
          convertToDate(date);
          
          // Then check if return date is after departure date
          if (!isReturnDateValid(state.departureDate, date)) {
            reply = `❌ Invalid date! The return date must be after the departure date (${state.departureDate}).\n\nPlease provide a valid return date.`;
          } else {
            state.returnDate = date;
            state.phase = "GUIDED_FLOW";
            state.step = 0;
            const dateRange = `${state.departureDate} – ${state.returnDate}`;
            const steps = WORKFLOWS.FLIGHT[state.source](dateRange);
            reply = `Perfect! Let's book a round trip flight using ${state.source} for ${dateRange}.\n\n${steps[0]}\n\n(Reply 'done' or 'next' when completed)`;
          }
        } catch (error) {
          reply = "❌ Invalid date! This date does not exist in the calendar. Please provide a valid date.\n\n(e.g., 20/01/2026 or 20 JAN 2026)";
        }
      }
    }

    // ===============================
    // PHASE: GUIDED FLOW
    // ===============================
    else if (state.phase === "GUIDED_FLOW") {
      let steps;
      
      if (state.flow === "FLIGHT") {
        const dateRange = state.returnDate 
          ? `${state.departureDate} – ${state.returnDate}`
          : state.departureDate;
        steps = WORKFLOWS.FLIGHT[state.source](dateRange);
      } else {
        steps = WORKFLOWS[state.flow][state.source];
      }
      
      if (msg.includes("done") || msg.includes("next") || msg.includes("complete") || msg.includes("finish")) {
        state.step++;
        
        if (state.step < steps.length) {
          reply = `${steps[state.step]}\n\n(Reply 'done' or 'next' when completed)`;
        } else {
          reply = `🎉 Congratulations! Your ${state.flow.toLowerCase()} booking is complete!\n\nWould you like to make another booking?`;
          state.phase = "AWAITING_BOOKING_INTENT";
          state.flow = null;
          state.source = null;
          state.flightType = null;
          state.departureDate = null;
          state.returnDate = null;
          state.step = 0;
        }
      } else if (msg.includes("back") || msg.includes("previous")) {
        if (state.step > 0) {
          state.step--;
          reply = `Going back...\n\n${steps[state.step]}\n\n(Reply 'done' or 'next' when completed)`;
        } else {
          reply = `You're at the first step.\n\n${steps[state.step]}\n\n(Reply 'done' or 'next' when completed)`;
        }
      } else if (msg.includes("restart") || msg.includes("start over")) {
        resetSession(sessionId);
        reply = "Booking restarted. Hello! 👋 Welcome to the Travel Booking Assistant.\n\nWould you like to start a new booking?";
      } else {
        reply = `Current step:\n${steps[state.step]}\n\nReply 'done' or 'next' to continue, 'back' to go to the previous step, or 'restart' to start over.`;
      }
    }

    // ===============================
    // FALLBACK
    // ===============================
    else {
      reply = await getFreeChat(message, state.conversationHistory);
    }

    state.conversationHistory.push({ role: "assistant", content: reply });

    res.json({ 
      reply, 
      state: {
        phase: state.phase,
        flow: state.flow,
        source: state.source,
        flightType: state.flightType,
        departureDate: state.departureDate,
        returnDate: state.returnDate,
        step: state.step
      }
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ 
      error: "An error occurred processing your request",
      details: error.message 
    });
  }
});

// ===============================
// RESET SESSION ENDPOINT
// ===============================
app.post("/reset", (req, res) => {
  const { sessionId = "default" } = req.body;
  resetSession(sessionId);
  res.json({ message: "Session reset successfully" });
});

// ===============================
// HEALTH CHECK
// ===============================
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

export default app; 