'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const { SYSTEM_PROMPT_FIRST_PERSON, SYSTEM_PROMPT_THIRD_PERSON } = require('./systemPrompts');

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 8080;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

// ---------------------------------------------------------------------------
// Input sanitization helpers
// ---------------------------------------------------------------------------
const JAILBREAK_PATTERNS = [
  /(ignore|forget|disregard|override)\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)/i,
  /system\s*prompt/i,
  /change\s+your\s+(persona|role|identity)/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /you\s+are\s+now\s+/i,
  /jailbreak/i,
  /DAN\b/,
];

/**
 * Returns true when the input contains a known jailbreak phrase.
 */
function containsJailbreak(input) {
  return JAILBREAK_PATTERNS.some((re) => re.test(input));
}

/**
 * Wrap the user's raw input in delimiters so the model can clearly distinguish
 * instructions from user-supplied data.
 */
function wrapUserInput(input) {
  return `### USER INPUT START ###\n${input}\n### USER INPUT END ###`;
}

// ---------------------------------------------------------------------------
// In-memory request queue and per-IP pending tracking
// ---------------------------------------------------------------------------

/**
 * pendingByIp – Set of client IP addresses that currently have an in-flight
 * request waiting for an Ollama response.
 */
const pendingByIp = new Set();

/**
 * queue – Array of pending work items:
 *   { ip, question, resolve, reject, aborted }
 * Processing is sequential; the queue is drained one item at a time.
 */
const queue = [];
let processingQueue = false;

/**
 * Enqueue a request and return both the promise and the queue item.
 * The caller can mark the item as aborted on client disconnect.
 */
function enqueueRequest(ip, question) {
  let queueItem;
  const promise = new Promise((resolve, reject) => {
    queueItem = { ip, question, resolve, reject, aborted: false };
    queue.push(queueItem);
    drainQueue();
  });
  return { promise, queueItem };
}

async function drainQueue() {
  if (processingQueue) return;
  processingQueue = true;

  while (queue.length > 0) {
    const item = queue[0];

    if (item.aborted) {
      // Remove aborted items and release the IP slot without calling Ollama.
      queue.shift();
      pendingByIp.delete(item.ip);
      continue;
    }

    try {
      const answer = await queryOllama(item.question);
      if (!item.aborted) {
        item.resolve(answer);
      }
    } catch (err) {
      if (!item.aborted) {
        item.reject(err);
      }
    } finally {
      queue.shift();
      pendingByIp.delete(item.ip);
    }
  }

  processingQueue = false;
}

// ---------------------------------------------------------------------------
// Ollama integration
// ---------------------------------------------------------------------------
async function queryOllama(question) {
  const response = await axios.post(
    `${OLLAMA_URL}/api/chat`,
    {
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_FIRST_PERSON },
        { role: 'user', content: wrapUserInput(question) },
      ],
    },
    { timeout: 120_000 },
  );

  // Ollama /api/chat returns { message: { role, content }, ... }
  const content = response.data?.message?.content;
  if (!content) {
    throw new Error('Unexpected response format from Ollama');
  }
  return content;
}

// ---------------------------------------------------------------------------
// Rate limiter – 5 requests per minute per IP
// ---------------------------------------------------------------------------
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Chat endpoint
app.post('/chat', limiter, async (req, res) => {
  const clientIp = req.ip || req.socket?.remoteAddress;

  if (!clientIp) {
    return res.status(400).json({ error: 'Unable to determine client IP address.' });
  }
  const { question } = req.body || {};

  // Validate input
  if (!question || typeof question !== 'string' || question.trim() === '') {
    return res.status(400).json({ error: 'A non-empty "question" field is required.' });
  }

  const trimmed = question.trim();

  // Block jailbreak attempts before they reach the LLM
  if (containsJailbreak(trimmed)) {
    return res
      .status(400)
      .json({ error: 'Your input contains disallowed content. Please ask about the portfolio.' });
  }

  // Reject if this IP already has a pending request
  if (pendingByIp.has(clientIp)) {
    return res.status(429).json({
      error: 'You already have a pending request. Please wait for it to complete.',
    });
  }

  // Register the IP as having a pending request
  pendingByIp.add(clientIp);

  // Enqueue the request and keep the HTTP connection open
  const { promise, queueItem } = enqueueRequest(clientIp, trimmed);

  // If the client disconnects, mark the queued item as aborted
  req.on('close', () => {
    if (!res.headersSent) {
      queueItem.aborted = true;
      pendingByIp.delete(clientIp);
    }
  });

  try {
    const answer = await promise;
    // Only send if the client is still connected
    if (!res.headersSent) {
      res.json({ answer });
    }
  } catch (err) {
    if (!res.headersSent) {
      console.error('Ollama error:', err.message);
      const connectionErrors = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EPIPE'];
      if (connectionErrors.includes(err.code) || err.message.toLowerCase().includes('socket closed')) {
        res.status(503).json({ error: 'Service Unavailable: Cannot connect to the AI service.' });
      } else {
        res.status(502).json({ error: 'Failed to get a response from the AI service.' });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`AI Chatbot server listening on port ${PORT}`);
    console.log(`Ollama URL: ${OLLAMA_URL}`);
  });
}

module.exports = { app, containsJailbreak, wrapUserInput };
