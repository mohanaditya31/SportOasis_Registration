// Vercel serverless function: validates a registration and forwards it to the
// Google Apps Script web app bound to the registrations Sheet.
//
// Required environment variables (Vercel → Project → Settings → Environment Variables):
//   GOOGLE_SCRIPT_URL  – the Apps Script "Web app" URL ending in /exec
//   SHARED_SECRET      – any long random string; must match SHARED_SECRET in Apps Script

import { validateRegistration } from '../public/shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const { GOOGLE_SCRIPT_URL, SHARED_SECRET } = process.env;
  if (!GOOGLE_SCRIPT_URL || !SHARED_SECRET) {
    console.error('GOOGLE_SCRIPT_URL / SHARED_SECRET not configured');
    return res.status(500).json({ ok: false, error: 'Registration is not configured yet. Please contact the organisers.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid request.' });
  }

  // Honeypot: real users never see or fill this field. Pretend success for bots.
  if (body.website) return res.status(200).json({ ok: true, reference: 'SO-OK' });

  const { data, errors } = validateRegistration(body);
  if (errors.length) return res.status(400).json({ ok: false, error: errors[0], errors });

  try {
    const upstream = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: SHARED_SECRET, registration: data }),
      redirect: 'follow',
    });
    const text = await upstream.text();
    let result;
    try { result = JSON.parse(text); } catch {
      console.error('Non-JSON response from Apps Script:', upstream.status, text.slice(0, 300));
      throw new Error('bad upstream response');
    }
    if (!result.ok) {
      console.error('Apps Script rejected submission:', result.error);
      return res.status(502).json({ ok: false, error: result.error || 'Could not save your registration.' });
    }
    return res.status(200).json({ ok: true, reference: result.reference, duplicate: !!result.duplicate });
  } catch (err) {
    console.error('Forwarding to Apps Script failed:', err);
    return res.status(502).json({ ok: false, error: 'Could not save your registration right now. Please try again in a minute.' });
  }
}
