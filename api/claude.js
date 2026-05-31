// Vercel serverless function to proxy Anthropic API calls
// This solves the CORS issue by making API calls server-side
// Deploy to: api/claude.js in your Vercel project

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, system, image, maxTokens = 1000 } = req.body;

    // Validate inputs
    if (!messages || !system) {
      return res.status(400).json({ error: 'Missing messages or system prompt' });
    }

    // Get API key from environment variable
    const apiKey = process.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('API key not found in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Build the message content
    let content = messages[messages.length - 1].content;
    if (image && typeof content === 'string') {
      content = [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: content }
      ];
    }

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: system,
        messages: [...messages.slice(0, -1), { role: messages[messages.length - 1].role, content }]
      })
    });

    const data = await response.json();

    // Check for API errors
    if (!response.ok) {
      console.error('Anthropic API error:', data);
      return res.status(response.status).json({ 
        error: data.error?.message || 'API request failed',
        status: response.status
      });
    }

    // Extract the response text
    const responseText = data.content?.[0]?.text ?? '';

    return res.status(200).json({ 
      success: true,
      text: responseText,
      usage: data.usage
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      type: error.constructor.name
    });
  }
}
