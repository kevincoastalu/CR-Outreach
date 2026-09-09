import OpenAI from 'openai';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const leads = Array.isArray(body.leads) ? body.leads : [];
    const segment = body.segment || 'privacy litigators and privacy compliance counsel';

    if (!leads.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No leads provided' }) };
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
      Write 3 short outreach variants for a privacy-focused legal audience.
      Audience: ${segment}
      Company: CyRisk
      Product: Insight Engine
      Goal: Get a reply from lawyers with interest in privacy litigation, privacy compliance, or data-security risk.
      CTA: Reply with a domain or matter they want checked.
      Tone: concise, credible, non-pushy, professional.
      Avoid: spammy language, exaggerated claims, scheduling links.
      Return valid JSON with keys: subject1, body1, subject2, body2, subject3, body3.
    `;

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a B2B outbound copywriter for privacy-risk software.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    });

    const content = completion.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    return {
      statusCode: 200,
      body: JSON.stringify({ variants: parsed, count: leads.length })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Unexpected error' })
    };
  }
};
