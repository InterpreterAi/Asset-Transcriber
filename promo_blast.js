import { Resend } from 'resend';
import pg from 'pg';

const resend = new Resend(process.env.RESEND_API_KEY);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function runPromo() {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (ip_address) id, email, ip_address 
    FROM users 
    WHERE plan = 'trial' AND status = 'expired'
    ORDER BY ip_address, created_at ASC
  `);

  console.log(`Found ${rows.length} unique expired users. Starting...`);

  for (const user of rows) {
    try {
      await pool.query(`
        UPDATE users 
        SET status = 'active',
            translation_version = 'openai',
            trial_extension_until = NOW() + INTERVAL '3 days',
            daily_limit_minutes = 120
        WHERE id = $1`, [user.id]);

      await resend.emails.send({
        from: 'InterpreterAI <updates@yourdomain.com>',
        to: user.email,
        subject: '🎁 3 Days of InterpreterAI - On Us',
        html: '<h2>Your trial is back!</h2><p>We unlocked your account for 3 days (2 hours/day). We have set your model to <strong>OpenAI</strong> for the best experience. Log in and start transcribing.</p>'
      });
      console.log(`✅ Sent: ${user.email}`);
    } catch (e) { console.error(`❌ Failed: ${user.email}`, e); }
  }
  process.exit();
}
runPromo();
