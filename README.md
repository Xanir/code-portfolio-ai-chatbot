# code-portfolio-ai-chatbot

Chatbot for code portfolio to answer interview style questions. It acts as a professional career assistant for Enzey based on provided resume data files, utilizing an Ollama instance to generate responses.

## Getting Started

1. Ensure you have Node.js installed.
2. Clone the repository and navigate to the project directory.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```

The project starts on port **8080** by default.

## Environment Variables

You can configure the server using the following environment variables:

* **`PORT`**: The port the server listens on. (Default: `8080`)
* **`OLLAMA_URL`**: The URL of your local or remote Ollama instance. (Default: `http://localhost:11434`)
* **`OLLAMA_MODEL`**: The name of the model in Ollama to use. (Default: `llama3`)
* **`RESUME_DIR`**: The directory path containing `.txt` files with the resume/portfolio data to feed to the model. (Default: `<project_root>/data`)

## API Endpoints

### POST `/chat`

Used to ask the AI assistant questions about Enzey's portfolio or career.

**Expected Request Payload Format:**
```json
{
  "question": "What is your software engineering experience?"
}
```

**Expected Response Payload Format:**
```json
{
  "answer": "Based on Enzey's resume, they have extensive experience..."
}
```

### Possible Error Codes and Responses

* **`400 Bad Request`**
  * **Response**: `{ "error": "Unable to determine client IP address." }`
    * **Why**: The server could not deduce the IP address from the incoming request or socket.
  * **Response**: `{ "error": "A non-empty \"question\" field is required." }`
    * **Why**: The request payload is missing the `question` field, it's not a string, or it is empty/only whitespace.
  * **Response**: `{ "error": "Your input contains disallowed content. Please ask about the portfolio." }`
    * **Why**: The user input matched recognizable "jailbreak" patterns attempting to alter or ignore the system prompt constraints.

* **`429 Too Many Requests`**
  * **Response**: `{ "error": "Too many requests, please try again later." }`
    * **Why**: The requester's IP address breached the rate limit of a maximum of 5 requests per minute.
  * **Response**: `{ "error": "You already have a pending request. Please wait for it to complete." }`
    * **Why**: The requester's IP address already has an unresolved question continuously processing in the queue.

* **`503 Service Unavailable`**
  * **Response**: `{ "error": "Service Unavailable: Cannot connect to the AI service." }`
    * **Why**: The connection to the underlying Ollama server was closed unexpectedly or a connection could not be established at all.

* **`502 Bad Gateway`**
  * **Response**: `{ "error": "Failed to get a response from the AI service." }`
    * **Why**: The application successfully connected but failed to get a valid response from the AI service (e.g., providing an unexpected response payload).

