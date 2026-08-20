/**
 * Email utilities (Nodemailer).
 *
 * Uses EMAIL_USER / EMAIL_PASS from .env (Gmail SMTP by default — adjust
 * `host`/`port` if you use another provider).
 *
 * DEV MODE: if EMAIL_USER / EMAIL_PASS are not configured, emails are NOT sent;
 * they are printed to the server console instead so you can still test the
 * vendor approval/rejection flow (and read the generated password).
 */
const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // TLS via STARTTLS
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});

const isConfigured = () => Boolean(EMAIL_USER && EMAIL_PASS);

/**
 * Low-level send helper.
 * @returns {Promise<{devMode: boolean}>}
 */
async function sendMail({ to, subject, text, html }) {
  if (!isConfigured()) {
    console.log('\n[EMAIL DEV MODE] Email NOT sent (EMAIL_USER/EMAIL_PASS not set).');
    console.log(`  To:      ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body:\n${text}\n`);
    return { devMode: true };
  }
  const info = await transporter.sendMail({
    from: `"Campus Restaurant" <${EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });
  console.log(`[EMAIL] Sent to ${to} (id: ${info.messageId})`);
  return { devMode: false };
}

/**
 * Send the approval email containing the generated plain-text password.
 */
async function sendApprovalEmail(vendorEmail, password, restaurantName) {
  const subject = 'Your Campus Restaurant vendor account has been approved';
  const text = [
    `Hello!`,
    ``,
    `Great news — your restaurant "${restaurantName}" has been approved for the Campus Restaurant platform.`,
    ``,
    `Your vendor login credentials:`,
    `  Email:    ${vendorEmail}`,
    `  Password: ${password}`,
    ``,
    `Please log in to your vendor dashboard and change your password as soon as possible.`,
    ``,
    `Thanks,`,
    `Campus Restaurant Team`,
  ].join('\n');

  return sendMail({
    to: vendorEmail,
    subject,
    text,
    html: text.replace(/\n/g, '<br/>'),
  });
}

/**
 * Send the rejection email including the admin's reason.
 */
async function sendRejectionEmail(vendorEmail, reason, restaurantName) {
  const subject = 'Your Campus Restaurant vendor request was not approved';
  const text = [
    `Hello,`,
    ``,
    `Thank you for applying to join the Campus Restaurant platform.`,
    ``,
    `Unfortunately, your request for "${restaurantName}" was not approved.`,
    ``,
    `Reason given by our team:`,
    `  ${reason || 'No reason provided.'}`,
    ``,
    `You are welcome to re-apply with updated information.`,
    ``,
    `Thanks,`,
    `Campus Restaurant Team`,
  ].join('\n');

  return sendMail({
    to: vendorEmail,
    subject,
    text,
    html: text.replace(/\n/g, '<br/>'),
  });
}

module.exports = { sendApprovalEmail, sendRejectionEmail, isConfigured };