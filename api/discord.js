
const API = 'https://discord.com/api/v10';

const ALLOWED = {
  guild:    () => `/guilds/${process.env.DISCORD_GUILD_ID}?with_counts=true`,
  invites:  () => `/guilds/${process.env.DISCORD_GUILD_ID}/invites`,
  channels: () => `/guilds/${process.env.DISCORD_GUILD_ID}/channels`,
  members:  () => `/guilds/${process.env.DISCORD_GUILD_ID}/members?limit=1000`,
  messages: (q) => {
    if (!/^\d{5,25}$/.test(q.channel || '')) return null;
    const after = /^\d{5,25}$/.test(q.after || '') ? `&after=${q.after}` : '';
    return `/channels/${q.channel}/messages?limit=100${after}`;
  }
};

export default async function handler(req, res) {
  const expected = process.env.RELAY_SECRET;

  if (!expected || expected.length < 12) {
    console.error('RELAY_SECRET missing or too short — refusing all requests.');
    return res.status(503).json({ error: 'relay not configured' });
  }

  const given = req.headers['x-relay-secret'] || req.query.secret;
  if (given !== expected) {
    return res.status(401).json({ error: 'bad secret' });
  }

  const build = ALLOWED[req.query.path];
  if (!build) return res.status(400).json({ error: 'path not allowed' });

  const target = build(req.query);
  if (!target) return res.status(400).json({ error: 'bad parameters' });

  try {
    const r = await fetch(API + target, {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
        'User-Agent': 'DiscordBot (https://logoutlounge.club, 1.0)'
      }
    });

    const body = await r.text();
    if (!r.ok) {
      console.warn(`Discord ${r.status} on ${target}: ${body.slice(0, 200)}`);
      return res.status(r.status).json({ error: 'discord refused', status: r.status });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(body);   // pass Discord's JSON straight through

  } catch (err) {
    console.error('Relay failed:', err);
    return res.status(502).json({ error: 'relay failed' });
  }
}
