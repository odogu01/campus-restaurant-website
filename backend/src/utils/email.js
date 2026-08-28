/**
 * Email utility — Gmail SMTP via Nodemailer.
 *
 * Requires these environment variables (see .env.example):
 *   EMAIL_HOST=smtp.gmail.com
 *   EMAIL_PORT=465
 *   EMAIL_SECURE=true
 *   EMAIL_USER=pitchpros14@gmail.com
 *   EMAIL_PASS=icqi qyhn qpkm jpgh
 *   EMAIL_FROM="Campus Bites <pitchpros14@gmail.com>"
 *   FRONTEND_URL=http://localhost:5000
 */
const nodemailer = require('nodemailer');

const {
  EMAIL_HOST = 'smtp.gmail.com',
  EMAIL_PORT = 465,
  EMAIL_SECURE = 'true',
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_FROM = 'Campus Bites <pitchpros14@gmail.com>',
  FRONTEND_URL = 'http://localhost:5000',
} = process.env;

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!EMAIL_USER || !EMAIL_PASS) {
      throw new Error('EMAIL_USER and EMAIL_PASS must be set in .env');
    }
    transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: Number(EMAIL_PORT),
      secure: EMAIL_SECURE === 'true',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS.replace(/\s+/g, ''), // remove spaces from app password
      },
    });
  }
  return transporter;
}

/**
 * Send an email.
 * @param {Object} opts
 * @param {string} opts.to - Recipient email
 * @param {string} opts.subject - Subject line
 * @param {string} opts.html - HTML body
 * @param {string} [opts.text] - Plain text fallback
 * @returns {Promise<Object>} Nodemailer info object
 */
async function sendMail({ to, subject, html, text }) {
  const tx = getTransporter();
  return tx.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
  });
}

/**
 * Verify SMTP connection (call on startup).
 */
async function verifyConnection() {
  const tx = getTransporter();
  return tx.verify();
}

/* ================================================================
 * Template helpers
 * ================================================================ */

const baseStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; }
  .container { max-width: 600px; margin: 0 auto; padding: 24px; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
  .header { background: #f59e0b; color: #fff; padding: 24px; text-align: center; }
  .header h1 { margin: 0; font-size: 24px; }
  .content { padding: 24px; }
  .btn { display: inline-block; background: #f59e0b; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
  .footer { text-align: center; padding: 16px; color: #6b7280; font-size: 12px; }
  .code { background: #f3f4f6; padding: 12px 16px; border-radius: 8px; font-family: monospace; font-size: 18px; letter-spacing: 2px; text-align: center; margin: 16px 0; }
  .divider { border-top: 1px solid #e5e7eb; margin: 24px 0; }
`;

function wrap(template) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;background:#f9fafb;">${baseStyles}<div class="container"><div class="card">${template}</div></div></body></html>`;
}

/**
 * Vendor approval email — sends temporary password.
 */
function vendorApprovalEmail({ vendorName, vendorEmail, devPassword, loginUrl }) {
  return {
    subject: '🎉 Your Campus Bites vendor account is approved!',
    html: wrap(`
      <div class="header"><h1>Welcome to Campus Bites!</h1></div>
      <div class="content">
        <p>Hi <strong>${vendorName}</strong>,</p>
        <p>Your vendor application has been <strong>approved</strong>. You can now log in and start managing your restaurant.</p>
        <p>Your temporary password:</p>
        <div class="code">${devPassword}</div>
        <p style="text-align:center;">
          <a href="${loginUrl}" class="btn">Log in now</a>
        </div>
        <div class="divider"></div>
        <p style="font-size:14px;color:#6b7280;">
          <strong>Important:</strong> Please change your password immediately after first login.
          You can do this from your dashboard.
        </p>
      </div>
      <div class="footer">
        Campus Bites · <a href="${FRONTEND_URL}" style="color:#f59e0b;">${FRONTEND_URL}</a>
      </div>
    `),
  };
}

/**
 * Vendor rejection email.
 */
function vendorRejectionEmail({ vendorName, restaurantName, adminComment }) {
  return {
    subject: '❌ Your Campus Bites vendor application was not approved',
    html: wrap(`
      <div class="header" style="background:#ef4444;"><h1>Application Update</h1></div>
      <div class="content">
        <p>Hi <strong>${vendorName}</strong>,</p>
        <p>Thank you for applying to sell on Campus Bites. After review, we're unable to approve your application for <strong>${restaurantName}</strong> at this time.</p>
        <p>Admin note:</p>
        <div class="code" style="background:#fef2f2;color:#991b1b;">${adminComment}</div>
        <p>If you believe this was a mistake or would like to reapply with changes, please contact us.</p>
      </div>
      <div class="footer">
        Campus Bites · <a href="${FRONTEND_URL}" style="color:#f59e0b;">${FRONTEND_URL}</a>
      </div>
    `),
  };
}

/**
 * Vendor approval email — sends temporary password.
 */
function vendorApprovalEmail({ vendorName, vendorEmail, devPassword, loginUrl }) {
  return {
    subject: '🎉 Your Campus Bites vendor account is approved!',
    html: wrap(`
      <div class="header"><h1>Welcome to Campus Bites!</h1></div>
      <div class="content">
        <p>Hi <strong>${vendorName}</strong>,</p>
        <p>Your vendor application has been <strong>approved</strong>. You can now log in and start managing your restaurant.</p>
        <p>Your temporary password:</p>
        <div class="code">${devPassword}</div>
        <p style="text-align:center;">
          <a href="${loginUrl}" class="btn">Log in now</a>
        </div>
        <div class="divider"></div>
        <p style="font-size:14px;color:#6b7280;">
          <strong>Important:</strong> Please change your password immediately after first login.
          You can do this from your dashboard.
        </p>
      </div>
      <div class="footer">
        Campus Bites · <a href="${FRONTEND_URL}" style="color:#f59e0b;">${FRONTEND_URL}</a>
      </div>
    `),
  };
}

/**
 * Password reset email.
 */
function passwordResetEmail({ userName, userEmail, resetUrl, expiresHours = 1 }) {
  return {
    subject: '🔐 Reset your Campus Bites password',
    html: wrap(`
      <div class="header"><h1>Password Reset</h1></div>
      <div class="content">
        <p>Hi <strong>${userName}</strong>,</p>
        <p>You requested a password reset. Click the button below to set a new password:</p>
        <p style="text-align:center;">
          <a href="${resetUrl}" class="btn">Reset Password</a>
        </p>
        <p style="font-size:14px;color:#6b7280;">
          This link expires in <strong>${expiresHours} hour${expiresHours > 1 ? 's' : ''}</strong>.
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
      <div class="footer">
        Campus Bites · <a href="${FRONTEND_URL}" style="color:#f59e0b;">${FRONTEND_URL}</a>
      </div>
    `),
  };
}

/**
 * Order confirmation (customer).
 */
function orderConfirmationEmail({ customerName, orderId, restaurantName, items, total, orderType, deliveryAddress, orderUrl }) {
  const itemsHtml = items.map((i) =>
    `<tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${i.qty} × ${i.name}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">₦${Number(i.price * i.qty).toFixed(2)}</td>
    </tr>`
  ).join('');

  return {
    subject: `✅ Order #${orderId} confirmed — ${restaurantName}`,
    html: wrap(`
      <div class="header"><h1>Order Confirmed</h1></div>
      <div class="content">
        <p>Hi <strong>${customerName}</strong>,</p>
        <p>Your order has been received and is <strong>awaiting vendor acceptance</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;">Item</th>
              <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb;">Price</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <p style="font-size:18px;font-weight:700;text-align:right;color:#f59e0b;">Total: ₦${Number(total).toFixed(2)}</p>
        <div class="divider"></div>
        <p><strong>Order type:</strong> ${orderType}${orderType === 'delivery' && deliveryAddress ? ` (📍 ${deliveryAddress})` : ''}</p>
        <p style="text-align:center;">
          <a href="${orderUrl}" class="btn">Track Order</a>
        </p>
      </div>
      <div class="footer">
        Campus Bites · <a href="${FRONTEND_URL}" style="color:#f59e0b;">${FRONTEND_URL}</a>
      </div>
    `),
  };
}

/**
 * New order notification (vendor).
 */
function newOrderVendorEmail({ vendorName, orderId, customerName, customerPhone, items, total, orderType, deliveryAddress, orderUrl }) {
  const itemsHtml = items.map((i) =>
    `<tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${i.qty} × ${i.name}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">₦${Number(i.price * i.qty).toFixed(2)}</td>
    </tr>`
  ).join('');

  return {
    subject: `🔔 New order #${orderId} — ${customerName}`,
    html: wrap(`
      <div class="header"><h1>New Order Received</h1></div>
      <div class="content">
        <p>Hi <strong>${vendorName}</strong>,</p>
        <p>You have a new order from <strong>${customerName}</strong> (${customerPhone || 'no phone'}).</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;">Item</th>
              <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb;">Price</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <p style="font-size:18px;font-weight:700;text-align:right;color:#f59e0b;">Total: ₦${Number(total).toFixed(2)}</p>
        <div class="divider"></div>
        <p><strong>Order type:</strong> ${orderType}${orderType === 'delivery' && deliveryAddress ? ` (📍 ${deliveryAddress})` : ''}</p>
        <p style="text-align:center;">
          <a href="${orderUrl}" class="btn">View Order</a>
        </p>
        <p style="font-size:14px;color:#6b7280;">Log in to your vendor dashboard to accept this order.</p>
      </div>
      <div class="footer">
        Campus Bites · <a href="${FRONTEND_URL}" style="color:#f59e0b;">${FRONTEND_URL}</a>
      </div>
    `),
  };
}

/**
 * Order status update (customer).
 */
function orderStatusEmail({ customerName, orderId, restaurantName, status, orderUrl }) {
  const statusLabels = {
    pending: 'awaiting vendor acceptance',
    preparing: 'being prepared',
    ready_for_pickup: 'ready for pickup',
    delivered: 'delivered',
    cancelled: 'cancelled',
  };
  const label = statusLabels[status] || status;

  return {
    subject: `📦 Order #${orderId} update — ${label}`,
    html: wrap(`
      <div class="header"><h1>Order Update</h1></div>
      <div class="content">
        <p>Hi <strong>${customerName}</strong>,</p>
        <p>Your order <strong>#${orderId}</strong> from <strong>${restaurantName}</strong> is now <strong>${label}</strong>.</p>
        <p style="text-align:center;">
          <a href="${orderUrl}" class="btn">View Order</a>
        </p>
      </div>
      <div class="footer">
        Campus Bites · <a href="${FRONTEND_URL}" style="color:#f59e0b;">${FRONTEND_URL}</a>
      </div>
    `),
  };
}

module.exports = {
  sendMail,
  verifyConnection,
  vendorApprovalEmail,
  vendorRejectionEmail,
  passwordResetEmail,
  orderConfirmationEmail,
  newOrderVendorEmail,
  orderStatusEmail,
  isConfigured: () => Boolean(EMAIL_USER && EMAIL_PASS),
};